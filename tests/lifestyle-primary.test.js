import {
  describe, it, expect
} from 'vitest'
import {
  primaryLifestyle, primaryLifestyleUpdates
} from '../modules/system/lifestyle-primary.js'

// C4 (Adrore, 08/10): several lifestyles, one main one, the one the starting nuyen use (SR5 p. 97)
const lifestyle = (id, isPrimary = false) => ({
  id, type: 'itemLifestyle', system: {
    isPrimary
  }
})
const gear = {
  id: 'g', type: 'itemGear', system: {
  }
}

describe('primaryLifestyle', () => {
  it('reads the marked one', () => {
    expect(primaryLifestyle([lifestyle('a'), lifestyle('b', true), gear]).id).toBe('b')
  })
  it('takes the only lifestyle when none is marked', () => {
    expect(primaryLifestyle([gear, lifestyle('a')]).id).toBe('a')
  })
  it('answers null when several are held and none is marked', () => {
    expect(primaryLifestyle([lifestyle('a'), lifestyle('b')])).toBeNull()
    expect(primaryLifestyle([])).toBeNull()
  })
})

describe('primaryLifestyleUpdates', () => {
  it('marks the one clicked and takes the other mark off', () => {
    expect(primaryLifestyleUpdates([lifestyle('a', true), lifestyle('b'), lifestyle('c')], 'b')).toEqual([
      {
        _id: 'a', 'system.isPrimary': false
      },
      {
        _id: 'b', 'system.isPrimary': true
      },
    ])
  })
  it('a click on the main one takes its mark off', () => {
    expect(primaryLifestyleUpdates([lifestyle('a', true), lifestyle('b')], 'a')).toEqual([{
      _id: 'a', 'system.isPrimary': false
    }])
  })
  it('nothing for an unknown id or another item', () => {
    expect(primaryLifestyleUpdates([lifestyle('a'), gear], 'g')).toEqual([])
  })
})
