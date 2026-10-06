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
  registerOrders, registrationPlan, cancelPlan, orderLedger
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

let settings, buyer
function makeBuyer(orders, debitAmount) {
  const items = new Map([['debit', {
    id: 'debit', type: 'itemNuyen', system: {
      type: 'loss', amount: debitAmount
    }
  }]])
  return {
    uuid: 'Actor.buyer', items, getFlag: () => orders,
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
      paid: 300, quantity: 3, actorUuid: 'Actor.buyer', vendorUuid: null
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

  it('is refused for someone who does not own the buyer, or without a debit', async () => {
    buyer = makeBuyer([order()], 300)
    expect(await registerOrders(buyer, ['o1'], 'debit', stranger)).toBe(false)
    expect(await registerOrders(buyer, ['o1'], 'nothing', owner)).toBe(false)
  })

  it('the plan refuses a purchase dearer than its debit', () => {
    expect(registrationPlan([{
      order: order(), paid: 400
    }], 300, 'Actor.buyer', 'debit')).toBe(null)
  })
})
