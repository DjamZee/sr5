import {
  describe, it, expect
} from 'vitest'
import {
  SR5, AUGMENTATION_GRADE_TABLE
} from '../modules/config.js'
import {
  SR5ShopGrades
} from '../modules/interface/shop-grades.js'
import {
  SR5ShopStock
} from '../modules/interface/shop-stock.js'

describe('implant grade table', () => {
  it('holds SR5 p. 454 for the five core grades', () => {
    const t = AUGMENTATION_GRADE_TABLE
    expect(t.used).toEqual({
      essence: 1.25, availability: -4, price: 0.75, deviceRating: 2
    })
    expect(t.standard).toEqual({
      essence: 1, availability: 0, price: 1, deviceRating: 2
    })
    expect(t.alphaware).toEqual({
      essence: 0.8, availability: 2, price: 1.2, deviceRating: 3
    })
    expect(t.betaware).toEqual({
      essence: 0.7, availability: 4, price: 1.5, deviceRating: 4
    })
    expect(t.deltaware).toEqual({
      essence: 0.5, availability: 8, price: 2.5, deviceRating: 5
    })
  })

  it('holds gamma (CF p. 74) and greyware (BTB p. 142)', () => {
    expect(AUGMENTATION_GRADE_TABLE.gamma).toMatchObject({
      essence: 0.4, availability: 12, price: 5
    })
    expect(AUGMENTATION_GRADE_TABLE.greyware).toMatchObject({
      essence: 0.75, availability: 0, price: 1.3
    })
  })

  it('labels every grade of the table', () => {
    expect(Object.keys(SR5.augmentationGrades).sort()).toEqual(Object.keys(AUGMENTATION_GRADE_TABLE).sort())
  })
})

describe('grades on offer', () => {
  it('offers the five core grades by default', () => {
    expect(SR5ShopGrades.available({
      augmentationType: 'cyberware'
    })).toEqual(['used', 'standard', 'alphaware', 'betaware', 'deltaware'])
  })

  it('offers only used, standard and alphaware at creation (SR5 p. 454)', () => {
    expect(SR5ShopGrades.available({
      augmentationType: 'bioware', creation: true
    })).toEqual(['used', 'standard', 'alphaware'])
  })

  it('never offers gamma at creation', () => {
    expect(SR5ShopGrades.available({
      augmentationType: 'cyberware', creation: true, gamma: true
    })).not.toContain('gamma')
    expect(SR5ShopGrades.available({
      augmentationType: 'cyberware', gamma: true
    })).toContain('gamma')
  })

  it('offers greyware for cyberware only, creation included (BTB p. 142)', () => {
    expect(SR5ShopGrades.available({
      augmentationType: 'cyberware', creation: true, greyware: true
    })).toContain('greyware')
    expect(SR5ShopGrades.available({
      augmentationType: 'bioware', greyware: true
    })).not.toContain('greyware')
  })

  it('keeps the options off when the world leaves them off', () => {
    const grades = SR5ShopGrades.available({
      augmentationType: 'cyberware'
    })
    expect(grades).not.toContain('gamma')
    expect(grades).not.toContain('greyware')
  })

  it('sells genetech and nanoware in no grade', () => {
    expect(SR5ShopGrades.isGraded('itemAugmentation', {
      type: 'genetech'
    })).toBe(false)
    expect(SR5ShopGrades.isGraded('itemAugmentation', {
      type: 'cyberware'
    })).toBe(true)
    expect(SR5ShopGrades.isGraded('itemGear', {
      type: 'cyberware'
    })).toBe(false)
  })
})

describe('regrading a compendium entry', () => {
  const standard = {
    grade: 'standard', price: {
      value: 1000
    }, availability: {
      value: 4
    }, essenceCost: {
      value: 0.2
    }
  }
  const alpha = {
    grade: 'alphaware', price: {
      value: 1200
    }, availability: {
      value: 6
    }, essenceCost: {
      value: 0.16
    }
  }

  it('prices from the standard grade', () => {
    expect(SR5ShopGrades.price(standard, 'deltaware')).toBe(2500)
    expect(SR5ShopGrades.price(standard, 'used')).toBe(750)
    expect(SR5ShopGrades.price(standard, 'gamma')).toBe(5000)
    expect(SR5ShopGrades.price(standard, 'greyware')).toBe(1300)
  })

  it('takes the entry\'s own grade out first', () => {
    expect(SR5ShopGrades.price(alpha, 'standard')).toBe(1000)
    expect(SR5ShopGrades.availability(alpha, 'betaware')).toBe(8)
    expect(SR5ShopGrades.essence(alpha, 'deltaware')).toBe(0.1)
  })

  it('moves availability and Essence', () => {
    expect(SR5ShopGrades.availability(standard, 'deltaware')).toBe(12)
    expect(SR5ShopGrades.availability(standard, 'used')).toBe(0)
    expect(SR5ShopGrades.essence(standard, 'used')).toBe(0.25)
  })

  it('leaves an item without availability without one', () => {
    expect(SR5ShopGrades.availability({
      price: {
        value: 100
      }
    }, 'deltaware')).toBe(0)
  })
})

