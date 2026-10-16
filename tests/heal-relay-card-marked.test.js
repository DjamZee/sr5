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

const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_MiscellaneousHelpers
} = await import('../modules/rolls/roll-helpers/miscellaneous.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')

// Measured in game (lot 17c): a player's first aid on an NPC she does not own goes to the GM. Her card read
// "1P Soigné" as soon as she clicked, and still did once the GM had declined: nothing was healed

const users = {
  gm: {
    id: 'gm', isGM: true
  },
  medic: {
    id: 'medic', isGM: false, name: 'Medic'
  },
}

let actors, card
beforeEach(() => {
  vi.restoreAllMocks()
  game.user = users.gm
  game.users = {
    get: id => users[id], activeGM: users.gm, filter: fn => Object.values(users).filter(fn)
  }
  const store = {
  }
  game.settings = {
    get: (s, k) => store[k], set: async (s, k, v) => {
      store[k] = v
    }
  }
  game.messages = {
    get: id => (id === 'm1' ? {
      id
    } : undefined)
  }
  globalThis.ChatMessage = {
    create: vi.fn()
  }
  foundry.utils.escapeHTML ??= text => text
  actors = {
    patient: {
      uuid: 'Actor.patient', name: 'Patient', type: 'actorPc', testUserPermission: () => false, system: {
        conditionMonitors: {
          physical: {
          }, stun: {
          }
        }
      }
    },
    medicPc: {
      testUserPermission: user => user?.id === 'medic', system: {
        skills: {
          firstAid: {
            rating: {
              value: 4
            }
          }
        }
      }
    },
  }
  card = {
    id: 'm1', byGM: false, roller: actors.medicPc, data: {
      test: {
        typeSub: 'firstAid'
      }, roll: {
        hits: 5, netHits: 3
      }
    }
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors[id])
  vi.spyOn(SR5_ActorHelper, 'heal').mockResolvedValue()
  vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockImplementation(id => (id === 'm1' ? card : null))
  vi.spyOn(SR5_MiscellaneousHelpers, 'hitsOf').mockReturnValue(5)
  vi.spyOn(SR5_MiscellaneousHelpers, 'grant').mockResolvedValue(true)
  vi.spyOn(SR5_RollMessage, 'updateChatButton').mockResolvedValue()
})

const heal = () => SR5_ActorHelper._socketHeal({
  data: {
    targetActor: 'patient', healData: {
      test: {
        typeSub: 'physical'
      }, roll: {
        netHits: 1
      }
    }, messageId: 'm1'
  }
}, 'medic')

describe('the first aid card of a relayed heal', () => {
  it('is marked by the GM once he has healed', async () => {
    await heal()
    expect(SR5_ActorHelper.heal).toHaveBeenCalled()
    expect(SR5_RollMessage.updateChatButton).toHaveBeenCalledWith('m1', 'firstAid', 'physical')
  })

  it('keeps its button when the GM declines', async () => {
    SR5_MiscellaneousHelpers.grant.mockResolvedValue(false)
    await heal()
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
    expect(SR5_RollMessage.updateChatButton).not.toHaveBeenCalled()
  })

  it('is no longer marked by the player when the heal goes to the GM', () => {
    const source = readFileSync(new URL('../modules/rolls/roll-message.js', import.meta.url), 'utf8')
    expect(source).toMatch(/if \(healLocally\) SR5_RollMessage\.updateChatButtonHelper\(messageId, type, healData\.test\.typeSub\)/)
  })
})
