import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// At a vendor's, the vendor looks for what it has not got (SR5 p. 420) with the pool the window
// announces: SR5ShopVendor.searcherOf, the shop's contact or the Negotiation pool a template set on the
// shop. A Grunt drawn from a template has no Negotiation on its sheet: read off the sheet, it rolled 0 dice.
const SEARCHER = {
  raw: 8, pool: 8, limit: 0, label: 'Armurier', derived: false
}
const vendorActor = {
  id: 'vendor', name: 'Armurier', items: [], system: {
  }
}
vi.mock('../modules/interface/shop-vendor.js', () => ({
  SR5ShopVendor: {
    resolve: () => ({
      actor: vendorActor, storage: {
        id: 'shop'
      }
    }),
    searcherOf: () => ({
      contact: null, pool: SEARCHER
    }),
  }
}))
vi.mock('../modules/interface/shop-vendor-rules.js', () => ({
  shopSettings: () => ({
    isOpen: true, margin: 0, maxAvailability: 0
  })
}))

let rolls = []
globalThis.Roll = class {
  constructor(formula) {
    this.formula = formula
    rolls.push(formula)
  }
  async evaluate() {
    const count = Number(this.formula.split('d')[0])
    this.dice = [{
      results: Array.from({
        length: count
      }, () => ({
        result: 3, active: true
      }))
    }]
    return this
  }
}

const {
  SR5ShopAvailability
} = await import('../modules/interface/shop-availability.js')

const player = {
  id: 'pl', isGM: false
}
const gm = {
  id: 'gm', isGM: true
}
const buyer = {
  id: 'buyer', name: 'Acheteuse', items: {
    get: () => null
  }, system: {
  },
  testUserPermission: u => u.id === 'pl' || u.isGM,
}
const line = [{
  uuid: 'Compendium.x.y.z', quantity: 1, name: 'SBd-44', grade: null
}]

beforeEach(() => {
  rolls = []
  vi.restoreAllMocks()
  globalThis.fromUuid = async () => ({
    name: 'SBd-44', type: 'itemWeapon', system: {
      availability: {
        value: 4
      }, price: {
        value: 500
      }
    }
  })
  globalThis.foundry.applications.handlebars = {
    renderTemplate: async () => ''
  }
  globalThis.foundry.documents.ChatMessage = {
    create: async () => null,
    getSpeaker: () => ({
    }),
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
  globalThis.game.settings.get = () => 25
  globalThis.game.i18n = {
    format: k => k, localize: k => k, lang: 'fr'
  }
})

describe("a vendor's availability test rolls the pool the window announces (SR5 p. 420)", () => {
  it('the pool of the searcher is the one rolled, not the Grunt sheet', async () => {
    const card = await SR5ShopAvailability.testLines(buyer, null, line, 0, {
      searcher: vendorActor, searcherPool: SEARCHER
    })
    expect(card.pool).toBe(8)
    expect(card.searcherLabel).toBe('Armurier')
    expect(rolls[0]).toBe('8d6')
  })

  it("the GM's first test at a vendor's hands that pool to the test", async () => {
    const {
      rollFirstTest
    } = await import('../modules/interface/shop-retry.js')
    const testLines = vi.spyOn(SR5ShopAvailability, 'testLines').mockResolvedValue({
    })
    await rollFirstTest({
      first: true, buyerId: 'buyer', lines: line, surcharge: 0, vendor: {
        uuid: 'Actor.vendor', storageId: 'shop'
      }
    }, 'pl')
    expect(testLines).toHaveBeenCalledTimes(1)
    expect(testLines.mock.calls[0][4].searcherPool).toBe(SEARCHER)
  })
})
