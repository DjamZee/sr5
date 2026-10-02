import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

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
  healingInfo, matrixActionInfo
} = await import('../modules/rolls/roll-test-case/index.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

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

  it('a critical glitch hides "New roll" on the card', () => {
    const template = readFileSync(new URL('../templates/rolls/roll-card.hbs', import.meta.url), 'utf8')
    expect(template).toMatch(/\{\{#if test\.isExtended\}\}\s*\{\{#unless roll\.criticalGlitchRoll\}\}\s*<button[^>]*data-type="extended"/)
  })

  it('a critical glitch erased by Push the limit reopens the test (SR5 p. 51, 58)', async () => {
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
    cardData.roll.criticalGlitchRoll = false
    await SR5_RollTest.addInfoToCard(cardData, 'a1')
    expect(cardData.test.isExtended).toBe(true)
  })

  it('a new roll remembers how many earlier rolls glitched', async () => {
    const message = await cardFrom([1, 1, 1, 1, 5, 2])
    expect(message.flags.sr5data.roll.glitchRoll).toBe(true)
    faces = [5, 2, 2, 2, 2]
    await SR5_RollTest.extendedRoll(message, {
      id: 'a1'
    })
    expect(updatedCard.test.extended.glitchedRolls).toBe(1)
    expect(updatedCard.roll.glitchRoll).toBe(false)
  })
})

describe('Edge on a later roll of an extended test (SR5 p. 47, 58)', () => {
  const actor = {
    id: 'a1', type: 'actorPc', system: {
      specialAttributes: {
        edge: {
          augmented: {
            value: 2
          }
        }
      }
    }
  }

  /** Roll [5, 5, 2, 3] (2 hits), then a second roll showing these faces; its pool is 3 dice */
  async function secondRoll(rolled) {
    const message = await cardFrom([5, 5, 2, 3])
    faces = [...rolled]
    await SR5_RollTest.extendedRoll(message, actor)
    updatedCard.dicePool.value = 3
    return {
      id: 'm1', flags: {
        sr5data: JSON.parse(JSON.stringify(updatedCard))
      }
    }
  }

  it('hits of earlier rolls do not erase the critical glitch of this roll', async () => {
    const message = await secondRoll([1, 1, 1])
    expect(message.flags.sr5data.roll.criticalGlitchRoll).toBe(true)
    faces = [2, 3]
    await SR5_RollTest.pushTheLimit(message, actor)
    expect(updatedCard.roll.criticalGlitchRoll).toBe(true)
    expect(updatedCard.roll.hits).toBe(2)
  })

  it('Push the limit adds to the hits of every roll so far', async () => {
    const message = await secondRoll([5, 2, 2])
    expect(message.flags.sr5data.roll.hits).toBe(3)
    faces = [5, 2]
    await SR5_RollTest.pushTheLimit(message, actor)
    expect(updatedCard.roll.hits).toBe(4)
  })

  it('Second Chance rerolls the dice of this roll that missed', async () => {
    const message = await secondRoll([5, 2, 2])
    faces = [5, 5]
    await SR5_RollTest.secondeChance(message, actor)
    expect(updatedCard.roll.hits).toBe(5)
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

  it('rolls the 1D3 once, however often the card is refreshed', async () => {
    const card = healingCard()
    faces = [2]
    await healingInfo(card)
    faces = [3]
    card.chatCard.buttons = {
    }
    await healingInfo(card)
    expect(card.damage.value).toBe(2)
    expect(card.test.extended.intervalValue).toBe(2)
  })

  it('offers no healing on a critical glitch', async () => {
    const card = healingCard()
    faces = [2]
    await healingInfo(card)
    expect(card.chatCard.buttons.heal).toBeUndefined()
    expect(card.chatCard.buttons.damage).toBeDefined()
  })

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

  // SR5 p. 208, example: "Chaque complication comptant pour 2 jours" (0, 1 (c), 0, 1, a day, 0, 0, 1 (c) = 11 days)
  it('a glitched roll keeps counting double after the next roll', async () => {
    const card = healingCard()
    card.roll = {
      hits: 2, glitchRoll: false
    }
    card.test.extended.roll = 2
    card.test.extended.glitchedRolls = 1
    await healingInfo(card)
    expect(card.test.extended.intervalValue).toBe(3)
  })

  it('a glitch counts once for its own roll, however often the card is refreshed', async () => {
    const card = healingCard()
    card.roll = {
      hits: 2, glitchRoll: true
    }
    card.test.extended.roll = 3
    card.test.extended.glitchedRolls = 1
    await healingInfo(card)
    await healingInfo(card)
    expect(card.test.extended.intervalValue).toBe(5)
  })
})

describe('First aid critical glitch (SR5 p. 207)', () => {
  it('a cancelled damage type does not show "undefined" on the button', async () => {
    const {
      skillInfo
    } = await import('../modules/rolls/roll-test-case/index.js')
    const {
      SR5_CombatHelpers
    } = await import('../modules/rolls/roll-helpers/combat.js')
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

describe('Redefine Ownership (Data Trails p. 161)', () => {
  it('a glitch raises the Overwatch Score once, even after Second Chance or Push the limit', async () => {
    const actor = {
      id: 'a1', name: 'IA', isOwner: true, system: {
      }
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    const raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
    game.user = {
      isGM: true
    }
    const card = {
      chatCard: {
        buttons: {
        }
      },
      previousMessage: {
      },
      test: {
        typeSub: 'redefineOwnership', title: ''
      },
      threshold: {
        value: 8
      },
      matrix: {
        depth: 3
      },
      roll: {
        hits: 1, glitchRoll: true
      },
    }
    await matrixActionInfo(card, 'a1')
    await matrixActionInfo(card, 'a1')
    expect(raise).toHaveBeenCalledTimes(1)
    expect(raise).toHaveBeenCalledWith(3, 'a1')
  })

  it('the next roll of the test can raise it again', async () => {
    const message = await cardFrom([1, 1, 1, 5])
    message.flags.sr5data.roll.overwatchRaised = true
    faces = [5, 2]
    await SR5_RollTest.extendedRoll(message, {
      id: 'a1'
    })
    expect(updatedCard.roll.overwatchRaised).toBeUndefined()
  })
})
