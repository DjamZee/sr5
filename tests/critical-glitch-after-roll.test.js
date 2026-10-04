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
          value: rolled.length, base: rolled.length, modifiers: []
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

describe('Edge during an extended test, GM ruling of 05/10 (SR5 p. 58)', () => {
  const actor = {
    id: 'a1', type: 'actorPc', system: {
      specialAttributes: {
        edge: {
          augmented: {
            value: 3
          }
        }
      }
    }
  }

  beforeEach(() => {
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
  })

  /** A first roll of `base` dice with these modifiers, its pool computed as the dialog does */
  async function firstRoll(base, modifiers, rolled) {
    const pool = base + modifiers.reduce((sum, m) => sum + m.value, 0)
    const message = await cardFrom(rolled ?? Array(pool).fill(2))
    message.flags.sr5data.test.isExtended = true
    Object.assign(message.flags.sr5data.dicePool, {
      base, modifiers
    })
    await SR5_RollTestHelper.handleDicePoolModifiers(message.flags.sr5data)
    return message
  }

  async function nextRoll(message, rolled) {
    faces = rolled ?? Array(20).fill(2)
    await SR5_RollTest.extendedRoll(message, actor)
    return {
      id: 'm1', flags: {
        sr5data: JSON.parse(JSON.stringify(updatedCard))
      }
    }
  }

  it('Push the limit after the first roll keeps its Edge dice on every later roll', async () => {
    let message = await firstRoll(6, [])
    faces = [2, 2, 2]
    await SR5_RollTest.pushTheLimit(message, actor)
    message = await nextRoll({
      id: 'm1', flags: {
        sr5data: JSON.parse(JSON.stringify(updatedCard))
      }
    })
    expect(message.flags.sr5data.roll.rollDices).toHaveLength(8)
    expect(message.flags.sr5data.dicePool.value).toBe(8)
    expect(message.flags.sr5data.edge.hasUsedPushTheLimit).toBe(true)
    message = await nextRoll(message)
    expect(message.flags.sr5data.dicePool.value).toBe(7)
    expect(SR5_RollTestHelper.removeEdgeFromActor).toHaveBeenCalledTimes(1)
  })

  it('Push the limit before the roll keeps its Edge dice on every later roll', async () => {
    let message = await firstRoll(6, [{
      type: 'edge', value: 3
    }])
    message.flags.sr5data.edge.hasUsedPushTheLimit = true
    message = await nextRoll(message)
    expect(message.flags.sr5data.roll.rollDices).toHaveLength(8)
    expect(message.flags.sr5data.dicePool.value).toBe(8)
  })

  it('the Edge dice of a later roll explode and ignore the limit', async () => {
    let message = await firstRoll(2, [{
      type: 'edge', value: 3
    }])
    message.flags.sr5data.edge.hasUsedPushTheLimit = true
    message.flags.sr5data.limit.value = 1
    const rollDice = vi.spyOn(SR5_RollTest, 'rollDice')
    message = await nextRoll(message, [6, 6, 5, 2])
    // 4 dice rolled: 3 hits kept despite a limit of 1, and the 6s explode
    expect(message.flags.sr5data.roll.rollHits).toBe(3)
    expect(rollDice).toHaveBeenCalledWith(expect.objectContaining({
      dicePool: 4, explose: true, limit: undefined
    }))
  })

  it('without Edge, each later roll loses one die and Edge is no longer offered', async () => {
    let message = await firstRoll(8, [{
      type: 'wounds', value: -2
    }])
    message.flags.sr5data.edge.canUseEdge = true
    message = await nextRoll(message)
    expect(message.flags.sr5data.dicePool.value).toBe(5)
    expect(message.flags.sr5data.edge.canUseEdge).toBe(false)
    message = await nextRoll(message)
    expect(message.flags.sr5data.dicePool.value).toBe(4)
  })

  it('Push the limit is refused on a later roll', async () => {
    let message = await nextRoll(await firstRoll(6, []))
    faces = [5, 5, 5]
    expect(await SR5_RollTest.pushTheLimit(message, actor)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_EdgeExtendedTestStartOnly')
    expect(SR5_RollTestHelper.removeEdgeFromActor).not.toHaveBeenCalled()
  })

  it('Second Chance is refused during an extended test, first roll included', async () => {
    const message = await firstRoll(4, [], [5, 2, 2, 2])
    faces = [5, 5, 5]
    expect(await SR5_RollTest.secondeChance(message, actor)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_EdgeExtendedTestPushOnly')
    expect(updatedCard).toBeUndefined()
  })

  it('the card offers no Second Chance on an extended test', () => {
    const template = readFileSync(new URL('../templates/rolls/roll-card.hbs', import.meta.url), 'utf8')
    expect(template).toMatch(/\{\{#unless test\.isExtended\}\}\s*<a[^>]*data-type="secondeChance"/)
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
