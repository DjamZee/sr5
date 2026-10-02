import {
  describe, it, expect
} from 'vitest'

// Faces the next roll will show, in order
let faces = []

globalThis.Roll = class {
  constructor(formula) {
    this.formula = formula
  }
  async evaluate() {
    this.dice = [{
      results: faces.map(result => ({
        result, active: true
      }))
    }]
    return this
  }
}

const {
  SR5ShopAvailability
} = await import('../modules/interface/shop-availability.js')

async function roll(rolled) {
  faces = rolled
  return SR5ShopAvailability.rollDice(rolled.length)
}

describe('Shop availability glitch (SR5 p. 47)', () => {
  it('exactly half the dice showing 1 is no glitch', async () => {
    const result = await roll([1, 1, 3, 5])
    expect(result.glitch).toBe(false)
    expect(result.criticalGlitch).toBe(false)
  })

  it('exactly half the dice showing 1 and no hit is no critical glitch', async () => {
    const result = await roll([1, 1, 2, 3])
    expect(result.glitch).toBe(false)
    expect(result.criticalGlitch).toBe(false)
  })

  it('more than half the dice showing 1 is a glitch', async () => {
    const result = await roll([1, 1, 1, 5])
    expect(result.glitch).toBe(true)
    expect(result.criticalGlitch).toBe(false)
  })

  it('more than half the dice showing 1 and no hit is a critical glitch', async () => {
    const result = await roll([1, 1, 1, 2, 4])
    expect(result.glitch).toBe(true)
    expect(result.criticalGlitch).toBe(true)
  })

  it('a single die showing 1 is a critical glitch', async () => {
    const result = await roll([1])
    expect(result.criticalGlitch).toBe(true)
  })
})
