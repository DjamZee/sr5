import {
  describe, it, expect, beforeEach, afterEach, vi
} from 'vitest'
import {
  vendorPrice, shopSettings, fitsRestock, restockPicks, splitTakings, checkStockLines, stockOf, piecesOf
} from '../modules/interface/shop-vendor-rules.js'
import {
  SR5ShopCatalog
} from '../modules/interface/shop-catalog.js'

describe('vendor rules (shop lot C)', () => {
  it('prices at the book with the margin, the GM adjustment of SR5 p. 419', () => {
    expect(vendorPrice(1000, 0)).toBe(1000)
    expect(vendorPrice(1000, 25)).toBe(1250)
    expect(vendorPrice(999, -20)).toBe(799)
    expect(vendorPrice(100, -150)).toBe(0)
  })

  it('shows on the row the price its till charges', () => {
    const entry = {
      type: 'itemGear', system: {
        price: {
          value: 400, base: 400
        }
      }, margin: 50
    }
    expect(SR5ShopCatalog.describe(entry).price).toBe(vendorPrice(400, 50))
    expect(SR5ShopCatalog.describe({
      ...entry, margin: 0
    }).price).toBe(400)
  })

  it('fills the defaults of a shop never set', () => {
    const shop = shopSettings({
      system: {
        shop: {
          margin: 10
        }
      }
    })
    expect(shop.margin).toBe(10)
    expect(shop.maxAvailability).toBe(12)
    expect(shop.legality).toEqual(['legal', 'R'])
  })

  it('restocks only its shelves, under its availability, in its legality', () => {
    const shop = shopSettings({
      system: {
        shop: {
          shelves: ['weapons'], maxAvailability: 8
        }
      }
    })
    expect(fitsRestock({
      price: 100, availability: 8, legality: 'R'
    }, 'weapons', shop)).toBe(true)
    expect(fitsRestock({
      price: 100, availability: 9, legality: ''
    }, 'weapons', shop)).toBe(false)
    expect(fitsRestock({
      price: 100, availability: 4, legality: 'F'
    }, 'weapons', shop)).toBe(false)
    expect(fitsRestock({
      price: 100, availability: 4, legality: ''
    }, 'gear', shop)).toBe(false)
    expect(fitsRestock({
      price: 0, availability: 0, legality: ''
    }, 'weapons', shop)).toBe(false)
    // No shelf ticked: nothing comes in by itself
    expect(fitsRestock({
      price: 100, availability: 0, legality: ''
    }, 'weapons', shopSettings({
    }))).toBe(false)
  })

  it('tops each shelf up to its count, never twice the same item', () => {
    const shop = shopSettings({
      system: {
        shop: {
          shelves: ['weapons', 'armor'], perShelf: 2
        }
      }
    })
    const candidates = [
      {
        uuid: 'a', shelf: 'weapons' 
      }, {
        uuid: 'b', shelf: 'weapons' 
      }, {
        uuid: 'c', shelf: 'weapons' 
      },
      {
        uuid: 'd', shelf: 'armor' 
      }, {
        uuid: 'e', shelf: 'gear' 
      },
    ]
    const stock = [{
      shelf: 'weapons', sourceUuid: 'a' 
    }]
    const picks = restockPicks(candidates, stock, shop, () => 0)
    expect(picks.map(p => p.uuid)).toEqual(['b', 'd'])
  })

  it('puts the takings in the cashbox up to its room, the rest aside', () => {
    expect(splitTakings(1500, Infinity)).toEqual({
      intoStick: 1500, overflow: 0 
    })
    expect(splitTakings(1500, 1000)).toEqual({
      intoStick: 1000, overflow: 500 
    })
    expect(splitTakings(1500, 0)).toEqual({
      intoStick: 0, overflow: 1500 
    })
  })

  it('reads the stock of one storage only', () => {
    const items = [
      {
        id: '1', system: {
          storedIn: 'shop' 
        } 
      },
      {
        id: '2', system: {
          storedIn: 'safe' 
        } 
      },
      {
        id: '3', system: {
          storedIn: '' 
        } 
      },
    ]
    expect(stockOf(items, 'shop').map(i => i.id)).toEqual(['1'])
    expect(piecesOf({
      system: {
        quantity: 4 
      } 
    })).toBe(4)
    expect(piecesOf({
      system: {
      } 
    })).toBe(1)
  })

  it('refuses a forged quantity, an item elsewhere, more than the counter holds', () => {
    const owned = new Map([
      ['ammo', {
        id: 'ammo', name: 'Balles', system: {
          storedIn: 'shop', quantity: 5 
        } 
      }],
      ['gun', {
        id: 'gun', name: 'Pistolet', system: {
          storedIn: '' 
        } 
      }],
    ])
    const items = {
      get: id => owned.get(id) 
    }
    const {
      ok, refused 
    } = checkStockLines(items, 'shop', [
      {
        itemId: 'ammo', quantity: 3 
      },
      {
        itemId: 'ammo', quantity: 3 
      },
      {
        itemId: 'ammo', quantity: -1 
      },
      {
        itemId: 'ammo', quantity: 1.5 
      },
      {
        itemId: 'gun', quantity: 1 
      },
      {
        itemId: 'nope', quantity: 1 
      },
    ])
    expect(ok.map(l => l.quantity)).toEqual([3])
    expect(refused.map(r => r.reason)).toEqual(['short', 'quantity', 'quantity', 'gone', 'gone'])
  })
})

