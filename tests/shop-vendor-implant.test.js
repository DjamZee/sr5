import {
  describe, it, expect, beforeEach, afterEach, vi
} from 'vitest'

// Système sensible at a vendor's counter (SR5 p. 89). Apolline, second round: a counter item sits in the vendor's
// storage (storedIn = the counter's id), so the screening took it for a stored item and let it through. The
// player paid, the vendor lost the bioware, the creation was refused, and nobody was told. The till screens a
// counter item as installed, BEFORE anything is paid or taken off the counter.

const gm = {
  id: 'gm', isGM: true, name: 'MJ'
}
const player = {
  id: 'player', isGM: false, name: 'Joueuse'
}

function makeVendor() {
  const owned = new Map()
  const vendor = {
    id: 'vendor', uuid: 'Actor.vendor', name: 'vendor', created: [],
    items: {
      get: id => owned.get(id),
      filter: fn => [...owned.values()].filter(fn),
      [Symbol.iterator]: () => owned.values(),
    },
    updateEmbeddedDocuments: async (_t, changes) => {
      for (const c of changes) owned.get(c._id).system.quantity = c['system.quantity']
    },
    deleteEmbeddedDocuments: async (_t, ids) => ids.forEach(id => owned.delete(id)),
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
        for (const [k, v] of Object.entries(changes)) foundry.utils.setProperty(doc, k, v)
      },
    }
    owned.set(id, doc)
    return doc
  }
  item('shop', {
    name: 'Clinique', type: 'itemStorage', system: {
      type: 'shop', storedIn: '', shop: {
        isOpen: true, margin: 0, cashboxId: 'till', shelves: []
      }
    },
  })
  const till = item('till', {
    name: 'Caisse', type: 'itemGear', system: {
      isCredstick: true, funds: {
        value: 0, max: 0
      }, storedIn: ''
    },
  })
  item('glande', {
    name: 'Glande suprathyroïdienne', type: 'itemAugmentation', system: {
      type: 'bioware', grade: 'standard', storedIn: 'shop', price: {
        value: 1000, base: 1000
      }, availability: {
        value: 0
      }, essenceCost: {
        value: 0.7, base: 0.7
      }
    },
  })
  return {
    vendor, till, owned
  }
}

const sensitive = {
  type: 'itemQuality', name: 'Système sensible', system: {
    isActive: true, systemEffects: [{
      category: 'specialCase', value: 'doubleEssenceCost'
    }]
  }
}

function makeBuyer() {
  const list = [sensitive]
  const buyer = {
    id: 'buyer', uuid: 'Actor.buyer', name: 'Joe', type: 'actorPc', created: [],
    system: {
      nuyen: {
        modifiers: []
      }, essence: {
        value: 6
      }
    },
    items: {
      get: () => null, contents: list, [Symbol.iterator]: () => list.values(),
    },
    testUserPermission: user => user.isGM || user.id === player.id,
    createEmbeddedDocuments: async (_t, docs) => buyer.created.push(...docs),
  }
  return buyer
}

let SR5ShopVendor, SR5Shop, asked, answer
const notes = []
vi.mock('../modules/socket.js')

beforeEach(async () => {
  vi.resetModules()
  const {
    SR5_SocketHandler
  } = await import('../modules/socket.js')
  SR5_SocketHandler.emitForPlayer = async (type, data) => notes.push(['player', data?.key ?? type])
  SR5_SocketHandler.emitForGM = async () => {}
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
  globalThis.game.users = Object.assign([gm, player], {
    get: id => [gm, player].find(u => u.id === id)
  })
  globalThis.game.settings = {
    get: (_s, key) => ({
      sr5ShopBuyerMode: 'owned', sr5ShopBuyerFolder: '', sr5ShopCreationMode: false
    })[key] ?? null, registerMenu: () => {}
  }
  globalThis.game.socket = {
    emit: async () => {}
  }
  let ids = 0
  globalThis.foundry.utils.randomID = () => `id${++ids}`
  globalThis.foundry.documents.ChatMessage = {
    create: async () => ({
    }), getSpeaker: () => ({
    })
  }
  asked = 0
  answer = true
  globalThis.foundry.applications.api.DialogV2 = {
    confirm: async () => {
      asked++
      return answer
    }
  }
})

afterEach(async () => {
  await vi.dynamicImportSettled()
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

const request = () => ({
  vendorUuid: 'Actor.vendor', storageId: 'shop', buyerId: 'buyer', lines: [{
    uuid: 'Actor.vendor.Item.glande', quantity: 1, name: 'Glande suprathyroïdienne'
  }],
})

describe('a bioware at the counter, for a sensitive body', () => {
  it('a player is refused before anything is paid or taken off the counter, and is told', async () => {
    const {
      vendor, till, owned
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
    world(vendor, buyer)
    expect(await SR5ShopVendor.sell(request(), player.id)).toBe(false)
    expect(owned.has('glande')).toBe(true)
    expect(buyer.created).toEqual([])
    expect(till.system.funds.value).toBe(0)
    expect(asked).toBe(0)
    // The till tells the requester through the socket, without waiting for it
    await vi.dynamicImportSettled()
    expect(JSON.stringify(notes)).toContain('SR5.WARN_ImplantRejected')
  })

  it('the gamemaster buying is asked before the payment: "no" leaves everything as it was', async () => {
    const {
      vendor, owned
    } = makeVendor()
    const buyer = makeBuyer()
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
    world(vendor, buyer)
    answer = null
    expect(await SR5ShopVendor.sell(request(), gm.id)).toBe(false)
    expect(asked).toBe(1)
    expect(owned.has('glande')).toBe(true)
    expect(buyer.created).toEqual([])
  })

  it('"yes" sells it, with the confirmation the creation honours for a gamemaster', async () => {
    const {
      vendor, owned
    } = makeVendor()
    const buyer = makeBuyer()
    const options = []
    buyer.createEmbeddedDocuments = async (_t, docs, opts) => {
      options.push(opts)
      buyer.created.push(...docs)
    }
    vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
    world(vendor, buyer)
    expect(await SR5ShopVendor.sell(request(), gm.id)).toBe(true)
    expect(owned.has('glande')).toBe(false)
    expect(buyer.created.some(d => d.name === 'Glande suprathyroïdienne')).toBe(true)
    expect(options[0].sr5ImplantRejectionConfirmed).toBe(true)
  })
})
