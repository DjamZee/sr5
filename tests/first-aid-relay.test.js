import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const emitForGM = vi.fn()
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: (...args) => emitForGM(...args),
  },
}))

const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_CombatHelpers
} = await import('../modules/rolls/roll-helpers/combat.js')

const warn = vi.fn()
let card, healer, patient

/** A patient the player owns or not, with these monitors */
function makePatient(monitors, owned) {
  return {
    id: 'p1', name: 'Patient', isToken: false,
    system: {
      conditionMonitors: monitors
    },
    testUserPermission: () => owned,
  }
}

/** Click the first aid button of the card */
async function clickFirstAid() {
  const button = {
    dataset: {
      action: 'nonOpposedTest', type: 'firstAid'
    },
    closest: () => ({
      dataset: {
        messageId: 'm1'
      }
    }),
  }
  await SR5_RollMessage.chatButtonAction({
    preventDefault: () => {}, currentTarget: button
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  emitForGM.mockReset()
  warn.mockReset()
  healer = {
    id: 'h1'
  }
  card = {
    id: 'm1', isOwner: true,
    flags: {
      sr5data: {
        owner: {
          speakerId: 'h1'
        },
        previousMessage: {
        },
        target: {
          hasTarget: true, actorId: 'p1'
        },
        test: {
        },
        roll: {
          netHits: 2
        },
        chatCard: {
          buttons: {
            firstAid: {
            }
          }
        },
      }
    }
  }
  globalThis.ui = {
    notifications: {
      warn
    }
  }
  game.messages = {
    get: () => card
  }
  game.user = {
    id: 'u1', isGM: false
  }
  game.users = []
  globalThis.ChatMessage = {
    getSpeaker: () => ({
    })
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'p1' ? patient : healer))
  vi.spyOn(SR5_ActorHelper, 'heal').mockImplementation(async () => {})
  vi.spyOn(SR5_CombatHelpers, 'chooseDamageType').mockImplementation(async () => 'physical')
})

describe('First aid on a patient without condition monitor (SR5 p. 207)', () => {
  it('warns that a device cannot be healed', async () => {
    patient = makePatient({
      matrix: {
      }
    }, true)
    vi.spyOn(SR5_RollMessage, 'updateChatButtonHelper').mockImplementation(async () => {})
    await clickFirstAid()
    expect(warn).toHaveBeenCalledOnce()
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
    expect(SR5_RollMessage.updateChatButtonHelper).not.toHaveBeenCalled()
  })
})
