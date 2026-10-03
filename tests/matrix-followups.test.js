import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

globalThis.ui = {
  notifications: {
    info: vi.fn(), warn: vi.fn()
  }
}
globalThis.fromUuid = vi.fn(async () => null)
const testCases = await import('../modules/rolls/roll-test-case/index.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')

let actor
beforeEach(() => {
  vi.restoreAllMocks()
  game.user = {
    isGM: true
  }
  actor = {
    id: 'a1', name: 'IA', type: 'actorPc', isOwner: true, items: [],
    system: {
      matrix: {
        overwatchScore: 0,
        actions: {
          dataSpike: {
            increaseOverwatchScore: true,
            defense: {
              modifiers: [{
                source: 'SR5.Intuition', type: 'linkedAttribute', value: 4
              }]
            }
          }
        },
        programs: {
          biofeedback: {
            isActive: false
          },
          blackout: {
            isActive: false
          }
        },
        userMode: 'ar',
      },
      specialAttributes: {
      },
      specialProperties: {
      },
    },
    update: vi.fn(async function (data) {
      this.system = data.system
    }),
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(() => actor)
  vi.spyOn(SR5_RollMessage, 'generateChatButton').mockImplementation((_t, action, label) => label ?? action)
  vi.spyOn(SR5_RollMessage, 'updateChatButtonHelper').mockImplementation(async () => {})
})

describe('Emulate on a Matrix Search (Data Trails p. 159)', () => {
  function searchCard(hits) {
    return {
      roll: {
        hits
      },
      edge: {
      },
      test: {
        type: 'matrixAction', typeSub: 'matrixSearch', title: 'Test'
      },
      threshold: {
        value: 2, type: 'generalInformation'
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
    }
  }

  it('raises the Overwatch Score and names Emulate in the title', async () => {
    vi.spyOn(SR5_MatrixHelpers, 'getMatrixSearchDuration').mockResolvedValue('1 min')
    const raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
    const card = searchCard(3)
    await testCases.matrixActionInfo(card, 'a1')
    expect(raise).toHaveBeenCalledWith(3, 'a1')
    expect(card.test.title).toBe('SR5.MatrixActionTestSR5.Colons SR5.MatrixActionMatrixSearch (2) (SR5.MatrixActionEmulate 3)')
    expect(card.chatCard.buttons.matrixSearchSuccess).toBeDefined()
  })

  it('keeps Emulate in the rebuilt title on Second Chance, without raising the score again', async () => {
    vi.spyOn(SR5_MatrixHelpers, 'getMatrixSearchDuration').mockResolvedValue('1 min')
    const raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
    const card = searchCard(1)
    await testCases.matrixActionInfo(card, 'a1')
    card.roll.hits = 3
    await testCases.matrixActionInfo(card, 'a1')
    expect(raise).toHaveBeenCalledTimes(1)
    expect(card.test.title).toBe('SR5.MatrixActionTestSR5.Colons SR5.MatrixActionMatrixSearch (2) (SR5.MatrixActionEmulate 3)')
  })
})
