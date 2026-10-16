import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const emitForGM = vi.fn()
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: (...args) => emitForGM(...args),
  },
}))
vi.mock('../modules/interface/shop.js', () => ({
  SR5Shop: {
    gradedPrice: system => system.price.base
  },
}))

const {
  requestRegister, registerOrders, registerAwaitingOrders, orderLedger, AWAITS_LEDGER_FLAG
} = await import('../modules/interface/shop-orders.js')

// Review P4 (Aldric): a purchase made with no GM connected was paid and ordered, but the shop said "n'a pas été
// appliquée", and the order never entered the GM's ledger, even once he was back: its cancellation refunded 0 ¥.
// The debit now keeps its orders until a GM comes back, and he enters them then
const gm = {
  id: 'gm', isGM: true, active: true
}
const owner = {
  id: 'owner', isGM: false, active: true
}

let settings, serial = 0
function makeDebit(createdTime) {
  const debit = {
    id: 'debit', type: 'itemNuyen', flags: {
      sr5: {
      }
    }, _stats: {
      createdTime
    }, system: {
      type: 'loss', amount: 300
    },
  }
  debit.setFlag = vi.fn(async (_scope, key, value) => {
    debit.flags.sr5[key] = value
  })
  debit.unsetFlag = vi.fn(async (_scope, key) => {
    delete debit.flags.sr5[key]
  })
  return debit
}
function makeBuyer(createdTime = Date.now()) {
  const debit = makeDebit(createdTime)
  // A Foundry collection: a map whose iteration gives its documents
  const items = new Map([['debit', debit]])
  items[Symbol.iterator] = () => items.values()
  return {
    uuid: `Actor.buyer${++serial}`, items, getFlag: () => [order],
    testUserPermission: user => user.isGM || user.id === 'owner', debit,
  }
}
const order = {
  id: 'o1', uuid: 'Compendium.x.Item.cheap', name: 'Dérivateur', quantity: 3, paid: 300, express: false,
}

function connect(users, me) {
  game.user = me
  game.users = {
    activeGM: users.find(u => u.isGM && u.active) ?? null,
    find: fn => users.find(fn),
    get: id => users.find(u => u.id === id),
  }
}

beforeEach(() => {
  emitForGM.mockClear()
  settings = {
  }
  game.settings = {
    get: (_s, key) => settings[key] ?? {
    },
    set: async (_s, key, value) => {
      settings[key] = value
    },
  }
  game.i18n.localize = vi.fn(k => k)
  ui.notifications = {
    info: vi.fn(), warn: vi.fn()
  }
  globalThis.fromUuid = async uuid => uuid === 'Compendium.x.Item.cheap' ? {
    system: {
      price: {
        base: 100
      }
    }
  } : null
})

describe('a purchase made while no GM is connected', () => {
  it('keeps its orders on its debit and says so, without the "not applied" warning', async () => {
    connect([owner], owner)
    const buyer = makeBuyer()
    await requestRegister(buyer, [order], 'debit')
    expect(buyer.debit.flags.sr5[AWAITS_LEDGER_FLAG]).toEqual(['o1'])
    expect(emitForGM).not.toHaveBeenCalled()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.ShopOrderAwaitsGM')
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('still asks the GM at once when one is connected', async () => {
    connect([gm, owner], owner)
    const buyer = makeBuyer()
    await requestRegister(buyer, [order], 'debit')
    expect(emitForGM).toHaveBeenCalledTimes(1)
    expect(buyer.debit.flags.sr5[AWAITS_LEDGER_FLAG]).toBeUndefined()
  })

  it('enters the ledger when the GM comes back, hours later, and is not asked again', async () => {
    const buyer = makeBuyer(Date.now() - 5 * 3600 * 1000)
    buyer.debit.flags.sr5[AWAITS_LEDGER_FLAG] = ['o1']
    connect([gm, owner], gm)
    game.actors = [buyer]
    await registerAwaitingOrders()
    expect(orderLedger().o1).toMatchObject({
      paid: 300, actorUuid: buyer.uuid, transactionId: 'debit'
    })
    expect(buyer.debit.flags.sr5[AWAITS_LEDGER_FLAG]).toBeUndefined()
  })

  it('an old debit that keeps no such order still stands behind nothing', async () => {
    const buyer = makeBuyer(Date.now() - 5 * 3600 * 1000)
    connect([gm, owner], gm)
    expect(await registerOrders(buyer, ['o1'], 'debit', gm, {
      deferred: true
    })).toBe(false)
    expect(orderLedger().o1).toBeUndefined()
  })
})
