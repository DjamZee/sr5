import {
  describe, it, expect
} from 'vitest'
import {
  SR5ShopCatalog
} from '../modules/interface/shop-catalog.js'
import {
  creationOverLimitItems
} from '../modules/system/creation-actor.js'

// C3 (Adrore, 08/10): past the creation limits, refused by default (the book, SR5 p. 66, p. 420); where the table
// allows it, bought and marked for the gamemaster's creation summary
const limits = (overLimit) => ({
  availability: 12, rating: 6, source: 'p420', overLimit
})
const line = (availability, rating = 0) => ({
  availability, rating
})

describe('creation limits, past them', () => {
  it('the book refuses, and marks nothing', () => {
    expect(SR5ShopCatalog.creationRefusal(line(14), limits(false))).toBe('availability')
    expect(SR5ShopCatalog.overLimitMark(line(14), limits(false))).toBeNull()
  })
  it('the table that allows it refuses nothing, and marks what went past', () => {
    expect(SR5ShopCatalog.creationRefusal(line(14), limits(true))).toBeNull()
    expect(SR5ShopCatalog.overLimitMark(line(14), limits(true))).toEqual({
      reason: 'availability', value: 14, limit: 12
    })
    expect(SR5ShopCatalog.overLimitMark(line(8, 7), limits(true))).toEqual({
      reason: 'rating', value: 7, limit: 6
    })
  })
  it('within the limits, or out of creation: nothing', () => {
    expect(SR5ShopCatalog.overLimitMark(line(12, 6), limits(true))).toBeNull()
    expect(SR5ShopCatalog.creationRefusal(line(20), null)).toBeNull()
    expect(SR5ShopCatalog.overLimitMark(line(20), null)).toBeNull()
  })
  it('the summary reads the marked items of the sheet', () => {
    const actor = {
      items: [
        {
          id: 'a', name: 'Fusil', flags: {
            sr5: {
              creationOverLimit: {
                reason: 'availability', value: 14, limit: 12
              }
            }
          }
        },
        {
          id: 'b', name: 'Medkit', flags: {
          }
        },
      ]
    }
    expect(creationOverLimitItems(actor)).toEqual([{
      id: 'a', name: 'Fusil', reason: 'availability', value: 14, limit: 12
    }])
    expect(creationOverLimitItems(null)).toEqual([])
  })
})
