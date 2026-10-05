import {
  describe, it, expect, beforeEach, afterEach, vi
} from 'vitest'
import {
  VENDOR_TEMPLATES, VENDOR_FAMILIES, templateBanners, templateShop, vendorTemplate
} from '../modules/interface/shop-vendor-templates.js'
import {
  SR5ShopCatalog
} from '../modules/interface/shop-catalog.js'

describe('vendor templates (shop lot C, part 2)', () => {
  it('has one template per group of banners, 36, each in a known family, with known shelves', () => {
    expect(VENDOR_TEMPLATES).toHaveLength(36)
    const shelves = new Set(SR5ShopCatalog.SHELVES.map(shelf => shelf.key))
    for (const template of VENDOR_TEMPLATES) {
      expect(VENDOR_FAMILIES).toContain(template.family)
      for (const shelf of template.shelves) expect(shelves).toContain(shelf)
      for (const letter of template.legality) expect(['legal', 'R', 'F']).toContain(letter)
    }
    expect(new Set(VENDOR_TEMPLATES.map(t => t.key)).size).toBe(36)
    expect(VENDOR_TEMPLATES.filter(t => t.family === 'magic').length).toBe(6)
  })

  it('finds the banners of a template by their file names, WebP first, the single image too', () => {
    const files = [
      'banners/Atelier-d%27armurerie-1.png', "banners/Atelier-d'armurerie-1.webp", "banners/Atelier-d'armurerie-2.webp",
      'banners/Atelier.webp', 'banners/Armurier-des-ombres-1.webp', 'banners/notes.txt',
    ]
    const banners = templateBanners(vendorTemplate('gunsmithWorkshop'), files)
    expect(banners).toEqual(["banners/Atelier-d'armurerie-1.webp", "banners/Atelier-d'armurerie-2.webp", 'banners/Atelier.webp'])
    // "Atelier d'enchantement - loge magique 1" is numbered with a space
    expect(templateBanners(vendorTemplate('enchanterLodge'), ["b/Atelier d'enchantement - loge magique 3.webp"])).toHaveLength(1)
  })

  it('gives a new vendor the template settings and its accent', () => {
    const shop = templateShop(vendorTemplate('alleyTalismonger'), {
      label: 'Chez Mama', banner: 'b/x.webp'
    })
    expect(shop).toMatchObject({
      label: 'Chez Mama', template: 'alleyTalismonger', shelves: ['magic'], legality: ['legal', 'R'], banner: 'b/x.webp',
    })
    expect(shop.accent).toMatch(/^#[0-9a-f]{6}$/)
  })
})

/* -------------------------------------------- */
/*  Buy-back (SR5 p. 421)                       */
/* -------------------------------------------- */

const tick = () => new Promise(resolve => setTimeout(resolve, 5))
const gm = {
  id: 'gm', isGM: true, name: 'MJ'
}
const player = {
  id: 'player', isGM: false, name: 'Joueur'
}

function makeActor(id, items, owner = null) {
  const owned = new Map(items.map(item => [item.id, item]))
  const actor = {
    id, uuid: `Actor.${id}`, name: id, created: [],
    items: {
      get: key => owned.get(key),
      filter: fn => [...owned.values()].filter(fn),
      find: fn => [...owned.values()].find(fn),
      [Symbol.iterator]: () => owned.values(),
    },
    testUserPermission: user => user.isGM || user.id === owner,
    updateEmbeddedDocuments: async (_t, changes) => {
      await tick()
      for (const c of changes) owned.get(c._id).system.quantity = c['system.quantity']
    },
    deleteEmbeddedDocuments: async (_t, ids) => {
      await tick()
      for (const key of ids) if (!owned.has(key)) throw new Error(`Item ${key} does not exist!`)
      ids.forEach(key => owned.delete(key))
    },
    createEmbeddedDocuments: async (_t, docs) => {
      await tick()
      actor.created.push(...docs)
    },
  }
  for (const item of items) {
    item.parent = actor
    item.toObject = () => JSON.parse(JSON.stringify({
      _id: item.id, name: item.name, type: item.type, system: item.system
    }))
    item.update = async changes => {
      await tick()
      for (const [k, v] of Object.entries(changes)) foundry.utils.setProperty(item, k, v)
    }
  }
  return actor
}

const shopItem = (extra = {
}) => ({
  id: 'shop', name: 'Clinique', type: 'itemStorage',
  system: {
    type: 'shop', storedIn: '', shop: {
      isOpen: true, cashboxId: 'till', shelves: ['weapons'], ...extra
    }
  },
})
const till = funds => ({
  id: 'till', name: 'Caisse', type: 'itemGear', system: {
    isCredstick: true, funds: {
      value: funds, max: 0
    }, storedIn: ''
  }
})
const gun = () => ({
  id: 'gun', name: 'Ares Predator', type: 'itemWeapon', system: {
    storedIn: '', price: {
      value: 1000, base: 1000
    }, availability: {
      value: 5
    }
  }
})

let SR5ShopVendor, SR5ShopAvailability
const messages = new Map()

beforeEach(async () => {
  vi.resetModules()
  vi.doMock('../modules/socket.js', () => ({
    SR5_SocketHandler: {
      emitForPlayer: async () => {}, emitForGM: async () => {}
    }
  }))
  ;({
    SR5ShopVendor
  } = await import('../modules/interface/shop-vendor.js'))
  ;({
    SR5ShopAvailability
  } = await import('../modules/interface/shop-availability.js'))
  globalThis.ui = {
    notifications: {
      info: () => {}, warn: () => {}, error: () => {}
    }
  }
  globalThis.game.user = gm
  globalThis.game.users = Object.assign([gm, player], {
    get: key => [gm, player].find(u => u.id === key)
  })
  globalThis.game.settings = {
    get: (_s, key) => ({
      sr5ShopFenceBasePercent: 25, sr5ShopFenceStepPercent: 5, sr5ShopContactFencePercent: 5,
    })[key] ?? null,
    registerMenu: () => {},
  }
  globalThis.game.messages = {
    get: key => messages.get(key)
  }
  globalThis.foundry.documents.ChatMessage = {
    getSpeaker: () => ({
    }),
    create: async data => {
      const message = {
        id: `m${messages.size}`, author: game.user, flags: data.flags, content: data.content,
        update: async changes => {
          await tick()
          for (const [k, v] of Object.entries(changes)) foundry.utils.setProperty(message, k, v)
        },
      }
      messages.set(message.id, message)
      return message
    },
  }
  vi.spyOn(SR5ShopAvailability, 'buyerPool').mockReturnValue({
    pool: 6, limit: 0
  })
})

afterEach(() => {
  messages.clear()
  for (const key of ['actors', 'users', 'user', 'messages']) delete globalThis.game[key]
  delete globalThis.fromUuidSync
  vi.restoreAllMocks()
})

function world({
  funds = 5000, shop = {
  }, sellerItems = [gun()]
} = {
}) {
  const vendor = makeActor('vendor', [shopItem(shop), till(funds)])
  const seller = makeActor('seller', sellerItems, player.id)
  globalThis.game.actors = {
    get: key => (key === 'seller' ? seller : null)
  }
  globalThis.fromUuidSync = uuid => (uuid === 'Actor.vendor' ? vendor : null)
  return {
    vendor, seller
  }
}

const offerFor = (lines, extra = {
}) => ({
  vendorUuid: 'Actor.vendor', storageId: 'shop', sellerId: 'seller', lines, ...extra,
})

describe('a vendor buying back (SR5 p. 421, no search for a buyer)', () => {
  it('offers 25 % ± 5 % per net hit, rolled on the gamemaster\'s browser, and pays from its cashbox', async () => {
    const {
      vendor, seller
    } = world()
    vi.spyOn(SR5ShopAvailability, 'rollDice')
      .mockResolvedValueOnce({
        hits: 3, glitch: false, criticalGlitch: false
      })
      .mockResolvedValueOnce({
        hits: 1, glitch: false, criticalGlitch: false
      })
    expect(await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1, total: 99999
    }]), player.id)).toBe(true)
    const message = messages.get('m0')
    expect(message.flags.sr5vendorOffer.total).toBe(350)
    expect(await SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)).toBe(true)
    expect(vendor.items.get('till').system.funds.value).toBe(4650)
    expect(seller.items.get('gun')).toBeUndefined()
    expect(vendor.created[0].system.storedIn).toBe('shop')
    expect(seller.created[0].system).toMatchObject({
      amount: 350, type: 'gain'
    })
  })

  it('takes a contact standing for the vendor at 5 % × Loyalty, without a test', async () => {
    const contact = {
      id: 'c', name: 'Clinique', type: 'itemContact', system: {
        loyalty: 3
      }
    }
    world({
      sellerItems: [gun(), contact]
    })
    const roll = vi.spyOn(SR5ShopAvailability, 'rollDice')
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }], {
      contactId: 'c'
    }), player.id)
    expect(roll).not.toHaveBeenCalled()
    expect(messages.get('m0').flags.sr5vendorOffer.total).toBe(150)
  })

  it('does not take Loyalty from a contact who is someone else', async () => {
    const contact = {
      id: 'c', name: 'Joe le fixer', type: 'itemContact', system: {
        loyalty: 6
      }
    }
    world({
      sellerItems: [gun(), contact]
    })
    vi.spyOn(SR5ShopAvailability, 'rollDice').mockResolvedValue({
      hits: 0, glitch: false, criticalGlitch: false
    })
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }], {
      contactId: 'c'
    }), player.id)
    expect(messages.get('m0').flags.sr5vendorOffer.viaContact).toBe(false)
  })

  it('refuses what is not on its shelves, unless it buys everything', async () => {
    world({
      shop: {
        shelves: ['magic']
      }
    })
    expect(await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)).toBe(false)
  })

  it('refuses an offer card a player wrote: only the gamemaster\'s card is paid', async () => {
    const {
      vendor, seller
    } = world()
    messages.set('forged', {
      id: 'forged', author: player, content: '',
      flags: {
        sr5vendorOffer: {
          vendorUuid: 'Actor.vendor', storageId: 'shop', sellerId: 'seller', shop: 'Clinique', total: 5000,
          results: [{
            itemId: 'gun', name: 'Ares Predator', quantity: 1, total: 5000
          }],
        }
      },
      update: async () => {},
    })
    expect(await SR5ShopVendor.accept({
      messageId: 'forged'
    }, player.id)).toBe(false)
    expect(vendor.items.get('till').system.funds.value).toBe(5000)
    expect(seller.items.get('gun')).toBeDefined()
  })

  it('pays an offer once, however often it is accepted', async () => {
    const {
      vendor
    } = world()
    vi.spyOn(SR5ShopAvailability, 'rollDice').mockResolvedValue({
      hits: 0, glitch: false, criticalGlitch: false
    })
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    const results = await Promise.all([1, 2].map(() => SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(vendor.items.get('till').system.funds.value).toBe(4750)
  })

  it('cannot pay more than its cashbox holds', async () => {
    const {
      seller
    } = world({
      funds: 100
    })
    vi.spyOn(SR5ShopAvailability, 'rollDice').mockResolvedValue({
      hits: 0, glitch: false, criticalGlitch: false
    })
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    expect(await SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)).toBe(false)
    expect(seller.items.get('gun')).toBeDefined()
  })

  it('refuses a seller the player does not own', async () => {
    world()
    globalThis.game.users = Object.assign([gm, player], {
      get: key => (key === 'intruder' ? {
        id: 'intruder', isGM: false
      } : [gm, player].find(u => u.id === key))
    })
    expect(await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), 'intruder')).toBe(false)
  })
})
