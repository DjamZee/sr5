import {
  describe, it, expect, vi
} from 'vitest'

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

// Relecture djamz.17 : la fenêtre du MJ disait « Moniteur de condition [Soins] » (libellé des drones et brutes)
// quand la fiche d'objet dit « Moniteur [Soins] » (effect.hbs, characterConditionMonitors)
describe('getLabelByKey: Heal and unresisted damage', () => {
  it('names the monitor as the item sheet does', () => {
    expect(SR5_EntityHelpers.getLabelByKey('condition.removeDamage')).toBe('SR5.ConditionMonitorShort [SR5.Heal]')
    expect(SR5_EntityHelpers.getLabelByKey('condition.removeDamage')).not.toContain("SR5.ConditionMonitor ")
    expect(SR5_EntityHelpers.getLabelByKey('physical.addDamage')).toBe('SR5.ConditionMonitorPhysicalShort [SR5.Damage SR5.NotResisted]')
  })

  it('still names the monitors the item sheet does not list', () => {
    expect(SR5_EntityHelpers.effectMonitorLabel('matrix')).toBe('SR5.ConditionMonitorMatrix')
    expect(SR5_EntityHelpers.effectMonitorLabel('unknown')).toBe('unknown')
  })
})
