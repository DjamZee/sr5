import {
  describe, it, expect
} from 'vitest'
import {
  spellAuraOf, spellAuraDamageType, spellAuraBackfireType
} from '../modules/rolls/roll-helpers/spell-aura.js'

// Aura of [element] (Street Grimoire p. 114)
const {
  weaponAttackDamage, rebuildCrossCard
} = await import('../modules/rolls/roll-helpers/attack-card.js')

const sheet = (value, element) => ({
  specialProperties: {
    spellAura: {
      value
    }, spellAuraElement: element
  }
})
const sword = {
  category: 'meleeWeapon', damageValue: {
    value: 6
  }, armorPenetration: {
    value: -2, base: -2
  }, damageType: 'physical', damageElement: '', systemEffects: [],
}

describe('Aura of [element]', () => {
  it('needs hits and an element', () => {
    expect(spellAuraOf(sheet(3, 'fire'))).toEqual({
      value: 3, element: 'fire'
    })
    expect(spellAuraOf(sheet(0, 'fire'))).toBeNull()
    expect(spellAuraOf(sheet(3, ''))).toBeNull()
  })

  it('fire, cold and acid are Physical; electricity keeps the type, deals Stun back', () => {
    expect(spellAuraDamageType('fire', 'stun')).toBe('physical')
    expect(spellAuraDamageType('electricity', 'stun')).toBe('stun')
    expect(spellAuraBackfireType('electricity')).toBe('stun')
    expect(spellAuraBackfireType('cold')).toBe('physical')
  })

  it('the GM works out the melee DV as the dialog does: +hits, the element, AP unchanged', () => {
    const damage = weaponAttackDamage(sword, sheet(3, 'fire'))
    expect(damage).toMatchObject({
      base: 9, ap: -2, element: 'fire', type: 'physical'
    })
    expect(weaponAttackDamage({
      ...sword, category: 'rangedWeapon'
    }, sheet(3, 'fire')).base).toBe(6)
  })

  it('the attacker burnt by the aura: rebuilt from the defender\'s sheet, never from the card', async () => {
    const npc = {
      id: 'npc', uuid: 'Actor.npc', type: 'actorGrunt', testUserPermission: () => false
    }
    const pc = {
      id: 'pc', uuid: 'Actor.pc', type: 'actorPc', system: sheet(4, 'electricity')
    }
    const attack = {
      id: 'a1', roller: npc, byGM: true, author: {
        name: 'MJ', isGM: true
      }, data: {
        test: {
          type: 'attack', typeSub: 'meleeWeapon'
        }, roll: {
          hits: 4
        }
      }
    }
    const defense = {
      id: 'd1', flags: {
        sr5data: {
          test: {
            type: 'defense'
          }, previousMessage: {
            messageId: 'a1'
          }, owner: {
            actorId: 'pc'
          }, roll: {
            netHits: 2
          }
        }
      }
    }
    const helpers = {
      cardOf: id => ({
        a1: attack, d1: {
          id: 'd1', roller: pc, byGM: false, author: {
            name: 'Clo'
          }, data: defense.flags.sr5data
        }
      })[id] ?? null,
      messages: [defense],
      baseRollData: () => ({
        test: {
        }, owner: {
          actorId: 'npc', messageId: null
        }, previousMessage: {
          messageId: null, actorId: null
        }, damage: {
          base: 0, value: 0, type: '', source: '', element: '', resistanceType: ''
        }, combat: {
          armorPenetration: 0
        },
      }),
    }
    const card = {
      test: {
        type: 'falseTest', typeSub: 'spellAura'
      }, owner: {
        messageId: 'f1', actorId: 'npc'
      }, previousMessage: {
        messageId: 'a1', actorId: 'pc'
      }, damage: {
        base: 40, value: 40, type: 'physical', element: 'fire'
      }, combat: {
        armorPenetration: -30
      },
    }
    const data = await rebuildCrossCard(card, npc, helpers)
    expect(data.damage).toMatchObject({
      base: 4, value: 4, type: 'stun', element: 'electricity', source: 'magical'
    })
    expect(data.combat.armorPenetration).toBe(0)
  })
})
