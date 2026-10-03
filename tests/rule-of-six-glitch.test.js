import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// Faces the next rolls will show, in order
let faces = []

/** Stand-in for Foundry's Roll: "Nd6x6...cs>=5". As Die#explode, each 6 adds a die at the end of the results. */
globalThis.Roll = class {
  constructor(formula) {
    this.formula = formula
  }
  async evaluate() {
    const count = Number(this.formula.match(/^(\d+)d/)[1])
    this.results = faces.splice(0, count).map(result => ({
      result, active: true
    }))
    if (this.formula.includes('x6')) {
      for (let i = 0; i < this.results.length; i++) {
        if (this.results[i].result !== 6) continue
        this.results[i].exploded = true
        this.results.push({
          result: faces.shift(), active: true
        })
      }
    }
    const limit = Number(this.formula.match(/kh(\d+)/)?.[1] ?? Infinity)
    this.total = Math.min(this.results.filter(r => r.result >= 5).length, limit)
    return this
  }
  toJSON() {
    return {
      terms: [{
        class: 'Die', faces: 6, modifiers: [], results: this.results
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

beforeEach(() => {
  faces = []
})

/** Roll a pool showing these faces, then these rerolled faces for the 6 (SR5 p. 56-57) */
async function roll(dicePool, rolled, explose = true) {
  faces = [...rolled]
  return SR5_RollTest.rollDice({
    dicePool, explose
  })
}

describe('Rule of Six and glitch (SR5 p. 56-57, ruling B30)', () => {
  it('the 1s of the rerolled dice do not make a glitch', async () => {
    // 4 dice: 6, 6, 1, 2 then the two rerolls show 1 and 1. First roll: one 1 out of 4
    const result = await roll(4, [6, 6, 1, 2, 1, 1])
    expect(result.glitchRoll).toBe(false)
    expect(result.criticalGlitchRoll).toBe(false)
    expect(result.hits).toBe(2)
  })

  it('the 1s of the first roll still make a glitch, hits of the rerolls included', async () => {
    // 4 dice: 6, 1, 1, 1 then the reroll shows 5. Three 1 out of 4, three hits
    const result = await roll(4, [6, 1, 1, 1, 5])
    expect(result.glitchRoll).toBe(true)
    expect(result.hits).toBe(2)
  })

  it('a critical glitch reads the same way: rerolled 1s do not count', async () => {
    // No 6, no reroll: two 1 out of 3, no hit
    expect((await roll(3, [1, 1, 2])).criticalGlitchRoll).toBe(true)
    // A 6 is a hit, so never a critical glitch; its reroll 1 does not add to the 1s
    const result = await roll(3, [6, 1, 2, 1])
    expect(result.glitchRoll).toBe(false)
    expect(result.criticalGlitchRoll).toBe(false)
  })

  it('a rerolled 1 is not shown as a glitch die', async () => {
    const result = await roll(2, [6, 2, 1])
    expect(result.dices[2].glitch).toBeUndefined()
  })

  it('without the Rule of Six nothing changes', async () => {
    const result = await roll(4, [6, 1, 1, 1], false)
    expect(result.glitchRoll).toBe(true)
    expect(result.dices).toHaveLength(4)
  })

  it('Push the limit after the roll: only the first Edge dice count for the glitch', async () => {
    // First roll 1, 1, 2, 5, then Edge 3 shows 6, 1, 2 and the reroll 1:
    // three 1 out of 7 dice, no glitch; the rerolled 1 would make it four
    faces = [1, 1, 2, 5]
    const first = await SR5_RollTest.rollDice({
      dicePool: 4
    })
    const message = {
      id: 'm1', flags: {
        sr5data: {
          roll: JSON.parse(JSON.stringify({
            ...first, originalRoll: null, r: null
          })),
          dicePool: {
            value: 4, base: 4, modifiers: []
          },
          limit: {
            value: 6
          },
          edge: {
          },
          test: {
            type: 'skill', extended: {
            }
          },
          owner: {
          },
        }
      }
    }
    const {
      SR5_RollTestHelper
    } = await import('../modules/rolls/roll-test-helper.js')
    const {
      SR5_RollMessage
    } = await import('../modules/rolls/roll-message.js')
    let updatedCard
    vi.spyOn(SR5_RollTest, 'addInfoToCard').mockImplementation(async () => {})
    vi.spyOn(SR5_RollTestHelper, 'removeEdgeFromActor').mockImplementation(async () => {})
    vi.spyOn(SR5_RollTestHelper, 'handleDicePoolModifiers').mockImplementation(async m => m)
    vi.spyOn(SR5_RollMessage, 'updateRollCardHelper').mockImplementation(async (_id, m) => {
      updatedCard = m
    })
    faces = [6, 1, 2, 1]
    await SR5_RollTest.pushTheLimit(message, {
      type: 'actorPc', system: {
        specialAttributes: {
          edge: {
            augmented: {
              value: 3
            }
          }
        }
      }
    })
    expect(updatedCard.roll.glitchRoll).toBe(false)
    expect(updatedCard.roll.hits).toBe(2)
  })
})
