import {
  describe, it, expect
} from 'vitest'
import {
  SR5ShopCatalog
} from '../modules/interface/shop-catalog.js'

const row = (fields) => ({
  name: 'Objet', nameVO: '', shelf: 'gear', sub: null, price: 100, availability: 0, legality: '', rating: 0, notForSale: false, ...fields,
})

// Lot 12: an item is found by its English name too, read in flags.sr5.nameVO (the Megapack sets it)
describe('shop search by VO name', () => {
  const rows = [
    row({
      name: 'Serrure mécanique', nameVO: 'Key/combination lock'
    }),
    row({
      name: 'Lunette de visée', nameVO: 'Imaging scope'
    }),
    row({
      name: 'Soda'
    }),
  ]

  it('finds an item by its English name, case ignored', () => {
    expect(SR5ShopCatalog.filter(rows, {
      search: 'IMAGING'
    }).map(r => r.name)).toEqual(['Lunette de visée'])
    expect(SR5ShopCatalog.filter(rows, {
      search: 'lock'
    }).map(r => r.name)).toEqual(['Serrure mécanique'])
  })

  it('still finds it by its French name, and an item without a VO name', () => {
    expect(SR5ShopCatalog.filter(rows, {
      search: 'serrure'
    }).map(r => r.name)).toEqual(['Serrure mécanique'])
    expect(SR5ShopCatalog.filter(rows, {
      search: 'soda'
    }).map(r => r.name)).toEqual(['Soda'])
  })

  it('reads the VO name from the flag, empty when there is none or it is not text', () => {
    expect(SR5ShopCatalog.nameVO({
      flags: {
        sr5: {
          nameVO: ' Maglock '
        }
      }
    })).toBe('Maglock')
    expect(SR5ShopCatalog.nameVO({
      flags: {
      }
    })).toBe('')
    expect(SR5ShopCatalog.nameVO({
      flags: {
        sr5: {
          nameVO: 3
        }
      }
    })).toBe('')
    expect(SR5ShopCatalog.nameVO(null)).toBe('')
  })
})
