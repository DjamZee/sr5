import {
  describe, it, expect
} from 'vitest'
import {
  SR5ShopCatalog
} from '../modules/interface/shop-catalog.js'
import items from './fixtures/shop-prepared-items.json' with { type: 'json' }

const item = (type, system = {
}, extra = {
}) => ({
  type, system, name: extra.name ?? type, ...extra
})

const row = (fields) => ({
  name: 'Objet', shelf: 'gear', sub: null, price: 100, availability: 0, legality: '', rating: 0, notForSale: false, ...fields,
})

describe('shop shelves', () => {
  it('puts cyberware and bioware on their own shelves, other implants after them', () => {
    expect(SR5ShopCatalog.shelfOf(item('itemAugmentation', {
      type: 'cyberware'
    }))).toBe('cyberware')
    expect(SR5ShopCatalog.shelfOf(item('itemAugmentation', {
      type: 'culturedBioware'
    }))).toBe('bioware')
    expect(SR5ShopCatalog.shelfOf(item('itemAugmentation', {
      type: 'genetech'
    }))).toBe('augmentations')
  })

  it('splits weapons by category, and knows nothing of qualities', () => {
    expect(SR5ShopCatalog.subOf(item('itemWeapon', {
      category: 'meleeWeapon'
    }))).toBe('meleeWeapon')
    expect(SR5ShopCatalog.subOf(item('itemWeapon', {
    }))).toBe('_none')
    expect(SR5ShopCatalog.shelfOf(item('itemQuality'))).toBeNull()
  })

  it('shelves toxins with the drugs', () => {
    expect(SR5ShopCatalog.shelfOf(item('itemToxin'))).toBe('drugs')
  })
})

describe('creation limits, SR5 p. 66 and p. 420', () => {
  it('has the book level by default and the two other levels of p. 66', () => {
    expect(SR5ShopCatalog.creationLimits('standard')).toEqual({
      availability: 12, rating: 6, source: 'p420'
    })
    expect(SR5ShopCatalog.creationLimits('street')).toEqual({
      availability: 10, rating: 4, source: 'p66'
    })
    expect(SR5ShopCatalog.creationLimits('elite')).toEqual({
      availability: 15, rating: 6, source: 'p66'
    })
    expect(SR5ShopCatalog.creationLimits('nonsense')).toEqual({
      availability: 12, rating: 6, source: 'p420'
    })
  })

  it('takes the free values as the gamemaster typed them, 0 being no limit on either', () => {
    const limits = SR5ShopCatalog.creationLimits('custom', {
      availability: '0', rating: 0
    })
    expect(limits).toEqual({
      availability: 0, rating: 0, source: 'custom'
    })
    expect(SR5ShopCatalog.creationBlock(row({
      availability: 30, rating: 12
    }), limits)).toBeNull()
    expect(SR5ShopCatalog.creationBlock(row({
      availability: 30
    }), {
      availability: 14, rating: 0
    })).toBe('availability')
  })

  it('blocks above the availability, above the rating, and a rating of 0 means none', () => {
    const limits = {
      availability: 12, rating: 6
    }
    expect(SR5ShopCatalog.creationBlock(row({
      availability: 12, rating: 6
    }), limits)).toBeNull()
    expect(SR5ShopCatalog.creationBlock(row({
      availability: 13
    }), limits)).toBe('availability')
    expect(SR5ShopCatalog.creationBlock(row({
      rating: 7
    }), limits)).toBe('rating')
    expect(SR5ShopCatalog.creationBlock(row({
      rating: 9
    }), {
      availability: 12, rating: 0
    })).toBeNull()
    expect(SR5ShopCatalog.creationBlock(row({
      availability: 20
    }), null)).toBeNull()
  })

  it('reads the device rating as the rating (SR5 p. 420: indice ou Indice d’appareil)', () => {
    expect(SR5ShopCatalog.ratingOf({
      itemRating: 2, deviceRating: 5
    })).toBe(5)
  })
})

