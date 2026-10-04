import {
  describe, it, expect
} from 'vitest'
import {
  SR5
} from '../modules/config.js'
import fr from '../lang/fr.json'
import en from '../lang/en.json'

// SR5 p. 301 lists Manifestation among the watcher's powers
describe('watcher base powers', () => {
  it('include Manifestation', () => {
    expect(SR5.spiritBasePowerswatcher.manifestation).toBe("SR5.SpiritPowerManifestation")
  })

  it('have a label in both languages', () => {
    expect(fr["SR5.SpiritPowerManifestation"]).toBe("Manifestation")
    expect(en["SR5.SpiritPowerManifestation"]).toBe("Manifestation")
  })
})
