import {
  describe, it, expect
} from 'vitest'
import {
  SR5Credstick
} from '../modules/interface/credstick.js'
import {
  isStorable
} from '../modules/interface/storage-rules.js'

const stick = (funds, storedIn = '') => ({
  type: 'itemGear',
  system: {
    isCredstick: true, storedIn, funds: {
      value: funds, max: 0
    }
  },
})
const actor = (...items) => ({
  items
})

describe('credsticks left in a storage', () => {
  it('can be put away like any other gear', () => {
    expect(isStorable(stick(100), {
      system: {
        type: 'stash'
      }
    })).toBe(true)
  })

  it('are not cash on hand', () => {
    const bearer = actor(stick(100), stick(5000, 'stashId'))
    expect(SR5Credstick.carried(bearer)).toHaveLength(1)
    expect(SR5Credstick.cashOnHand(bearer)).toBe(100)
  })

  it('count again once taken out', () => {
    expect(SR5Credstick.cashOnHand(actor(stick(100), stick(5000)))).toBe(5100)
  })
})