describe('shelves', () => {
  const entry = (over = {
  }) => ({
    docName: 'Item', type: 'itemWeapon', packId: 'mega.armes', system: {
      price: {
        value: 500
      }
    }, ...over
  })

  it('sells goods from a shelf', () => {
    expect(SR5ShopStock.canSell(entry(), {
      excluded: []
    })).toBe(true)
  })

  it('never sells qualities, spells or powers', () => {
    for (const type of ['itemQuality', 'itemSpell', 'itemAdeptPower', 'itemMartialArt', 'itemSpiritType']) {
      expect(SR5ShopStock.canSell(entry({
        type
      }), {
        excluded: [], equip: true
      })).toBe(false)
    }
  })

  it('leaves out an unticked compendium, except in Equip mode', () => {
    expect(SR5ShopStock.canSell(entry(), {
      excluded: ['mega.armes']
    })).toBe(false)
    expect(SR5ShopStock.canSell(entry(), {
      excluded: ['mega.armes'], equip: true
    })).toBe(true)
  })

  it('keeps a prototype off the counter, except in Equip mode', () => {
    const proto = entry({
      flags: {
        sr5: {
          notForSale: true
        }
      }
    })
    expect(SR5ShopStock.canSell(proto, {
      excluded: []
    })).toBe(false)
    expect(SR5ShopStock.canSell(proto, {
      excluded: [], equip: true
    })).toBe(true)
  })

  it('reads a document as well as an index entry', () => {
    expect(SR5ShopStock.canSell({
      documentName: 'Item', type: 'itemGear', system: {
        price: {
          value: 1
        }
      }
    }, {
      excluded: []
    })).toBe(true)
  })
})

describe('buyers', () => {
  const root = {
    id: 'pj', folder: null
  }
  const sub = {
    id: 'equipe', folder: root
  }
  const actor = (id, type, folder = null, canShop = false, owners = []) => ({
    id, name: id, type, folder,
    flags: canShop ? {
      sr5: {
        canShop: true
      }
    } : {
    },
    testUserPermission: (user) => owners.includes(user.id),
  })
  const rex = actor('Rex', 'actorPc', null, false, ['joueur'])
  const chien = actor('Chien', 'actorPc', null)
  const vendeur = actor('Vendeur', 'actorGrunt', sub, false, ['joueur'])
  const drone = actor('Drone', 'actorDrone', null, true, ['joueur'])
  const all = [rex, chien, vendeur, drone]
  const gm = {
    id: 'mj', isGM: true
  }
  const player = {
    id: 'joueur', isGM: false
  }
  const names = (list) => list.map(a => a.name)

  it('takes player characters by default', () => {
    expect(names(SR5ShopStock.buyers(all, gm, {
      mode: 'owned'
    }))).toEqual(['Chien', 'Rex'])
  })

  it('takes a folder with its sub-folders', () => {
    expect(SR5ShopStock.inFolder(vendeur, 'pj')).toBe(true)
    expect(names(SR5ShopStock.buyers(all, gm, {
      mode: 'folder', folderId: 'pj'
    }))).toEqual(['Vendeur'])
  })

  it('takes the "Can shop" box, or folder or box', () => {
    expect(names(SR5ShopStock.buyers(all, gm, {
      mode: 'flag'
    }))).toEqual(['Drone'])
    expect(names(SR5ShopStock.buyers(all, gm, {
      mode: 'folderOrFlag', folderId: 'pj'
    }))).toEqual(['Drone', 'Vendeur'])
  })

  it('shows a player only what they own', () => {
    expect(names(SR5ShopStock.buyers(all, player, {
      mode: 'owned'
    }))).toEqual(['Rex'])
  })

  it('opens every actor to the gamemaster in Equip mode, and to no player', () => {
    expect(names(SR5ShopStock.buyers(all, gm, {
      equip: true
    }))).toEqual(['Chien', 'Drone', 'Rex', 'Vendeur'])
    expect(SR5ShopStock.buyers(all, player, {
      equip: true
    })).toEqual([])
  })
})
