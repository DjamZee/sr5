import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// Faces the next rolls will show, in order
let faces = []

/** Stand-in for Foundry's Roll: "Nd6...cs>=5" counts hits, "1d3" sums. A serialized Die has no total. */
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
    this.total = this.formula.includes('cs>=5') ?
      Math.min(this.results.filter(r => r.result >= 5).length, limit) :
      this.results.reduce((sum, r) => sum + r.result, 0)
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
const {
  healingInfo
} = await import('../modules/rolls/roll-test-case/index.js')

let updatedCard
beforeEach(() => {
  faces = []
  updatedCard = undefined
  vi.restoreAllMocks()
  vi.spyOn(SR5_RollTest, 'addInfoToCard').mockImplementation(async () => {})
  vi.spyOn(SR5_RollTest, 'showDiceSoNice').mockImplementation(async () => {})
  vi.spyOn(SR5_RollTestHelper, 'handleDicePoolModifiers').mockImplementation(async m => m)
  vi.spyOn(SR5_RollTestHelper, 'removeEdgeFromActor').mockImplementation(async () => {})
  vi.spyOn(SR5_RollMessage, 'updateRollCardHelper').mockImplementation(async (_id, m) => {
    updatedCard = m
  })
  vi.spyOn(SR5_RollMessage, 'generateChatButton').mockImplementation((_t, action) => action)
})

/** A chat message whose first roll showed these faces */
async function cardFrom(rolled) {
  faces = [...rolled]
  const roll = await SR5_RollTest.rollDice({
    dicePool: rolled.length
  })
  return {
    id: 'm1',
    flags: {
      sr5data: {
        roll: JSON.parse(JSON.stringify({
          ...roll, originalRoll: null, r: null
        })),
        dicePool: {
          value: rolled.length, modifiers: []
        },
        limit: {
          value: 0
        },
        edge: {
        },
        test: {
          extended: {
            roll: 1
          }
        },
        owner: {
        },
      }
    }
  }
}

describe('Push the limit after the roll (SR5 p. 47, 58)', () => {
  const actor = {
    type: 'actorPc', system: {
      specialAttributes: {
        edge: {
          augmented: {
            value: 2
          }
        }
      }
    }
  }

  it('a critical glitch turned into hits is no longer critical', async () => {
    const message = await cardFrom([1, 1, 2])
    expect(message.flags.sr5data.roll.criticalGlitchRoll).toBe(true)
    faces = [5, 3]
    await SR5_RollTest.pushTheLimit(message, actor)
    expect(updatedCard.roll.hits).toBe(1)
    expect(updatedCard.roll.criticalGlitchRoll).toBe(false)
  })

  it('Edge dice that are all 1s can make a glitch', async () => {
    const message = await cardFrom([1, 5, 2])
    faces = [1, 1]
    await SR5_RollTest.pushTheLimit(message, actor)
    expect(updatedCard.roll.glitchRoll).toBe(true)
  })
})

describe('Extended test (SR5 p. 51)', () => {
  it('a new roll carries its own glitch, not the first one', async () => {
    const message = await cardFrom([1, 1, 5, 2])
    message.flags.sr5data.roll.glitchRoll = true
    faces = [5, 2, 3]
    await SR5_RollTest.extendedRoll(message, {
      id: 'a1'
    })
    expect(updatedCard.roll.glitchRoll).toBe(false)
    expect(updatedCard.roll.criticalGlitchRoll).toBe(false)
  })

  it('a new roll with no hit and more than half 1s is a critical glitch', async () => {
    const message = await cardFrom([5, 5, 2, 3])
    faces = [1, 1, 2]
    await SR5_RollTest.extendedRoll(message, {
      id: 'a1'
    })
    expect(updatedCard.roll.criticalGlitchRoll).toBe(true)
  })

  it('a critical glitch ends the extended test', async () => {
    SR5_RollTest.addInfoToCard.mockRestore()
    const cardData = {
      chatCard: {
      },
      test: {
        type: 'unknown', isExtended: true, extended: {
          roll: 1, multiplier: 1
        }
      },
      dicePool: {
        value: 6
      },
      roll: {
        criticalGlitchRoll: true
      },
    }
    await SR5_RollTest.addInfoToCard(cardData, 'a1')
    expect(cardData.test.isExtended).toBe(false)
  })
})

describe('Healing critical glitch (SR5 p. 208)', () => {
  function healingCard() {
    return {
      chatCard: {
        buttons: {
        }
      },
      test: {
        typeSub: 'physical', extended: {
          intervalValue: 1
        }
      },
      damage: {
      },
      roll: {
        hits: 2, criticalGlitchRoll: true
      },
    }
  }

  it('rolls the 1D3 once, however often the card is refreshed', async () => {
    const card = healingCard()
    faces = [2]
    await healingInfo(card)
    faces = [3]
    card.chatCard.buttons = {
    }
    await healingInfo(card)
    expect(card.damage.value).toBe(2)
  })

  it('offers no healing on a critical glitch', async () => {
    const card = healingCard()
    faces = [2]
    await healingInfo(card)
    expect(card.chatCard.buttons.heal).toBeUndefined()
    expect(card.chatCard.buttons.damage).toBeDefined()
  })
})
