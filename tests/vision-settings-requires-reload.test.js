import {
  describe, it, expect, beforeAll, afterAll
} from 'vitest'
import {
  SR5_SystemHelpers
} from '../modules/system/utilitySystem.js'

// La fenêtre des réglages de Foundry V13 enregistre les réglages un par un :
// un onChange qui recharge la page coupe l'enregistrement des suivants.
// Les deux réglages de vision le déclarent donc par requiresReload,
// que Foundry traite une seule fois, après tout l'enregistrement.
describe('vision settings', () => {
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

  for (const key of ['sr5.sr5CyberEyesReplaceNaturalVision', 'sr5.sr5LowLightGreenTint']) {
    it(`${key} asks for one reload instead of reloading in onChange`, () => {
      const data = registered.get(key)
      expect(data, key).toBeDefined()
      expect(data.onChange?.toString() ?? '', key).not.toMatch(/reload/)
      expect(data.requiresReload, key).toBe(true)
    })
  }
})
