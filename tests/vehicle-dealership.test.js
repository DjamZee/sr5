import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// The dealership (lot R9 of the rigging plan): a vehicle and its mods built, then bought whole at the shop's till
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async () => {}, emitForPlayer: async () => {}
  }
}))
// A mod's price on a vehicle: twice its catalogue price here, the multiplier being the item preparation's
vi.mock('../modules/system/vehicle-workshop-apply.js', () => ({
  pricedModData: (source) => ({
    data: JSON.parse(JSON.stringify({
      name: source.name, type: source.type, system: source.system
    })), price: 2 * source.system.price.value, slots: 3
  }),
}))

const {
  dealerCapacity, dealerGauges, buildSlotsRefusal, dealerTotals, assembledVehicleData
} = await import('../modules/system/vehicle-dealership.js')
const {
  SR5Shop
} = await import('../modules/interface/shop.js')

const mod = (type, slots, extra = {
}) => ({
  system: {
    type, slots: {
      value: slots
    }, ...extra
  }
})

describe('the slots of a build', () => {
  it('counts the factory and fitted mods as used, the others as waiting, and says when the whole goes over', () => {
    const gauges = dealerGauges(dealerCapacity(3), [
      {
        ...mod('weapons', 1, {
          isFactory: true
        }), pending: false
      },
      {
        ...mod('weapons', 2), pending: true
      },
      {
        ...mod('weapons', 1), pending: true
      },
    ])
    const weapons = gauges.find(g => g.key === 'weapons')
    expect(weapons).toMatchObject({
      used: 1, pending: 3, planned: 4, total: 3, over: true, full: true
    })
    expect(gauges.find(g => g.key === 'body')).toMatchObject({
      used: 0, pending: 0, over: false
    })
  })

  it('refuses a mod the gamemaster fits beyond the free slots of its category, waiting ones not counted', () => {
    const mods = [{
      ...mod('protection', 2, {
        isActive: true
      }), pending: false
    }, {
      ...mod('protection', 3), pending: true
    }]
    expect(buildSlotsRefusal(dealerCapacity(3), mods, mod('protection', 2))).toEqual({
      category: 'protection', needed: 2, free: 1
    })
    expect(buildSlotsRefusal(dealerCapacity(3), mods, mod('protection', 1))).toBeNull()
    expect(buildSlotsRefusal(dealerCapacity(3), mods, mod('', 5))).toBeNull()
  })

  it("counts a mod the gamemaster fitted although the shelf's copy says it is not active (measured in play)", () => {
    const fitted = [{
      ...mod('protection', 2, {
        isActive: false
      }), pending: false
    }]
    expect(buildSlotsRefusal(dealerCapacity(4), fitted, mod('protection', 3))).toEqual({
      category: 'protection', needed: 3, free: 2
    })
    expect(dealerGauges(dealerCapacity(4), fitted).find(g => g.key === 'protection').used).toBe(2)
  })
})

describe('the figures of a build', () => {
  it('sums the lines, keeps the highest availability and the strictest legality', () => {
    expect(dealerTotals([{
      price: 5000, availability: 4, legality: ''
    }, {
      price: 1200, availability: 8, legality: 'R'
    }, {
      price: 300, availability: 2, legality: ''
    }])).toEqual({
      total: 6500, availability: 8, legality: 'R'
    })
  })

  it('delivers the mods aboard after the factory ones, priced on the vehicle, fitted only when the GM fitted them', () => {
    let n = 0
    const data = assembledVehicleData({
      name: 'Doberman', system: {
        vehiclesMod: [{
          name: 'Usine', system: {
            isFactory: true
          }
        }]
      }
    }, [{
      data: {
        name: 'Monture', system: {
          isActive: true, price: {
            value: 1
          }
        }
      }, price: 2500
    }, {
      data: {
        name: 'Blindage', system: {
        }
      }, price: 900, fitted: true
    }], () => `id${++n}`)
    expect(data.system.vehiclesMod.map(m => [m.name, m._id ?? null, m.system.isActive ?? null, m.system.price?.value ?? null])).toEqual([
      ['Usine', null, null, null], ['Monture', 'id1', false, 2500], ['Blindage', 'id2', true, 900],
    ])
  })
})

