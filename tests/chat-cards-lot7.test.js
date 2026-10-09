import {
  describe, it, expect, vi, afterEach
} from 'vitest'
import {
  perceptionGroupOf, perceptionTargetName, PERCEPTION_GROUP_ORDER
} from '../modules/canvas/pan-crown/pan-perception-card.js'
import {
  PERCEPTION_ENTRIES
} from '../modules/canvas/pan-crown/pan-perception.js'
import {
  SR5_ConverterHelpers
} from '../modules/rolls/roll-helpers/converter.js'

// Lot 7 de la séance du 09/10 : cartes de discussion et fenêtre de la Perception matricielle

const format = (key, data) => `${key}|${JSON.stringify(data)}`

afterEach(() => vi.restoreAllMocks())

describe('fenêtre de choix de la Perception matricielle', () => {
  it('range chaque information dans un type connu', () => {
    for (const entry of PERCEPTION_ENTRIES) expect(PERCEPTION_GROUP_ORDER).toContain(perceptionGroupOf(entry))
  })

  it('met les alentours, les fichiers et les attributs dans leur boîte', () => {
    const of = key => perceptionGroupOf(PERCEPTION_ENTRIES.find(e => e.key === key))
    expect(of('silentNearby')).toBe('around')
    expect(of('fileBomb')).toBe('file')
    expect(of('attribute')).toBe('ratings')
    expect(of('spot')).toBe('identity')
    expect(of('marks')).toBe('state')
  })
})

describe('cible complète de la carte', () => {
  it('nomme l\'appareil et son propriétaire', () => {
    vi.spyOn(game.i18n, 'format').mockImplementation(format)
    const name = perceptionTargetName({
      actor: {
        name: 'Harry le Détective'
      }, item: {
        name: 'Meta Link'
      }, name: 'Meta Link'
    })
    expect(name).toBe('SR5.MatrixPerceptionTargetOf|{"item":"Meta Link","owner":"Harry le Détective"}')
  })

  it('garde le seul nom d\'un persona sans appareil', () => {
    expect(perceptionTargetName({
      actor: {
        name: 'Neo'
      }, item: null, name: 'Neo'
    })).toBe('Neo')
  })
})

describe('défense contre une rafale', () => {
  it('le modificateur dit le mode de tir de l\'attaquant', () => {
    vi.spyOn(game.i18n, 'format').mockImplementation(format)
    vi.spyOn(game.i18n, 'localize').mockImplementation(key => key === 'SR5.WeaponModeSB' ? 'Rafale semi-automatique' : key)
    expect(SR5_ConverterHelpers.firingModeDefenseLabel('SB')).toBe('SR5.IncomingFiringModeLabel|{"mode":"Rafale semi-automatique"}')
    expect(SR5_ConverterHelpers.firingModeToDefenseMod('SB')).toBe(-2)
  })
})
