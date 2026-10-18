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

// Vérification djamz.15 (C2) : la fenêtre « Effet défini par la fiche… » de la Pétrification affichait
// « : Succès excédentaires = 1 », la cible (armure renforcée) n'ayant pas de libellé
describe('getLabelByKey: hardened armors', () => {
  it('names the hardened armor an effect targets', () => {
    expect(SR5_EntityHelpers.getLabelByKey('system.specialProperties.hardenedArmors.normalWeapon')).toBe('SR5.HardenedArmorNormalWeapon')
    expect(SR5_EntityHelpers.getLabelByKey('system.specialProperties.hardenedArmors.fire')).toBe('SR5.HardenedFireArmor')
  })

  it('falls back on the generic label for an unknown kind', () => {
    expect(SR5_EntityHelpers.getLabelByKey('system.specialProperties.hardenedArmors.unknown')).toBe('SR5.HardenedArmor')
  })
})
