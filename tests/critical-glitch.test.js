import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// Faces the next roll will show, in order
let faces = []

/**
 * Stand-in for Foundry's Roll on a "Nd6[x6][khL]cs>=5" formula.
 * Like Foundry V13, a serialized Die term carries only its SERIALIZE_ATTRIBUTES
 * (number, faces, modifiers, results, method): it has no `total`.
 */
globalThis.Roll = class {
  constructor(formula) {
    this.formula = formula
  }
  async evaluate() {
    const results = faces.map(result => ({
      result, active: true
    }))
    const limit = Number(this.formula.match(/kh(\d+)/)?.[1] ?? Infinity)
    this.total = Math.min(results.filter(r => r.result >= 5).length, limit)
    this.results = results
    return this
  }
  toJSON() {
    return {
      terms: [{
        class: 'Die', number: faces.length, faces: 6, modifiers: [], results: this.results, method: 'manual'
      }]
    }
  }
}
game.settings = {
  get: () => 'publicroll'
}

const {
  SR5_RollTest
} = await import('../modules/rolls/roll-test.js')

async function roll(rolled, options = {
}) {
  faces = rolled
  return SR5_RollTest.rollDice({
    dicePool: rolled.length, ...options
  })
}

describe('Glitch and critical glitch (SR5 p. 47)', () => {
  beforeEach(() => {
    faces = []
  })

  it('a single die showing 1 is a critical glitch', async () => {
    const r = await roll([1])
    expect(r.criticalGlitchRoll).toBe(true)
    expect(r.glitchRoll).toBe(false)
  })

  it('more than half 1s and no hit is a critical glitch', async () => {
    const r = await roll([1, 1, 1, 2, 3])
    expect(r.criticalGlitchRoll).toBe(true)
    expect(r.glitchRoll).toBe(false)
  })

  it('more than half 1s with a hit is a glitch only', async () => {
    const r = await roll([1, 1, 1, 5, 3])
    expect(r.glitchRoll).toBe(true)
    expect(r.criticalGlitchRoll).toBe(false)
  })

  it('exactly half 1s is no glitch ("plus de la moitié")', async () => {
    const r = await roll([1, 1, 2, 3])
    expect(r.glitchRoll).toBe(false)
    expect(r.criticalGlitchRoll).toBe(false)
  })

  it('the SR5 p. 48 example: six 1s on 11 dice is a glitch', async () => {
    const r = await roll([1, 1, 1, 1, 1, 1, 5, 5, 6, 2, 3])
    expect(r.glitchRoll).toBe(true)
    expect(r.criticalGlitchRoll).toBe(false)
  })

  it('a limit does not hide the hits that were rolled', async () => {
    const r = await roll([1, 1, 1, 6, 2], {
      limit: 1
    })
    expect(r.hits).toBe(1)
    expect(r.glitchRoll).toBe(true)
    expect(r.criticalGlitchRoll).toBe(false)
  })

  it('no die rolled is neither glitch nor critical glitch', async () => {
    const r = await roll([])
    expect(r.glitchRoll).toBe(false)
    expect(r.criticalGlitchRoll).toBe(false)
  })
})
