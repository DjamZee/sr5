import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// Faces the next rolls will show, in order
let faces = []

/** Stand-in for Foundry's Roll: "Nd6...cs>=5" counts hits, capped by "khN" like Foundry keeps the N highest dice */
globalThis.Roll = class {
  constructor(formula) {
    this.formula = formula
  }
  async evaluate() {
    const count = Number(this.formula.match(/^(\d+)d/)[1])
    this.results = faces.splice(0, count).map(result => ({
      result, active: true
    }))
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
const {
  SR5_RollTestHelper
} = await import('../modules/rolls/roll-test-helper.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')

let updatedCard
beforeEach(() => {
  faces = []
  updatedCard = undefined
  vi.restoreAllMocks()
  vi.spyOn(SR5_RollTest, 'addInfoToCard').mockImplementation(async () => {})
  vi.spyOn(SR5_RollTest, 'showDiceSoNice').mockImplementation(async () => {})
  vi.spyOn(SR5_RollTestHelper, 'removeEdgeFromActor').mockImplementation(async () => {})
  vi.spyOn(SR5_RollMessage, 'updateRollCardHelper').mockImplementation(async (_id, m) => {
    updatedCard = m
  })
})

/** A card of 6 dice whose hits are already counted */
function card(hits, limit) {
  const dices = [5, 5, 5, 5, 2, 1].map(result => ({
    result
  }))
  return {
    id: 'm1',
    flags: {
      sr5data: {
        roll: {
          hits, dices: dices.slice(0, hits).concat(dices.slice(4))
        },
        dicePool: {
          value: hits + 2
        },
        limit: {
          value: limit
        },
        edge: {
        },
        test: {
        },
        owner: {
        },
      }
    }
  }
}

describe('Second Chance and limits (SR5 p. 58)', () => {
  it('adds nothing when the hits already reached the limit', async () => {
    faces = [6, 6]
    await SR5_RollTest.secondeChance(card(4, 4), {
      id: 'a1'
    })
    expect(updatedCard.roll.hits).toBe(4)
  })

  it('stops at the limit left', async () => {
    faces = [6, 6]
    await SR5_RollTest.secondeChance(card(3, 4), {
      id: 'a1'
    })
    expect(updatedCard.roll.hits).toBe(4)
  })

  it('keeps every new hit on a test without limit', async () => {
    faces = [6, 6]
    await SR5_RollTest.secondeChance(card(4, 0), {
      id: 'a1'
    })
    expect(updatedCard.roll.hits).toBe(6)
  })
})
