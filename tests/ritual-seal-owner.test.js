import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const rollTest = vi.fn()
vi.mock('../modules/rolls/roll-prepare.js', () => ({
  SR5_PrepareRollTest: {
    rollTest: (...args) => rollTest(...args)
  },
}))

const {
  SR5_RitualCircle
} = await import('../modules/rolls/roll-helpers/ritualCircle.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

// Security 06/10: the leader seals the ritual (SR5 p. 299), but "Seal" trusted the author of the circle card, and the
// teamwork bonus trusted the hits written on each assist card by whoever posted it
const skill = (rating, dicePool) => ({
  ritualSpellcasting: {
    rating: {
      value: rating
    }, test: {
      dicePool
    }
  }
})
const sheet = (owners, rating, dicePool) => ({
  isOwner: owners.includes('me'),
  isToken: false,
  testUserPermission: (user) => owners.includes(user?.id),
  system: {
    skills: skill(rating, dicePool), magic: {
      tradition: 'hermetic'
    }
  },
})

describe("sealing a ritual circle", () => {
  let leader, ally, circleCard, assists
  beforeEach(() => {
    rollTest.mockClear()
    leader = {
      ...sheet(['me'], 4, 8), id: 'lead'
    }
    ally = {
      ...sheet(['ally'], 3, 6), id: 'ally'
    }
    globalThis.fromUuid = async () => ({
      actor: leader
    })
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation((id) => ({
      lead: leader, ally
    })[id])
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
    game.i18n = {
      localize: (k) => k, format: (k) => k
    }
    circleCard = {
      id: 'c1', isOwner: true, update: vi.fn(),
      flags: {
        sr5: {
          ritualCircle: {
            itemUuid: 'Actor.lead.Item.r', leaderId: 'lead', leaderName: 'L', tradition: 'hermetic', force: 5, sealed: false
          }
        }
      },
    }
    assists = []
    game.messages = {
      get contents(){
        return assists
      }
    }
  })
  const assist = (author, hits) => ({
    author: {
      id: author, isGM: false
    }, flags: {
      sr5: {
        ritualAssist: {
          circleId: 'c1', actorId: 'ally', name: 'A', hits
        }
      }
    }
  })

  it("is refused to the author of the card who does not own the ritual's caster", async () => {
    leader.isOwner = false
    await SR5_RitualCircle.seal(circleCard)
    expect(rollTest).not.toHaveBeenCalled()
    expect(circleCard.update).not.toHaveBeenCalled()
  })

  it("leaves out an assist card posted by someone who does not own the participant", async () => {
    assists = [assist('stranger', 3)]
    await SR5_RitualCircle.seal(circleCard)
    expect(rollTest.mock.calls[0][3].ritualCircle.bonus.dice).toBe(0)
  })

  it("caps an assist's hits by the pool the sheet gives, and by the Force", async () => {
    assists = [assist('ally', 40)]
    await SR5_RitualCircle.seal(circleCard)
    expect(rollTest.mock.calls[0][3].ritualCircle.bonus.dice).toBe(4)
    ally.system.skills = skill(3, 2)
    rollTest.mockClear()
    circleCard.flags.sr5.ritualCircle.sealed = true
    await SR5_RitualCircle.seal(circleCard)
    expect(rollTest.mock.calls[0][3].ritualCircle.bonus.dice).toBe(2)
  })
})
