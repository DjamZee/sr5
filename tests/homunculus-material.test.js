import {
  describe, it, expect
} from 'vitest'
import {
  homunculusMaterialRatings
} from '../modules/entities/actors/homunculus.js'
import {
  SR5, SR5_BARRIER_RATINGS
} from '../modules/config.js'

// SR5 p. 301: the Body of a homunculus is the Structure of the material it is made of (table SR5 p. 198)
describe('homunculus material (SR5 p. 301)', () => {
  it('gives the Structure and Armor of a material of the table', () => {
    expect(homunculusMaterialRatings({
      type: 'heavy'
    })).toEqual({
      structure: 6, armor: 8
    })
    expect(homunculusMaterialRatings({
      type: 'fragile'
    })).toEqual({
      structure: 1, armor: 2
    })
    expect(homunculusMaterialRatings({
      type: 'hardened'
    })).toEqual({
      structure: 16, armor: 32
    })
  })

  it('reads the values typed in for another material', () => {
    expect(homunculusMaterialRatings({
      type: 'other', structure: 7, armor: 3
    })).toEqual({
      structure: 7, armor: 3
    })
    expect(homunculusMaterialRatings({
      type: 'other', structure: -2, armor: ''
    })).toEqual({
      structure: 0, armor: 0
    })
  })

  it('leaves a homunculus without material at 0, as before', () => {
    expect(homunculusMaterialRatings(undefined)).toEqual({
      structure: 0, armor: 0
    })
    expect(homunculusMaterialRatings({
      type: ''
    })).toEqual({
      structure: 0, armor: 0
    })
  })

  it('offers every material of the table, and only them', () => {
    expect(Object.keys(SR5_BARRIER_RATINGS)).toEqual(Object.keys(SR5.barrierTypes))
  })
})