/* -------------------------------------------- */
/*  The till on the gamemaster's browser        */
/* -------------------------------------------- */

const gm = {
  id: 'gm', isGM: true, name: 'MJ' 
}
const player = {
  id: 'player', isGM: false, name: 'Joueur' 
}
const stranger = {
  id: 'stranger', isGM: false, name: 'Autre' 
}

// The server answers later than the next request comes in
const tick = () => new Promise(resolve => setTimeout(resolve, 5))

function makeVendor({
  isOpen = true, margin = 0, cash = 0, room = 0 
} = {
}) {
  const owned = new Map()
  const vendor = {
    id: 'vendor', uuid: 'Actor.vendor', name: 'Doc', created: [],
    items: {
      get: id => owned.get(id),
      filter: fn => [...owned.values()].filter(fn),
      [Symbol.iterator]: () => owned.values(),
    },
    updateEmbeddedDocuments: async (_t, changes) => {
      await tick()
      for (const c of changes) owned.get(c._id).system.quantity = c['system.quantity']
    },
    deleteEmbeddedDocuments: async (_t, ids) => {
      await tick()
      for (const id of ids) {
        if (!owned.has(id)) throw new Error(`Item ${id} does not exist!`)
      }
      ids.forEach(id => owned.delete(id))
    },
    createEmbeddedDocuments: async (_t, docs) => vendor.created.push(...docs),
  }
  const item = (id, data) => {
    const doc = {
      id, uuid: `Actor.vendor.Item.${id}`, parent: vendor, flags: {
      }, ...data,
      toObject: () => JSON.parse(JSON.stringify({
        _id: id, name: data.name, type: data.type, system: data.system 
      })),
      update: async changes => {
        await tick()
        for (const [k, v] of Object.entries(changes)) foundry.utils.setProperty(doc, k, v)
      },
    }
    owned.set(id, doc)
    return doc
  }
  const storage = item('shop', {
    name: 'Clinique', type: 'itemStorage',
    system: {
      type: 'shop', storedIn: '', shop: {
        isOpen, margin, cashboxId: 'till', shelves: [] 
      } 
    },
  })
  const till = item('till', {
    name: 'Caisse', type: 'itemGear',
    system: {
      isCredstick: true, funds: {
        value: cash, max: room 
      }, storedIn: '' 
    },
  })
  item('medkit', {
    name: 'Medkit', type: 'itemGear',
    system: {
      storedIn: 'shop', quantity: 3, price: {
        value: 1000, base: 1000 
      }, availability: {
        value: 0 
      } 
    },
  })
  item('gun', {
    name: 'Ares Predator', type: 'itemWeapon',
    system: {
      storedIn: 'shop', price: {
        value: 725, base: 725 
      }, availability: {
        value: 5 
      }, legality: 'R' 
    },
  })
  return {
    vendor, storage, till 
  }
}

