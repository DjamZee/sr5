import {
  describe, it, expect, beforeEach, afterEach, vi
} from 'vitest'
import {
  VENDOR_TEMPLATES, VENDOR_FAMILIES, templateBanners, templateShop, vendorTemplate, bannerFolderOf, MEGAPACK_BANNER_FOLDER
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

  it('reads the Megapack banners when the setting is empty and the Megapack is active', () => {
    expect(bannerFolderOf('', true)).toBe('modules/megapack-sr5-foundry-vtt/assets/banners-shop')
    expect(bannerFolderOf('  ', true)).toBe(MEGAPACK_BANNER_FOLDER)
    expect(bannerFolderOf('', false)).toBe('')
    expect(bannerFolderOf(null, false)).toBe('')
    // The gamemaster's own folder always wins
    expect(bannerFolderOf(' mes/bannieres ', true)).toBe('mes/bannieres')
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
const SOURCE = 'Compendium.sr5.weapons.Item.fichetti'
const PANTHER = 'Compendium.sr5.weapons.Item.panther'

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
      _id: item.id, name: item.name, type: item.type, system: item.system, flags: item.flags ?? {
      }
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
// The seller's copy of a Fichetti listed 350¥ in the compendium; its owner may write any price on it
const gun = (price = 350, extra = {
}) => ({
  id: 'gun', name: 'Fichetti Security 600', type: 'itemWeapon',
  _stats: {
    compendiumSource: SOURCE
  },
  system: {
    storedIn: '', price: {
      value: price, base: price
    }, availability: {
      value: 4
    }
  },
  ...extra,
})
const compendiumFichetti = {
  uuid: SOURCE, name: 'Fichetti Security 600', type: 'itemWeapon',
  system: {
    price: {
      value: 350, base: 350
    }
  },
  _source: {
    system: {
      price: {
        base: 350
      }
    }
  },
}

let SR5ShopVendor, SR5ShopAvailability
const messages = new Map()
let confirmAnswer = {
  accepted: true
}
let confirmations = 0
let reviews = []
// The keys of the messages the gamemaster sends a player (#notify)
const notices = []

beforeEach(async () => {
  vi.resetModules()
  vi.doMock('../modules/socket.js', () => ({
    SR5_SocketHandler: {
      emitForPlayer: async (type, data) => notices.push(data?.key), emitForGM: async () => {}
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
    get: key => messages.get(key),
    find: fn => [...messages.values()].find(fn),
  }
  globalThis.fromUuid = async uuid => (uuid === SOURCE ? compendiumFichetti : null)
  confirmAnswer = {
    accepted: true
  }
  confirmations = 0
  reviews = []
  // The gamemaster's look at every buy-back: an answer chosen by each test
  SR5ShopVendor.confirmBuyBack = async review => {
    confirmations++
    reviews.push(review)
    return typeof confirmAnswer === 'function' ? confirmAnswer(review) : confirmAnswer
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
  delete globalThis.fromUuid
  vi.restoreAllMocks()
})

function world({
  funds = 50000, shop = {
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
const noHits = () => vi.spyOn(SR5ShopAvailability, 'rollDice').mockResolvedValue({
  hits: 0, glitch: false, criticalGlitch: false
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
    expect(messages.get('m0').flags.sr5vendorOffer.total).toBe(123)
    expect(await SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)).toBe(true)
    expect(vendor.items.get('till').system.funds.value).toBe(50000 - 123)
    expect(seller.items.get('gun')).toBeUndefined()
    expect(vendor.created[0].system.storedIn).toBe('shop')
    expect(seller.created[0].system).toMatchObject({
      amount: 123, type: 'gain'
    })
  })

  it('proposes the price of the source, never the one the player wrote on her copy', async () => {
    const {
      vendor
    } = world({
      sellerItems: [gun(25000)]
    })
    noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    const offer = messages.get('m0').flags.sr5vendorOffer
    expect(offer.results[0]).toMatchObject({
      listed: 350, origin: 'source'
    })
    expect(offer.total).toBe(88)
    await SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)
    expect(vendor.created[0].system.price.base).toBe(350)
  })

  it('asks the gamemaster for every buy-back, even one whose source looks right (Élise, B1 final)', async () => {
    const {
      vendor
    } = world()
    noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    await SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)
    expect(confirmations).toBe(1)
    expect(reviews[0].lines[0]).toMatchObject({
      name: 'Fichetti Security 600', origin: 'source', mismatches: []
    })
    expect(vendor.items.get('till').system.funds.value).toBe(50000 - 88)
  })

  it('shows a forged shopSource for what it is: the figures of the item against those of its source', async () => {
    // Nora's second attack: a Fichetti renamed after the Panther, its shopSource written by hand
    const panther = {
      uuid: PANTHER, name: 'Panther XXL', type: 'itemWeapon',
      system: {
        price: {
          value: 43000, base: 43000
        }, category: 'heavyWeapon', damageValue: {
          base: 17
        }, damageType: 'P', armorPenetration: {
          base: -6
        }, firingMode: {
          singleShot: true
        }
      },
    }
    globalThis.fromUuid = async uuid => (uuid === PANTHER ? panther : uuid === SOURCE ? compendiumFichetti : null)
    const {
      vendor, seller
    } = world({
      sellerItems: [gun(350, {
        name: 'Panther XXL',
        flags: {
          sr5: {
            shopSource: PANTHER
          }
        },
        system: {
          storedIn: '', price: {
            value: 350, base: 350
          }, category: 'lightPistol', damageValue: {
            base: 6
          }, damageType: 'P', armorPenetration: {
            base: 0
          }, firingMode: {
            semiAutomatic: true
          }
        },
      })]
    })
    noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    confirmAnswer = {
      accepted: false
    }
    expect(await SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)).toBe(false)
    expect(confirmations).toBe(1)
    expect(reviews[0].lines[0].mismatches).toEqual(expect.arrayContaining(['category', 'damage', 'ap', 'modes']))
    expect(vendor.items.get('till').system.funds.value).toBe(50000)
    expect(seller.items.get('gun')).toBeDefined()
  })

  it('pays the price the gamemaster corrected, and checks the cashbox against it', async () => {
    const {
      vendor, seller
    } = world()
    noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    confirmAnswer = {
      accepted: true, units: [40]
    }
    expect(await SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)).toBe(true)
    expect(vendor.items.get('till').system.funds.value).toBe(50000 - 40)
    expect(seller.created[0].system.amount).toBe(40)
  })

  it('keeps the queue moving while the gamemaster reads the buy-back', async () => {
    world()
    noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    let answer
    confirmAnswer = () => new Promise(resolve => {
      answer = resolve
    })
    const accepting = SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)
    await tick()
    await tick()
    // Another request goes through the queue while the dialog is open: it is not held up
    const other = await Promise.race([
      SR5ShopVendor.offer(offerFor([{
        itemId: 'gun', quantity: 1
      }]), player.id).then(() => 'answered'),
      new Promise(resolve => setTimeout(() => resolve('held up'), 500)),
    ])
    expect(other).toBe('answered')
    answer({
      accepted: true
    })
    expect(await accepting).toBe(true)
  })

  it('without any source, proposes the shelf price of that name', async () => {
    vi.doMock('../modules/interface/shop-window.js', () => ({
      SR5ShopWorldSource: {
        index: async () => [{
          uuid: 'Compendium.megapack.weapons.Item.f', type: 'itemWeapon', name: 'Fichetti Security 600',
          system: {
            price: {
              value: 350, base: 350
            }
          },
        }],
      },
    }))
    world({
      sellerItems: [gun(25000, {
        _stats: {
          compendiumSource: 'Compendium.gone.pack.Item.x'
        }
      })]
    })
    noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    expect(messages.get('m0').flags.sr5vendorOffer.results[0]).toMatchObject({
      listed: 350, origin: 'name'
    })
  })

  it('gives the contact rate to the vendor\'s client contacts only, at the Loyalty the gamemaster set', async () => {
    const forged = {
      id: 'c', name: 'vendor', type: 'itemContact', system: {
        loyalty: 40
      }
    }
    world({
      sellerItems: [gun(), forged], shop: {
        clients: [{
          actorId: 'seller', loyalty: 2
        }]
      }
    })
    const roll = vi.spyOn(SR5ShopAvailability, 'rollDice')
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }], {
      contactId: 'c'
    }), player.id)
    expect(roll).not.toHaveBeenCalled()
    expect(messages.get('m0').flags.sr5vendorOffer).toMatchObject({
      viaContact: true, percent: 10, total: 35
    })
  })

  it('ignores a contact the player made herself, whatever its name and Loyalty (Nora\'s review)', async () => {
    const forged = {
      id: 'c', name: 'Clinique', type: 'itemContact', system: {
        loyalty: 40
      }
    }
    world({
      sellerItems: [gun(), forged]
    })
    noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }], {
      contactId: 'c'
    }), player.id)
    expect(messages.get('m0').flags.sr5vendorOffer).toMatchObject({
      viaContact: false, percent: 25
    })
  })

  it('keeps one open offer per item, and after the seller\'s no only the gamemaster unlocks it (Élise, B1 final)', async () => {
    world()
    const roll = noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    expect(await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)).toBe(false)
    expect(messages.size).toBe(1)
    await vi.dynamicImportSettled()
    expect(notices.at(-1)).toBe('SR5.WARN_ShopVendorOfferOpen')
    // The seller declines: the item stays locked at this vendor
    expect(await SR5ShopVendor.decline({
      messageId: 'm0'
    }, player.id)).toBe(true)
    const rolls = roll.mock.calls.length
    expect(await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)).toBe(false)
    expect(roll.mock.calls.length).toBe(rolls)
    // Not "accept or decline it first": it is declined, and only the gamemaster lifts the lock (S9, Quitterie)
    await vi.dynamicImportSettled()
    expect(notices.at(-1)).toBe('SR5.WARN_ShopVendorOfferLocked')
    // A player cannot lift the lock; the gamemaster can
    expect(await SR5ShopVendor.unlock({
      messageId: 'm0'
    }, player.id)).toBe(false)
    expect(await SR5ShopVendor.unlock({
      messageId: 'm0'
    }, gm.id)).toBe(true)
    expect(await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)).toBe(true)
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
            itemId: 'gun', name: 'Fichetti Security 600', quantity: 1, total: 5000, verified: true
          }],
        }
      },
      update: async () => {},
    })
    expect(await SR5ShopVendor.accept({
      messageId: 'forged'
    }, player.id)).toBe(false)
    expect(vendor.items.get('till').system.funds.value).toBe(50000)
    expect(seller.items.get('gun')).toBeDefined()
  })

  it('pays an offer once, however often it is accepted', async () => {
    const {
      vendor
    } = world()
    noHits()
    await SR5ShopVendor.offer(offerFor([{
      itemId: 'gun', quantity: 1
    }]), player.id)
    const results = await Promise.all([1, 2].map(() => SR5ShopVendor.accept({
      messageId: 'm0'
    }, player.id)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(vendor.items.get('till').system.funds.value).toBe(50000 - 88)
  })

  it('cannot pay more than its cashbox holds', async () => {
    const {
      seller
    } = world({
      funds: 10
    })
    noHits()
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

describe('a vendor made from a template haggles (Nora\'s review)', () => {
  it('uses the pool set on the shop when its sheet has none', async () => {
    const {
      vendor
    } = world({
      shop: {
        negotiationPool: 8
      }
    })
    expect(SR5ShopVendor.searcherOf(vendor, vendor.items.get('shop')).pool.pool).toBe(8)
  })
})
