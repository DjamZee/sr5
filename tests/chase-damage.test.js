import {
  describe, it, expect
} from 'vitest'
import {
  attackFamily, trustedResistanceCard, CROSS_CARDS
} from '../modules/rolls/roll-helpers/attack-card.js'
import {
  resolveAction, resolveFollowUp
} from '../modules/system/chase-actions.js'

// The damage a chase card gives (collision, ramming, Like a Glove missed, a crash): an « Apply the damage » button of
// the gamemaster's card opens the resistance of the vehicle, by the system's path (system/chase-roll.js)

const ids = {
  initiatorId: 'A', targetId: 'B'
}

describe('the damage of a chase card', () => {
  it('goes to the vehicle hit, a crash to the gamemaster who sets its DV (SR5 p. 202)', () => {
    expect(resolveAction('likeAGlove', {
      ...ids, hits: 0, threshold: 2, speed: 3, newTerrainValue: 2
    }).effects).toEqual([{
      type: 'damage', id: 'A', dv: 5
    }])
    expect(resolveFollowUp({
      test: 'avoidCrash', vehicle: 'B', threshold: 3
    }, {
      hits: 0, threshold: 3
    }).effects).toContainEqual({
      type: 'crash', id: 'B'
    })
    expect(resolveFollowUp({
      test: 'avoidCrash', vehicle: 'B', threshold: 3
    }, {
      hits: 3, threshold: 3
    }).effects).toEqual([])
  })

  it('is resisted as the gamemaster\'s card says, never read as an attack nor as a crash of a ramming', async () => {
    const data = {
      test: {
        type: 'falseTest', typeSub: 'chaseDamage'
      }, owner: {
        messageId: 'gmCard'
      }
    }
    expect(attackFamily(data)).toBeFalsy()
    expect(CROSS_CARDS).not.toContain('chaseDamage')
    const vehicle = {
      id: 'v'
    }
    expect(await trustedResistanceCard(data, vehicle, 'resistanceCard', {
      cardOf: () => ({
        byGM: true, data: {
        }
      })
    })).toBe(true)
    // A player's card stands for no damage he does not own
    expect(await trustedResistanceCard(data, vehicle, 'resistanceCard', {
      cardOf: () => ({
        byGM: false, author: {
          id: 'p'
        }, roller: {
          id: 'other', testUserPermission: () => false
        }, data: {
        }
      })
    })).toBe(false)
  })
})
