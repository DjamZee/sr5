import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Relation avec un concessionnaire (Rigger 5.0 p. 37, lot R11) takes 10 % off a vehicle at the till. The GM's ledger
// priced the order at the catalogue's full price, above what the buyer was debited: an honest purchase was never
// entered, and its cancellation said "Absente du registre du MJ" (found by Honorine, lot R9)
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
  registerOrders, orderLedger
} = await import('../modules/interface/shop-orders.js')

const gm = {
  id: 'gm', isGM: true
}
const quality = {
  type: 'itemQuality', system: {
    isActive: true, systemEffects: [{
      value: 'riggerDealerDrone'
    }]
  }
}
let settings, serial = 0
function rigger(debitAmount, qualities = [quality]) {
  const items = new Map([['debit', {
    id: 'debit', type: 'itemNuyen', _stats: {
      createdTime: Date.now()
    }, system: {
      type: 'loss', amount: debitAmount
    }
  }], ...qualities.map((q, i) => [`q${i}`, q])])
  return {
    uuid: `Actor.rigger${++serial}`, items, testUserPermission: () => true,
    getFlag: () => [{
      id: 'o1', uuid: 'Compendium.x.Item.doberman', name: 'Doberman', quantity: 1, paid: debitAmount, express: false,
    }],
  }
}

beforeEach(() => {
  settings = {
  }
  game.user = gm
  game.users = {
    activeGM: gm, get: () => gm
  }
  game.settings = {
    get: (_s, key) => settings[key] ?? {
    },
    set: async (_s, key, value) => {
      settings[key] = value
    },
  }
  globalThis.fromUuid = async uuid => uuid === 'Compendium.x.Item.doberman' ? {
    type: 'itemVehicle', system: {
      type: 'drone', price: {
        base: 5000
      }
    }
  } : null
})

describe("Relation avec un concessionnaire in the GM's ledger", () => {
  it('a drone ordered with the relation is entered at the price paid, 10 % off', async () => {
    expect(await registerOrders(rigger(4500), ['o1'], 'debit', gm)).toBe(true)
    expect(orderLedger().o1).toMatchObject({
      paid: 4500
    })
  })

  it('without the relation, the full price stays the ceiling: a debit of 4 500 ¥ does not stand behind it', async () => {
    expect(await registerOrders(rigger(4500, []), ['o1'], 'debit', gm)).toBe(false)
  })
})
