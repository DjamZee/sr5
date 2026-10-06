import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

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

// Last security pass before the djamz.11 (Olympe, after Romane): the "heal" socket healed any actor of any number
// of boxes, as many times as asked, on the sender's word. Now the GM reads the first aid card again.

const users = {
  gm: {
    id: 'gm', isGM: true
  },
  medic: {
    id: 'medic', isGM: false, name: 'Medic'
  },
  stranger: {
    id: 'stranger', isGM: false
  },
}

let actors, card
beforeEach(() => {
  vi.restoreAllMocks()
  game.user = users.gm
  game.users = {
    get: id => users[id], activeGM: users.gm
  }
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
})

const heal = (healData, senderId, messageId = 'm1') => SR5_ActorHelper._socketHeal({
  data: {
    targetActor: 'patient', healData, messageId
  }
}, senderId)
const asked = (netHits, typeSub = 'physical') => ({
  test: {
    typeSub
  }, roll: {
    netHits
  }
})

describe('the heal socket', () => {
  it('heals nobody without a first aid card behind it', async () => {
    await heal(asked(10), 'medic', 'nope')
    await heal(asked(3), 'stranger')
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
  })

  it('never heals more boxes than the card shows', async () => {
    await heal(asked(10), 'medic')
    expect(SR5_ActorHelper.heal).toHaveBeenCalledWith('patient', asked(3))
  })

  it('refuses a card whose hits are more than its dice show', async () => {
    SR5_MiscellaneousHelpers.hitsOf.mockReturnValue(2)
    await heal(asked(3), 'medic')
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
  })

  it('heals once per card and patient: the GM confirms and spends the card', async () => {
    SR5_MiscellaneousHelpers.grant.mockResolvedValue(false)
    await heal(asked(3), 'medic')
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
    expect(SR5_MiscellaneousHelpers.grant.mock.calls[0][0].key).toBe('m1|firstAid|Actor.patient')
  })

  it('a negative count heals nobody and hurts nobody (Quitterie, S1)', async () => {
    await heal(asked(-5), 'medic')
    await heal(asked(-5), 'stranger', 'nope')
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
  })

  it('refuses a monitor the patient does not have', async () => {
    await heal(asked(3, 'matrix'), 'medic')
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
  })
})