function makeBuyer(balance = 10000) {
  const buyer = {
    id: 'buyer', uuid: 'Actor.buyer', name: 'Joe', type: 'actorPc', created: [],
    system: {
      nuyen: {
        modifiers: [] 
      } 
    },
    items: {
      get: () => null 
    },
    testUserPermission: user => user.isGM || user.id === player.id,
    createEmbeddedDocuments: async (_t, docs) => buyer.created.push(...docs),
  }
  buyer.balance = balance
  return buyer
}

let SR5ShopVendor, SR5Shop
const sent = []
const notes = []

beforeEach(async () => {
  vi.resetModules()
  // The real socket module brings the whole system; the till only needs its two calls
  vi.doMock('../modules/socket.js', () => ({
    SR5_SocketHandler: {
      emitForPlayer: async (type, data, userId) => sent.push({
        type, data, userId
      }),
      emitForGM: async (type, data) => sent.push({
        type, data
      }),
    },
  }))
  ;({
    SR5ShopVendor 
  } = await import('../modules/interface/shop-vendor.js'))
  ;({
    SR5Shop 
  } = await import('../modules/interface/shop.js'))
  globalThis.ui = {
    notifications: {
      info: m => notes.push(['info', m]), warn: m => notes.push(['warn', m]), error: m => notes.push(['error', m]) 
    } 
  }
  globalThis.game.user = gm
  globalThis.game.users = Object.assign([gm, player, stranger], {
    get: id => [gm, player, stranger].find(u => u.id === id) 
  })
  globalThis.game.settings = {
    get: (_s, key) => ({
      sr5ShopBuyerMode: 'owned', sr5ShopBuyerFolder: '', sr5ShopCreationMode: false 
    })[key] ?? null, registerMenu: () => {} 
  }
  globalThis.game.socket = {
    emit: async (_c, payload) => sent.push(payload) 
  }
  globalThis.foundry.documents.ChatMessage = {
    create: async () => ({
    }), getSpeaker: () => ({
    }) 
  }
  globalThis.foundry.applications.api.DialogV2 = {
    confirm: async () => true 
  }
})

afterEach(() => {
  sent.length = 0
  notes.length = 0
  for (const key of ['actors', 'users', 'socket', 'user']) delete globalThis.game[key]
  delete globalThis.fromUuidSync
  delete globalThis.fromUuid
})

function world(vendor, buyer) {
  globalThis.game.actors = {
    get: id => (id === buyer.id ? buyer : null), [Symbol.iterator]: function* () { yield buyer; yield vendor } 
  }
  globalThis.fromUuidSync = uuid => (uuid === vendor.uuid ? vendor : null)
  globalThis.fromUuid = async () => null
}

const request = (lines, extra = {
}) => ({
  vendorUuid: 'Actor.vendor', storageId: 'shop', buyerId: 'buyer', lines, ...extra,
})