// The till
const shelf = (id, type, price, availability = 0, system = {
}) => ({
  name: id, type, pack: 'sr5.vehicles', isEmbedded: false, parent: null, uuid: `Compendium.sr5.vehicles.Item.${id}`,
  flags: {
  },
  system: {
    price: {
      value: price, base: price
    }, availability: {
      value: availability
    }, ...system
  },
  toObject() {
    return JSON.parse(JSON.stringify({
      _id: 'x', name: this.name, type: this.type, system: this.system
    }))
  },
})
const docs = Object.fromEntries([
  shelf('doberman', 'itemVehicle', 5000, 4, {
    type: 'drone', category: 'mediumDrone', vehiclesMod: []
  }),
  shelf('mount', 'itemVehicleMod', 1000, 6, {
    type: 'weapons'
  }),
  shelf('armor', 'itemVehicleMod', 200, 0, {
    type: 'protection'
  }),
].map(d => [d.uuid, d]))

let created, flags, delivery
const buyer = {
  id: 'buyer', uuid: 'Actor.buyer', name: 'Clo', type: 'actorPc', isOwner: true,
  system: {
    nuyen: {
      modifiers: []
    }
  },
  items: {
    get: () => null, filter: () => [], some: () => false, [Symbol.iterator]: function* () {}
  },
  testUserPermission: () => true,
  createEmbeddedDocuments: async (_t, data) => {
    created.push(...data)
    return data.map((d, i) => ({
      ...d, id: `c${i}`
    }))
  },
  getFlag: (_s, k) => flags[k],
  setFlag: async (_s, k, v) => {
    flags[k] = v
  },
}

beforeEach(() => {
  created = []
  flags = {
  }
  delivery = 'immediate'
  vi.restoreAllMocks()
  globalThis.fromUuid = async uuid => docs[uuid] ?? null
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  const gm = {
    id: 'gm', isGM: true
  }
  globalThis.game.user = gm
  globalThis.game.users = {
    activeGM: gm, get: () => gm, filter: () => []
  }
  globalThis.game.actors = {
    get: id => id === 'buyer' ? buyer : null
  }
  globalThis.game.settings.get = (_s, key) => ({
    sr5ShopBuyerMode: 'owned', sr5ShopBuyerFolder: '', sr5ShopCreationMode: false, sr5ShopExcludedPacks: [],
    sr5ShopDelivery: delivery,
  })[key] ?? null
  globalThis.game.i18n = {
    format: (k, d) => d?.name ? `${k}:${d.name}` : k, localize: k => k, lang: 'fr'
  }
  globalThis.game.time = {
    worldTime: 0
  }
  globalThis.foundry.documents.ChatMessage = {
    create: vi.fn(async () => ({
    })), getSpeaker: () => ({
    })
  }
  let ids = 0
  globalThis.foundry.utils.randomID = () => `r${++ids}`
  globalThis.foundry.utils.escapeHTML ??= s => s
  vi.spyOn(SR5Shop, 'balance').mockReturnValue(100000)
})

const lines = (fitted = false) => [{
  uuid: docs['Compendium.sr5.vehicles.Item.doberman'].uuid, quantity: 3
}, {
  uuid: docs['Compendium.sr5.vehicles.Item.mount'].uuid, quantity: 1, fitted
}, {
  uuid: docs['Compendium.sr5.vehicles.Item.armor'].uuid, quantity: 1
}]

