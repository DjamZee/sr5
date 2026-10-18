import {
  describe, it, expect, vi
} from 'vitest'

// Vérification djamz.16 (B2) : la fenêtre « Effet défini par la fiche… » du sort Soins affichait « : Succès = 3 »,
// sa cible (physical.removeDamage, écrite par la fiche d'objet sans le préfixe system.) n'ayant pas de libellé

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

describe('getLabelByKey: heal and unresisted damage', () => {
  it('names them as the item sheet does', () => {
    expect(SR5_EntityHelpers.getLabelByKey('physical.removeDamage')).toBe('SR5.ConditionMonitorPhysicalShort [SR5.Heal]')
    expect(SR5_EntityHelpers.getLabelByKey('stun.removeDamage')).toBe('SR5.ConditionMonitorStunShort [SR5.Heal]')
    expect(SR5_EntityHelpers.getLabelByKey('stun.addDamage')).toBe('SR5.ConditionMonitorStunShort [SR5.Damage SR5.NotResisted]')
  })
})

describe('describeEntry: the line of the GM window', () => {
  it('gives the Heal spell its target before the colon', () => {
    const line = SR5_ActorHelper.describeEntry({
      target: 'physical.removeDamage', type: 'hits', multiplier: 1
    }, {
      hits: 3
    }, 0)
    expect(line).toBe('SR5.ConditionMonitorPhysicalShort [SR5.Heal] : SR5.DiceHits = 3')
  })

  it('shows the key of a target that has no label rather than nothing', () => {
    const line = SR5_ActorHelper.describeEntry({
      target: 'system.unknown.thing', type: 'value', value: 2, multiplier: 1
    }, {
      hits: 0
    }, 0)
    expect(line.startsWith('system.unknown.thing : ')).toBe(true)
  })
})