describe('the vendor till (socket, validated by the gamemaster)', () => {
  it('sells from the counter: the stock drops, the money goes into the cashbox', async () => {
    const {
      vendor, till 
    } = makeVendor({
      margin: 10 
    })
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
    world(vendor, buyer)
    const done = await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.medkit', quantity: 2, name: 'Medkit' 
    }]), player.id)
    expect(done).toBe(true)
    expect(vendor.items.get('medkit').system.quantity).toBe(1)
    expect(till.system.funds.value).toBe(2200)
    const [gear, expense] = buyer.created
    expect(gear.name).toBe('Medkit')
    expect(gear.system.quantity).toBe(2)
    expect(gear.system.storedIn).toBe('')
    expect(expense.type).toBe('itemNuyen')
    expect(expense.system.amount).toBe(2200)
    expect(expense.system.type).toBe('loss')
  })

  it('ignores the price a client sends: the till works it out again', async () => {
    const {
      vendor, till 
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
    world(vendor, buyer)
    await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.gun', quantity: 1, unit: 1, total: 1, price: 1 
    }]), player.id)
    expect(till.system.funds.value).toBe(725)
    expect(vendor.items.get('gun')).toBeUndefined()
  })

  it('refuses a player who does not own the buyer', async () => {
    const {
      vendor, till 
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
    world(vendor, buyer)
    const done = await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.gun', quantity: 1 
    }]), stranger.id)
    expect(done).toBe(false)
    expect(vendor.items.get('gun')).toBeDefined()
    expect(till.system.funds.value).toBe(0)
    // The refusal goes back to the one who asked, by the gamemaster's socket
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(sent.at(-1)).toMatchObject({
      type: 'shopVendorNotice', userId: stranger.id
    })
  })

  it('refuses a request whose sender the server did not stamp', async () => {
    const {
      vendor 
    } = makeVendor()
    const buyer = makeBuyer()
    world(vendor, buyer)
    expect(await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.gun', quantity: 1 
    }]), undefined)).toBe(false)
    expect(vendor.items.get('gun')).toBeDefined()
  })

  it('refuses a player at a closed shop, lets the gamemaster in', async () => {
    const {
      vendor 
    } = makeVendor({
      isOpen: false 
    })
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
    world(vendor, buyer)
    expect(await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.gun', quantity: 1 
    }]), player.id)).toBe(false)
    expect(vendor.items.get('gun')).toBeDefined()
    expect(await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.gun', quantity: 1 
    }]), gm.id)).toBe(true)
  })

  it('refuses a negative quantity and more than the counter holds', async () => {
    const {
      vendor, till 
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(100000)
    world(vendor, buyer)
    expect(await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.medkit', quantity: -2 
    }]), player.id)).toBe(false)
    expect(await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.medkit', quantity: 4 
    }]), player.id)).toBe(false)
    expect(vendor.items.get('medkit').system.quantity).toBe(3)
    expect(till.system.funds.value).toBe(0)
  })

  it('refuses an item that is not on this counter', async () => {
    const {
      vendor 
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(100000)
    world(vendor, buyer)
    // The cashbox is the vendor's, but not for sale
    expect(await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.till', quantity: 1 
    }]), player.id)).toBe(false)
    expect(buyer.created).toEqual([])
  })

  it('refuses when the buyer cannot pay', async () => {
    const {
      vendor 
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(100)
    world(vendor, buyer)
    expect(await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.gun', quantity: 1 
    }]), player.id)).toBe(false)
    expect(vendor.items.get('gun')).toBeDefined()
  })

  it('sells the last piece once when two requests arrive together', async () => {
    const {
      vendor, till 
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(100000)
    world(vendor, buyer)
    const lines = [{
      uuid: 'Actor.vendor.Item.gun', quantity: 1 
    }]
    const results = await Promise.all([
      SR5ShopVendor.sell(request(lines), player.id),
      SR5ShopVendor.sell(request(lines), player.id),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(till.system.funds.value).toBe(725)
  })

  it('sends the takings over a full cashbox to the vendor accounts', async () => {
    const {
      vendor, till 
    } = makeVendor({
      cash: 4500, room: 5000 
    })
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(100000)
    world(vendor, buyer)
    await SR5ShopVendor.sell(request([{
      uuid: 'Actor.vendor.Item.gun', quantity: 1 
    }]), player.id)
    expect(till.system.funds.value).toBe(5000)
    expect(vendor.created[0].system).toMatchObject({
      amount: 225, type: 'gain' 
    })
  })

  it('refuses an order line at a shop that takes none', async () => {
    const {
      vendor 
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(100000)
    world(vendor, buyer)
    expect(await SR5ShopVendor.sell(request([{
      uuid: 'Compendium.sr5.gear.Item.x', quantity: 1 
    }]), player.id)).toBe(false)
  })

  it('only takes a notice from the gamemaster', () => {
    SR5ShopVendor._socketNotice({
      data: {
        key: 'SR5.WARN_ShopVendorClosed', data: {
        } 
      } 
    }, player.id)
    SR5ShopVendor._socketNotice({
      data: {
        key: 'javascript:alert(1)' 
      } 
    }, gm.id)
    expect(notes).toEqual([])
    SR5ShopVendor._socketNotice({
      data: {
        key: 'SR5.WARN_ShopVendorClosed', data: {
        } 
      } 
    }, gm.id)
    expect(notes).toHaveLength(1)
  })
})