describe('SR5Shop.checkout, assemble (the dealership)', () => {
  it('one vehicle with its mods aboard, waiting to be installed, and one debit priced on the vehicle', async () => {
    expect(await SR5Shop.checkout(buyer, lines(), {
      assemble: true
    })).toBe(true)
    const vehicles = created.filter(d => d.type === 'itemVehicle')
    expect(vehicles).toHaveLength(1)
    expect(created.some(d => d.type === 'itemVehicleMod')).toBe(false)
    expect(vehicles[0].system.vehiclesMod.map(m => [m.name, m.system.isActive, m.system.price.value])).toEqual([
      ['mount', false, 2000], ['armor', false, 400],
    ])
    // The prepared slots, not the stored 0 the vehicle item's workshop would read (measured in play)
    expect(vehicles[0].system.vehiclesMod.map(m => m.system.slots.value)).toEqual([3, 3])
    expect(created.find(d => d.type === 'itemNuyen').system.amount).toBe(5000 + 2000 + 400)
  })

  it("the gamemaster's fitted mod arrives fitted; a player's tick is ignored", async () => {
    await SR5Shop.checkout(buyer, lines(true), {
      assemble: true
    })
    expect(created.find(d => d.type === 'itemVehicle').system.vehiclesMod[0].system.isActive).toBe(true)
    created = []
    game.user = {
      id: 'pl', isGM: false
    }
    await SR5Shop.checkout(buyer, lines(true), {
      assemble: true
    })
    expect(created.find(d => d.type === 'itemVehicle').system.vehiclesMod[0].system.isActive).toBe(false)
  })

  it('sells nothing when a mod of the build is not on the shelves', async () => {
    docs.gone = null
    const broken = [...lines(), {
      uuid: 'Actor.other.Item.mod', quantity: 1
    }]
    expect(await SR5Shop.checkout(buyer, broken, {
      assemble: true
    })).toBe(false)
    expect(created).toHaveLength(0)
  })

  it('with delivery delayed, the lot is one order carrying its mods, and nothing arrives yet', async () => {
    delivery = 'delayed'
    expect(await SR5Shop.checkout(buyer, lines(), {
      assemble: true
    })).toBe(true)
    expect(created.map(d => d.type)).toEqual(['itemNuyen'])
    expect(created[0].system.amount).toBe(7400)
    const [order] = flags.shopOrders
    expect(flags.shopOrders).toHaveLength(1)
    expect(order).toMatchObject({
      uuid: 'Compendium.sr5.vehicles.Item.doberman', quantity: 1, paid: 7400,
      mods: ['Compendium.sr5.vehicles.Item.mount', 'Compendium.sr5.vehicles.Item.armor'],
    })
  })

  it("enters the GM's ledger at the till's price: mods priced on the vehicle, Relation avec un concessionnaire taken off", async () => {
    delivery = 'delayed'
    const ledger = {
    }
    game.settings.get = (_s, key) => ({
      sr5ShopBuyerMode: 'owned', sr5ShopBuyerFolder: '', sr5ShopCreationMode: false, sr5ShopExcludedPacks: [],
      sr5ShopDelivery: delivery,
    })[key] ?? ledger[key] ?? {
    }
    game.settings.set = async (_s, key, value) => {
      ledger[key] = value
    }
    const quality = {
      type: 'itemQuality', system: {
        isActive: true, systemEffects: [{
          value: 'riggerDealerDrone'
        }]
      }
    }
    const items = new Map([['q', quality]])
    const rigger = {
      ...buyer, uuid: 'Actor.rigger', items,
      createEmbeddedDocuments: async (_t, data) => {
        created.push(...data)
        return data.map(d => {
          const doc = {
            ...d, id: 'debit', _stats: {
              createdTime: Date.now()
            }
          }
          items.set(doc.id, doc)
          return doc
        })
      },
    }
    expect(await SR5Shop.checkout(rigger, lines(), {
      assemble: true
    })).toBe(true)
    // 5 000 ¥ less 10 %, then the mods on the vehicle
    expect(created.find(d => d.type === 'itemNuyen').system.amount).toBe(4500 + 2400)
    const {
      orderLedger
    } = await import('../modules/interface/shop-orders.js')
    expect(Object.values(orderLedger())).toEqual([expect.objectContaining({
      paid: 6900, uuid: 'Compendium.sr5.vehicles.Item.doberman'
    })])
  })

  it('the express of a lot is entered as the till charged it, rounded line by line (review 32)', async () => {
    delivery = 'delayed'
    const ledger = {
    }
    game.settings.get = (_s, key) => ({
      sr5ShopBuyerMode: 'owned', sr5ShopBuyerFolder: '', sr5ShopCreationMode: false, sr5ShopExcludedPacks: [],
      sr5ShopDelivery: delivery, sr5ShopExpress: true, sr5ShopExpressSurcharge: 25, sr5ShopExpressFactor: 2,
    })[key] ?? ledger[key] ?? {
    }
    game.settings.set = async (_s, key, value) => {
      ledger[key] = value
    }
    // 5 001 ¥ and a mod at 1 501 ¥ on the vehicle: 1 250 + 375 = 1 625 at the till, 1 626 rounded on the sum
    for (const d of [shelf('scout', 'itemVehicle', 5001, 4, {
      type: 'drone', category: 'mediumDrone', vehiclesMod: []
    }), shelf('sensor', 'itemVehicleMod', 750.5, 0, {
      type: 'electromagnetic'
    })]) docs[d.uuid] = d
    const items = new Map()
    const rigger = {
      ...buyer, uuid: 'Actor.rigger-express', items,
      createEmbeddedDocuments: async (_t, data) => {
        created.push(...data)
        return data.map(d => {
          const doc = {
            ...d, id: 'debit', _stats: {
              createdTime: Date.now()
            }
          }
          items.set(doc.id, doc)
          return doc
        })
      },
    }
    expect(await SR5Shop.checkout(rigger, [{
      uuid: 'Compendium.sr5.vehicles.Item.scout', quantity: 1
    }, {
      uuid: 'Compendium.sr5.vehicles.Item.sensor', quantity: 1
    }], {
      assemble: true, express: true
    })).toBe(true)
    expect(created.find(d => d.type === 'itemNuyen').system.amount).toBe(5001 + 1501 + 1625)
    const {
      orderLedger
    } = await import('../modules/interface/shop-orders.js')
    expect(Object.values(orderLedger())).toEqual([expect.objectContaining({
      paid: 5001 + 1501 + 1625, uuid: 'Compendium.sr5.vehicles.Item.scout'
    })])
  })

  it('the order delivered, the vehicle arrives with its mods aboard', async () => {
    delivery = 'delayed'
    await SR5Shop.checkout(buyer, lines(), {
      assemble: true
    })
    created = []
    const {
      deliverOrder
    } = await import('../modules/interface/shop-orders.js')
    expect(await deliverOrder(buyer, flags.shopOrders[0].id)).toBe(true)
    expect(created).toHaveLength(1)
    expect(created[0].system.vehiclesMod.map(m => [m.name, m.system.isActive, m.system.price.value])).toEqual([
      ['mount', false, 2000], ['armor', false, 400],
    ])
    expect(flags.shopOrders).toHaveLength(0)
  })

  it("the gamemaster's fitted mod keeps its tick through a delayed order and arrives fitted (review 32)", async () => {
    delivery = 'delayed'
    await SR5Shop.checkout(buyer, lines(true), {
      assemble: true
    })
    expect(flags.shopOrders[0].fitted).toEqual([true, false])
    created = []
    const {
      deliverOrder
    } = await import('../modules/interface/shop-orders.js')
    expect(await deliverOrder(buyer, flags.shopOrders[0].id)).toBe(true)
    expect(created[0].system.vehiclesMod.map(m => [m.name, m.system.isActive])).toEqual([
      ['mount', true], ['armor', false],
    ])
  })
})
