import {
  describe, it, expect, beforeAll, afterAll
} from 'vitest'
import {
  SR5_SystemHelpers
} from '../modules/system/utilitySystem.js'

// La fenêtre des réglages de Foundry V13 enregistre les réglages un par un :
// un onChange qui recharge la page coupe l'enregistrement des suivants.
// Le réglage qui masque le jet des tables demande donc son rechargement par
// requiresReload, que Foundry traite une seule fois, après tout l'enregistrement.
describe('sr5HideTableRoll', () => {
  const registered = new Map()
  let previousSettings

  beforeAll(() => {
    previousSettings = globalThis.game.settings
    globalThis.game.settings = {
      ...previousSettings,
      register: (namespace, key, data) => registered.set(`${namespace}.${key}`, data),
    }
    SR5_SystemHelpers.registerSystemSettings()
  })

  afterAll(() => {
    globalThis.game.settings = previousSettings
  })

  it('asks for a reload instead of reloading from its onChange', () => {
    const data = registered.get('sr5.sr5HideTableRoll')
    expect(data).toBeDefined()
    expect(data.onChange?.toString() ?? '').not.toMatch(/reload/)
    expect(data.requiresReload).toBe(true)
  })
})