describe('a row', () => {
  it('regrades an implant: price, availability and Essence follow the grade (SR5 p. 454)', () => {
    const eyes = item('itemAugmentation', {
      type: 'cyberware', grade: 'standard', price: {
        base: 1000
      }, availability: {
        base: 5
      }, legality: 'R', essenceCost: {
        base: 0.2
      },
    })
    expect(SR5ShopCatalog.describe(eyes, 'alphaware')).toMatchObject({
      price: 1200, availability: 7, legality: 'R', essence: 0.16
    })
  })

  it('has no Essence outside implants and no legality letter on legal gear', () => {
    expect(SR5ShopCatalog.describe(item('itemGear', {
      price: {
        base: 5
      }
    }))).toMatchObject({
      price: 5, availability: 0, legality: '', essence: null
    })
  })

  it('gives the dot by the margin of the pool over the availability, and none on common goods', () => {
    expect(SR5ShopCatalog.odds(9, 5)).toBe('good')
    expect(SR5ShopCatalog.odds(9, 9)).toBe('even')
    expect(SR5ShopCatalog.odds(9, 10)).toBe('even')
    expect(SR5ShopCatalog.odds(9, 11)).toBe('poor')
    expect(SR5ShopCatalog.odds(9, 0)).toBeNull()
  })
})

describe('filters run on the whole catalogue', () => {
  const rows = [
    row({
      name: 'Épée', shelf: 'weapons', sub: 'meleeWeapon', price: 500, availability: 4
    }),
    row({
      name: 'Predator', shelf: 'weapons', sub: 'rangedWeapon', price: 725, availability: 5, legality: 'R'
    }),
    row({
      name: 'Alpha', shelf: 'weapons', sub: 'rangedWeapon', price: 2650, availability: 11, legality: 'F'
    }),
    row({
      name: 'Prototype', shelf: 'weapons', sub: 'rangedWeapon', price: 1, availability: 24, legality: 'F', notForSale: true
    }),
    row({
      name: 'Soda', price: 5
    }),
  ]

  it('never counts a hidden prototype for a player (lot A review: the "4 / 5" counter)', () => {
    expect(SR5ShopCatalog.filter(rows, {
      shelf: 'weapons'
    })).toHaveLength(3)
    expect(SR5ShopCatalog.filter(rows, {
      shelf: 'weapons', prototypes: true
    })).toHaveLength(4)
  })

  it('filters by shelf, sub-shelf and name without accents', () => {
    expect(SR5ShopCatalog.filter(rows, {
      shelf: 'weapons', sub: 'meleeWeapon'
    }).map(r => r.name)).toEqual(['Épée'])
    expect(SR5ShopCatalog.filter(rows, {
      search: 'epee'
    }).map(r => r.name)).toEqual(['Épée'])
  })

  it('filters by price, availability and legality', () => {
    expect(SR5ShopCatalog.filter(rows, {
      maxPrice: 700
    }).map(r => r.name)).toEqual(['Épée', 'Soda'])
    expect(SR5ShopCatalog.filter(rows, {
      maxAvailability: 4
    }).map(r => r.name)).toEqual(['Épée', 'Soda'])
    expect(SR5ShopCatalog.filter(rows, {
      legality: ['', 'R']
    }).map(r => r.name)).toEqual(['Épée', 'Predator', 'Soda'])
  })

  it('keeps only what the budget left once the cart is paid covers, and what creation allows', () => {
    expect(SR5ShopCatalog.filter(rows, {
      affordable: true, budget: 600
    }).map(r => r.name)).toEqual(['Épée', 'Soda'])
    expect(SR5ShopCatalog.filter(rows, {
      affordable: true, budget: Infinity, creation: {
        availability: 10, rating: 6
      }
    }).map(r => r.name)).toEqual(['Épée', 'Predator', 'Soda'])
  })
})

describe('what the window shows is what the till charges (second review, Kira)', () => {
  // Real items of the Megapack 2.0.12, read as stored in the compendium and as prepared by
  // the system: an ammunition sold by the pack, a weapon priced with its accessories, an armour
  // priced by rating, a vehicle whose Device Rating only exists once prepared
  for (const item of items) {
    it(`keeps every figure of ${item.name} through the shop's copy`, () => {
      const charged = SR5ShopCatalog.describe({
        type: item.type, system: item.prepared
      })
      const shown = SR5ShopCatalog.describe({
        type: item.type, system: SR5ShopCatalog.essentials(item.prepared)
      })
      expect(shown).toEqual(charged)
    })
  }

  it('would be wrong from the stored data: the reason each entry is prepared first', () => {
    const wrong = items.filter(item => {
      const stored = SR5ShopCatalog.describe({
        type: item.type, system: SR5ShopCatalog.essentials(item.stored)
      })
      const charged = SR5ShopCatalog.describe({
        type: item.type, system: item.prepared
      })
      return JSON.stringify(stored) !== JSON.stringify(charged)
    })
    expect(wrong.map(item => item.name)).toEqual(items.map(item => item.name))
  })
})