import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// R1 (Anton): a request names any uuid. An item another actor carries was sold as if it stood on a shelf,
// and its copy brought its state along: someone else's credstick, 3 500 ¥ on it, for nothing.
// The shop sells its shelves (the compendiums) and a vendor's counter, never what an actor carries.
const emitForGM = vi.fn(async () => {})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: (...args) => emitForGM(...args), emitForPlayer: async () => {}
  }
}))

const {
  SR5Shop
} = await import('../modules/interface/shop.js')
const {
  SR5ShopAvailability
} = await import('../modules/interface/shop-availability.js')

const gm = {
  id: 'gm', isGM: true
}
const player = {
  id: 'pl', isGM: false
}
const stick = (extra = {
}) => ({
  name: 'Créditube certifié', type: 'itemGear', isEmbedded: false, pack: null, parent: null,
  system: {
    isCredstick: true, funds: {
      value: 3500, max: 0
    }, price: {
      value: 20, base: 20
    }, availability: {
      value: 0
    }
  },
  toObject() {
    return JSON.parse(JSON.stringify({
      _id: 'x', name: this.name, type: this.type, system: this.system
    }))
  },
  ...extra,
})
const other = {
  id: 'other', uuid: 'Actor.other'
}
const docs = {
  'Actor.other.Item.stick': stick({
    isEmbedded: true, parent: other, uuid: 'Actor.other.Item.stick'
  }),
  'Compendium.sr5.gear.Item.stick': stick({
    pack: 'sr5.gear', uuid: 'Compendium.sr5.gear.Item.stick'
  }),
}
let created
const buyer = {
  id: 'buyer', name: 'Clo', type: 'actorPc', isOwner: true, flags: {
  },
  system: {
    nuyen: {
      modifiers: [{
        value: 10000
      }]
    }
  },
  items: {
    get: () => null, filter: () => []
  },
  testUserPermission: u => u.isGM || u.id === 'pl',
  createEmbeddedDocuments: async (_t, data) => {
    created.push(...data)
    return data
  },
  update: async () => {},
  getFlag: () => undefined,
  setFlag: async () => {},
}

beforeEach(() => {
  created = []
  vi.restoreAllMocks()
  globalThis.fromUuid = async uuid => docs[uuid] ?? null
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.game.user = gm
  globalThis.game.users = {
    activeGM: gm, get: id => ({
      gm, pl: player
    })[id]
  }
  globalThis.game.actors = {
    get: id => id === 'buyer' ? buyer : null
  }
  globalThis.game.settings.get = (_s, key) => ({
    sr5ShopBuyerMode: 'owned', sr5ShopBuyerFolder: '', sr5ShopCreationMode: false, sr5ShopExcludedPacks: [],
  })[key] ?? null
  globalThis.game.i18n = {
    format: k => k, localize: k => k, lang: 'fr'
  }
  globalThis.game.time = {
    worldTime: 0
  }
  vi.spyOn(SR5Shop, 'balance').mockReturnValue(10000)
})

describe('R1: the shop sells its shelves, never what an actor carries', () => {
  it('a checkout naming the credstick another actor carries sells nothing', async () => {
    expect(await SR5Shop.checkout(buyer, [{
      uuid: 'Actor.other.Item.stick', quantity: 1, name: 'Créditube'
    }])).toBe(false)
    expect(created).toHaveLength(0)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_ShopNotForSale')
  })

  it('a credstick from the shelves comes empty, whatever its entry holds', () => {
    const [data] = SR5Shop._itemPayload(docs['Compendium.sr5.gear.Item.stick'], 1)
    expect(data.system.funds.value).toBe(0)
  })

  it("the GM's first test refuses a line naming an actor's item", async () => {
    const {
      rollFirstTest
    } = await import('../modules/interface/shop-retry.js')
    globalThis.foundry.documents.ChatMessage = {
      create: vi.fn(async () => ({
      }))
    }
    globalThis.foundry.utils.escapeHTML ??= s => s
    const testLines = vi.spyOn(SR5ShopAvailability, 'testLines').mockResolvedValue({
    })
    await rollFirstTest({
      first: true, buyerId: 'buyer', lines: [{
        uuid: 'Actor.other.Item.stick', quantity: 1
      }]
    }, 'pl')
    expect(testLines).not.toHaveBeenCalled()
    await rollFirstTest({
      first: true, buyerId: 'buyer', lines: [{
        uuid: 'Compendium.sr5.gear.Item.stick', quantity: 1
      }]
    }, 'pl')
    expect(testLines).toHaveBeenCalledTimes(1)
  })

  it("an item on the vendor's counter may be tested there, not one the vendor carries elsewhere", () => {
    const vendor = {
      uuid: 'Actor.vendor'
    }
    const counter = {
      actorUuid: 'Actor.vendor', storageId: 'shop'
    }
    expect(SR5Shop.sellableSource(stick({
      isEmbedded: true, parent: vendor, system: {
        storedIn: 'shop'
      }
    }), counter)).toBe(true)
    expect(SR5Shop.sellableSource(stick({
      isEmbedded: true, parent: vendor, system: {
        storedIn: ''
      }
    }), counter)).toBe(false)
  })
})
