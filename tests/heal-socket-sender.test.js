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
    // One test treats one patient (SR5 p. 207): the card is spent whoever the patient is (Harriet's review)
    expect(SR5_MiscellaneousHelpers.grant.mock.calls[0][0].key).toBe('m1|firstAid|')
  })

  it('shows the GM the hits counted again, and the boxes asked apart (Harriet\'s review)', async () => {
    game.i18n.format = (key, data) => `${key}:${JSON.stringify(data)}`
    await heal(asked(3), 'medic')
    const use = SR5_MiscellaneousHelpers.grant.mock.calls[0][0]
    expect(use.value).toBe(5)
    expect(use.target).toContain('"boxes":3')
  })

  it('reads the medkit on the healer\'s sheet, never on the card (Harriet\'s review)', async () => {
    // No first aid rating and no medkit on the sheet: a medkit of 6 written on the card heals nothing
    actors.medicPc.system.skills.firstAid.rating.value = 0
    actors.medicPc.items = []
    card.data.test.bbMedkitRating = 6
    card.data.roll.netHits = 6
    await heal(asked(6), 'medic')
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
  })

  it('a negative count heals nobody and hurts nobody (Quitterie, S1)', async () => {
    await heal(asked(-5), 'medic')
    await heal(asked(-5), 'stranger', 'nope')
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
  })

  it('a copy of the card (new id, same dice) does not heal again (Quitterie, S4)', async () => {
    const spent = new Set()
    vi.spyOn(SR5_MiscellaneousHelpers, 'isConsumed').mockImplementation(key => spent.has(key))
    vi.spyOn(SR5_MiscellaneousHelpers, 'consume').mockImplementation(async key => !spent.has(key) && !!spent.add(key))
    card.data.roll.r = JSON.stringify({
      terms: [{
        results: [{
          result: 5
        }, {
          result: 6
        }, {
          result: 5
        }, {
          result: 5
        }, {
          result: 6
        }]
      }]
    })
    card.data.owner = {
      actorId: 'medicPc', itemUuid: ''
    }
    const copy = {
      ...card, id: 'm2'
    }
    SR5_MiscellaneousHelpers.cardOf.mockImplementation(id => ({
      m1: card, m2: copy
    })[id] ?? null)
    await heal(asked(3), 'medic')
    await heal(asked(3), 'medic', 'm2')
    expect(SR5_ActorHelper.heal).toHaveBeenCalledTimes(1)
  })

  it('refuses a monitor the patient does not have', async () => {
    await heal(asked(3, 'matrix'), 'medic')
    expect(SR5_ActorHelper.heal).not.toHaveBeenCalled()
  })
})
