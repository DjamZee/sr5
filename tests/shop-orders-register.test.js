import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))
vi.mock('../modules/interface/shop.js', () => ({
  SR5Shop: {
    gradedPrice: system => system.price.base
  },
}))

const {
  registerOrders, registrationPlan, cancelPlan, orderLedger, deliverOrder, debitLeft, cancelOrder
} = await import('../modules/interface/shop-orders.js')

// Élise's ruling after Zélia's review: an order of the shop without vendor enters the GM's ledger at
// the purchase, priced by the GM from the catalogue's item and within the buyer's debit, so that a
// cancellation refunds it again, and a forged order still refunds nothing
const gm = {
  id: 'gm', isGM: true
}
const owner = {
  id: 'owner', isGM: false
}
const stranger = {
  id: 'stranger', isGM: false
}

let settings, buyer, serial = 0
function makeBuyer(orders, debitAmount, createdTime = Date.now()) {
  const items = new Map([['debit', {
    id: 'debit', type: 'itemNuyen', _stats: {
      createdTime
    }, system: {
      type: 'loss', amount: debitAmount
    }
  }]])
  return {
    uuid: `Actor.buyer${++serial}`, items, getFlag: () => orders,
    testUserPermission: user => user.isGM || user.id === 'owner',
  }
}

beforeEach(() => {
  settings = {
  }
  game.user = gm
  game.users = {
    activeGM: gm, get: id => ({
      gm, owner, stranger
    })[id]
  }
  game.settings = {
    get: (_s, key) => settings[key] ?? {
    },
    set: async (_s, key, value) => {
      settings[key] = value
    },
  }
  globalThis.fromUuid = async uuid => uuid === 'Compendium.x.Item.cheap' ? {
    system: {
      price: {
        base: 100
      }
    }
  } : null
})

const order = (over = {
}) => ({
  id: 'o1', uuid: 'Compendium.x.Item.cheap', name: 'Dérivateur', quantity: 3, paid: 300, express: false, ...over,
})

describe('an order of the shop without vendor', () => {
  it('enters the ledger at the price the GM works out, and is refunded again', async () => {
    buyer = makeBuyer([order({
      paid: 999999
    })], 300)
    expect(await registerOrders(buyer, ['o1'], 'debit', owner)).toBe(true)
    const entry = orderLedger().o1
    expect(entry).toMatchObject({
      paid: 300, quantity: 3, actorUuid: buyer.uuid, vendorUuid: null
    })
    expect(cancelPlan(order(), entry).refund).toBe(300)
  })

  it('a forged order of 1000 pieces is refused: it was never paid', async () => {
    buyer = makeBuyer([order({
      quantity: 1000, paid: 100000
    })], 300)
    expect(await registerOrders(buyer, ['o1'], 'debit', owner)).toBe(false)
    expect(orderLedger().o1).toBeUndefined()
  })

  it('is entered once: the same debit stands behind nothing more', async () => {
    buyer = makeBuyer([order(), order({
      id: 'o2', quantity: 1
    })], 1000)
    expect(await registerOrders(buyer, ['o1'], 'debit', owner)).toBe(true)
    expect(await registerOrders(buyer, ['o2'], 'debit', owner)).toBe(false)
  })

  // Measured in game: once the order was cancelled, its entry left the ledger, and the same debit
  // entered a forged order again, refunded a second time
  it('a debit used once stays used after the order is cancelled', async () => {
    buyer = makeBuyer([order(), order({
      id: 'o2'
    })], 300)
    expect(await registerOrders(buyer, ['o1'], 'debit', owner)).toBe(true)
    // the cancellation drops the entry
    settings.sr5ShopOrderLedger = {
    }
    expect(await registerOrders(buyer, ['o2'], 'debit', owner)).toBe(false)
    expect(orderLedger().o2).toBeUndefined()
  })

  it('an old debit, from an earlier purchase, stands behind nothing', async () => {
    buyer = makeBuyer([order()], 300, Date.now() - 24 * 3600 * 1000)
    expect(await registerOrders(buyer, ['o1'], 'debit', owner)).toBe(false)
  })

  it('is refused for someone who does not own the buyer, or without a debit', async () => {
    buyer = makeBuyer([order()], 300)
    expect(await registerOrders(buyer, ['o1'], 'debit', stranger)).toBe(false)
    expect(await registerOrders(buyer, ['o1'], 'nothing', owner)).toBe(false)
  })

  // Georg: the debit is the buyer's own item; deleted after the entry, the cancellation would hand
  // her back money she no longer paid
  it('refunds nothing once the buyer has deleted the debit behind the entry', async () => {
    buyer = makeBuyer([order()], 300)
    expect(await registerOrders(buyer, ['o1'], 'debit', owner)).toBe(true)
    const entry = orderLedger().o1
    expect(cancelPlan(order(), entry, 0, debitLeft(buyer, entry)).refund).toBe(300)
    buyer.items.delete('debit')
    expect(debitLeft(buyer, entry)).toBe(0)
    expect(cancelPlan(order(), entry, 0, debitLeft(buyer, entry)).refund).toBe(0)
    // A debit lowered on the sheet refunds no more than what is left of it
    buyer.items.set('debit', {
      id: 'debit', type: 'itemNuyen', system: {
        type: 'loss', amount: 50
      }
    })
    expect(cancelPlan(order(), entry, 0, debitLeft(buyer, entry)).refund).toBe(50)
    // An entry without a debit of its own (the vendor's till) is not checked this way
    expect(debitLeft(buyer, {
      ...entry, transactionId: undefined
    })).toBe(null)
  })

  // Petra: a GM who is not the active one refunded from the ledger, but could not drop the entry; the
  // order id written again on the sheet was then refunded a second time by the active GM
  it('is cancelled by the active GM only, who alone drops the ledger entry', async () => {
    buyer = makeBuyer([order()], 300)
    expect(await registerOrders(buyer, ['o1'], 'debit', owner)).toBe(true)
    const otherGM = {
      id: 'gm2', isGM: true
    }
    game.user = otherGM
    const warn = vi.fn()
    globalThis.ui = {
      notifications: {
        warn, info: () => {}
      }
    }
    buyer.setFlag = vi.fn()
    buyer.createEmbeddedDocuments = vi.fn()
    expect(await cancelOrder(buyer, 'o1')).toBe(false)
    expect(buyer.createEmbeddedDocuments).not.toHaveBeenCalled()
    expect(buyer.setFlag).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('SR5.ShopOrderCancelActiveGMOnly')
    expect(orderLedger().o1).toBeDefined()
  })

  it('the plan refuses a purchase dearer than its debit', () => {
    expect(registrationPlan([{
      order: order(), paid: 400
    }], 300, 'Actor.buyer', 'debit')).toBe(null)
  })
})

// A second GM delivered an order: the order left the sheet, its ledger entry stayed behind (security pass, Petra)
describe('an order delivered by a GM who is not the active one', () => {
  it('is not delivered: the order stays on the sheet and in the ledger', async () => {
    const second = {
      id: 'gm2', isGM: true
    }
    game.user = second
    const warn = vi.spyOn(ui.notifications, 'warn').mockImplementation(() => {})
    const setFlag = vi.fn()
    const createEmbeddedDocuments = vi.fn()
    buyer = {
      ...makeBuyer([order()], 300), setFlag, createEmbeddedDocuments
    }
    expect(await deliverOrder(buyer, 'o1')).toBe(false)
    expect(warn).toHaveBeenCalledWith('SR5.ShopOrderActiveGMOnly')
    expect(setFlag).not.toHaveBeenCalled()
    expect(createEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
