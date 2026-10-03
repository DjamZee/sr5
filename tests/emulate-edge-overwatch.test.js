import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// Faces the next rolls will show, in order
let faces = []

/** Stand-in for Foundry's Roll: "Nd6...cs>=5" counts hits. A serialized Die has no total. */
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
const {
  matrixActionInfo
} = await import('../modules/rolls/roll-test-case/index.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

const actor = {
  id: 'a1', name: 'IA', type: 'actorPc', isOwner: true, system: {
    matrix: {
    },
    specialAttributes: {
      edge: {
        augmented: {
          value: 3
        }
      }
    }
  }
}

let updatedCard, raise
beforeEach(() => {
  faces = []
  updatedCard = undefined
  vi.restoreAllMocks()
  game.user = {
    isGM: true
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
  raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
  // The card is filled the way addInfoToCard does it for a matrix action
  vi.spyOn(SR5_RollTest, 'addInfoToCard').mockImplementation(async (card, actorId) => matrixActionInfo(card, actorId))
  vi.spyOn(SR5_RollTest, 'showDiceSoNice').mockImplementation(async () => {})
  vi.spyOn(SR5_RollTestHelper, 'removeEdgeFromActor').mockImplementation(async () => {})
  vi.spyOn(SR5_RollMessage, 'updateRollCardHelper').mockImplementation(async (_id, m) => {
    updatedCard = m
  })
  vi.spyOn(SR5_RollMessage, 'generateChatButton').mockImplementation((_t, action) => action)
})

/** An Emulate card (rating 3) whose first roll showed these faces, with or without Push the limit before the roll */
async function emulateCard(rolled, pushedBefore = false) {
  faces = [...rolled]
  const roll = await SR5_RollTest.rollDice({
    dicePool: rolled.length, explose: pushedBefore
  })
  const card = {
    roll: JSON.parse(JSON.stringify({
      ...roll, originalRoll: null, r: null
    })),
    dicePool: {
      value: rolled.length, base: rolled.length, modifiers: []
    },
    limit: {
      value: 6
    },
    edge: {
      hasUsedPushTheLimit: pushedBefore
    },
    test: {
      type: 'matrixAction', typeSub: 'hackOnTheFly', title: 'Test', extended: {
      }
    },
    threshold: {
    },
    matrix: {
      emulateRating: 3
    },
    chatCard: {
      buttons: {
      }
    },
    previousMessage: {
    },
    owner: {
    },
  }
  await matrixActionInfo(card, 'a1')
  return {
    id: 'm1', flags: {
      sr5data: card
    }
  }
}

describe('Emulate and Edge (Data Trails p. 159, SR5 p. 57)', () => {
  it('the emulated rating raises the Overwatch Score once', async () => {
    const message = await emulateCard([5, 2, 3, 1])
    expect(raise).toHaveBeenCalledTimes(1)
    expect(raise).toHaveBeenCalledWith(3, 'a1')
    expect(message.flags.sr5data.test.title).toBe('Test (SR5.MatrixActionEmulate 3)')
  })

  it('Second Chance does not raise it again, nor repeat the title', async () => {
    const message = await emulateCard([5, 2, 3, 1])
    faces = [6, 2, 2]
    await SR5_RollTest.secondeChance(message, actor)
    expect(updatedCard.roll.hits).toBe(2)
    expect(raise).toHaveBeenCalledTimes(1)
    expect(updatedCard.test.title).toBe('Test (SR5.MatrixActionEmulate 3)')
  })

  it('Push the limit before the roll raises it by the hits, not by the rating', async () => {
    await emulateCard([5, 5, 2, 3], true)
    expect(raise).toHaveBeenCalledTimes(1)
    expect(raise).toHaveBeenCalledWith(2, 'a1')
  })

  it('Push the limit before the roll counts every hit, the limit being ignored', async () => {
    const card = (await emulateCard([5, 5, 5, 5, 5, 5, 5, 2], true)).flags.sr5data
    expect(card.roll.hits).toBe(7)
    expect(raise).toHaveBeenCalledWith(7, 'a1')
  })

  it('Push the limit after the roll does not raise it by the rating again', async () => {
    const message = await emulateCard([5, 2, 3, 1])
    faces = [5, 2, 2]
    await SR5_RollTest.pushTheLimit(message, actor)
    expect(updatedCard.roll.hits).toBe(2)
    expect(raise).toHaveBeenCalledTimes(1)
    expect(raise).toHaveBeenCalledWith(3, 'a1')
  })
})
