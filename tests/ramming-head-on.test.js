import {
  describe, it, expect
} from 'vitest'
import {
  SR5_ConverterHelpers
} from '../modules/rolls/roll-helpers/converter.js'

// Rigger 5 p. 179: the ramming vehicle takes half the damage (rounded up)
// from the rear or the side, and the full damage head-on.
describe('rammingAttackerDamage', () => {
  it('takes half the damage, rounded up, when not head-on', () => {
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming1', 5, false)).toBe(2)
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming11', 5, false)).toBe(3)
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming51', 5, false)).toBe(5)
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming201', 5, false)).toBe(8)
  })

  it('takes the full damage head-on', () => {
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming1', 5, true)).toBe(3)
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming11', 5, true)).toBe(5)
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming51', 5, true)).toBe(10)
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming201', 5, true)).toBe(15)
  })

  it('defaults to half when the head-on flag is missing (older chat cards)', () => {
    expect(SR5_ConverterHelpers.rammingAttackerDamage('speedRamming51', 5, undefined)).toBe(5)
  })
})
