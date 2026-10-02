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
  healingInfo, skillInfo
} = await import('../modules/rolls/roll-test-case/index.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_CombatHelpers
} = await import('../modules/rolls/roll-helpers/combat.js')

let updatedCard
beforeEach(() => {
  faces = []
  updatedCard = undefined
  vi.restoreAllMocks()
  vi.spyOn(SR5_RollTest, 'addInfoToCard').mockImplementation(async () => {})
  vi.spyOn(SR5_RollTest, 'showDiceSoNice').mockImplementation(async () => {})
  vi.spyOn(SR5_RollTestHelper, 'handleDicePoolModifiers').mockImplementation(async m => m)
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

function healingCard() {
  return {
    chatCard: {
      buttons: {
      }
    },
    test: {
      typeSub: 'physical', extended: {
        intervalValue: 1, multiplier: 1, roll: 1
      }
    },
    damage: {
    },
    roll: {
      hits: 2, criticalGlitchRoll: true
    },
  }
}

describe('Healing critical glitch (SR5 p. 208)', () => {
  // SR5 p. 208, example: 4 boxes, "a donc guéri de 3 cases", the 1D3 adds 2, "pour un total actuel de 3 cases"
  it('a critical glitch on a later roll still heals the hits of the earlier rolls', async () => {
    const message = await cardFrom([5, 5, 5, 2])
    faces = [1, 1, 2]
    await SR5_RollTest.extendedRoll(message, {
      id: 'a1'
    })
    const card = {
      ...healingCard(), test: {
        ...updatedCard.test, typeSub: 'physical', extended: {
          ...updatedCard.test.extended, multiplier: 1
        }
      }, roll: updatedCard.roll
    }
    expect(card.roll.criticalGlitchRoll).toBe(true)
    faces = [2]
    await healingInfo(card)
    expect(card.roll.netHits).toBe(3)
    expect(card.chatCard.buttons.heal).toBeDefined()
    expect(card.chatCard.buttons.damage).toBeDefined()
  })

  it('a critical glitch on the first roll heals nothing', async () => {
    const card = healingCard()
    faces = [2]
    await healingInfo(card)
    expect(card.roll.netHits).toBe(0)
    expect(card.chatCard.buttons.heal).toBeUndefined()
  })

  it('the Edge dice of a critical roll do not count as earlier hits', async () => {
    const card = healingCard()
    card.roll = {
      hits: 4, criticalGlitchRoll: true, rollDices: [{
        result: 6
      }, {
        result: 1
      }, {
        result: 1
      }, {
        result: 1
      }]
    }
    faces = [1]
    await healingInfo(card)
    expect(card.roll.netHits).toBe(3)
  })
})

describe('First aid critical glitch (SR5 p. 207)', () => {
  it('a cancelled damage type does not show "undefined" on the button', async () => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue({
      system: {
        skills: {
          firstAid: {
            rating: {
              value: 3
            }
          }
        }
      }
    })
    vi.spyOn(SR5_CombatHelpers, 'chooseDamageType').mockResolvedValue(undefined)
    const labels = []
    vi.spyOn(game.i18n, 'format').mockImplementation((key, data) => {
      labels.push(`${data?.hits}${data?.damageType}`)
      return key
    })
    const card = {
      chatCard: {
        buttons: {
        }
      },
      owner: {
        actorId: 'a1'
      },
      target: {
        hasTarget: true
      },
      test: {
        typeSub: 'firstAid'
      },
      damage: {
      },
      roll: {
        hits: 0, criticalGlitchRoll: true
      },
    }
    faces = [2]
    await skillInfo(card)
    expect(card.chatCard.buttons.damage).toBeDefined()
    expect(card.damage.value).toBe(2)
    expect(labels).toEqual(['2'])
  })
})
