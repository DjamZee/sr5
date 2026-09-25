import {
  describe, it, expect
} from 'vitest'
import {
  SR5_ConverterHelpers
} from '../modules/rolls/roll-helpers/converter.js'

// Rigger 5 p. 179 (Collision, update of SR5 p. 203)
describe('collisionDamage', () => {
  it('follows the Collision Damage table from the initiator\'s Structure', () => {
    expect(SR5_ConverterHelpers.collisionDamage(10, 0)).toBe(0)
    expect(SR5_ConverterHelpers.collisionDamage(5, 1)).toBe(3)
    expect(SR5_ConverterHelpers.collisionDamage(10, 2)).toBe(5)
    expect(SR5_ConverterHelpers.collisionDamage(10, 3)).toBe(10)
    expect(SR5_ConverterHelpers.collisionDamage(10, 4)).toBe(10)
    expect(SR5_ConverterHelpers.collisionDamage(10, 5)).toBe(20)
    expect(SR5_ConverterHelpers.collisionDamage(10, 6)).toBe(20)
    expect(SR5_ConverterHelpers.collisionDamage(10, 7)).toBe(30)
    expect(SR5_ConverterHelpers.collisionDamage(10, 8)).toBe(30)
  })

  // The two highest bands: x5 (9-10) and x10 (11+); the old m/turn table gave x2 instead of x2.5 for half of x5 (#566)
  it('covers the two highest bands', () => {
    expect(SR5_ConverterHelpers.collisionDamage(16, 9)).toBe(80)
    expect(SR5_ConverterHelpers.collisionDamage(16, 10)).toBe(80)
    expect(SR5_ConverterHelpers.collisionDamage(16, 11)).toBe(160)
    expect(SR5_ConverterHelpers.collisionDamage(16, 20)).toBe(160)
    expect(SR5_ConverterHelpers.rammingInitiatorDamage(SR5_ConverterHelpers.collisionDamage(5, 9), 'side')).toBe(13)
    expect(SR5_ConverterHelpers.rammingInitiatorDamage(SR5_ConverterHelpers.collisionDamage(5, 11), 'rear')).toBe(25)
  })
})

describe('rammingSpeed', () => {
  it('uses the speed difference from the rear', () => {
    expect(SR5_ConverterHelpers.rammingSpeed('rear', 5, 3)).toBe(2)
    expect(SR5_ConverterHelpers.rammingSpeed('rear', 3, 5)).toBe(2)
  })

  it('uses the initiator\'s speed on the side, and by default', () => {
    expect(SR5_ConverterHelpers.rammingSpeed('side', 5, 3)).toBe(5)
    expect(SR5_ConverterHelpers.rammingSpeed(undefined, 5, 3)).toBe(5)
  })

  it('adds both speeds head-on', () => {
    expect(SR5_ConverterHelpers.rammingSpeed('front', 5, 3)).toBe(8)
  })
})

describe('rammingInitiatorDamage', () => {
  it('takes half of the attack\'s damage, rounded up, from the rear or the side', () => {
    expect(SR5_ConverterHelpers.rammingInitiatorDamage(23, 'rear')).toBe(12)
    expect(SR5_ConverterHelpers.rammingInitiatorDamage(23, 'side')).toBe(12)
  })

  it('takes all of it head-on', () => {
    expect(SR5_ConverterHelpers.rammingInitiatorDamage(23, 'front')).toBe(23)
  })

  it('defaults to half when the angle is missing (older chat cards)', () => {
    expect(SR5_ConverterHelpers.rammingInitiatorDamage(23, undefined)).toBe(12)
  })
})

// SR5 p. 204: against something that is not a vehicle, the initiator's damage comes from the relative speed and the target's Body, halved (rounded up)
describe('rammingNonVehicleDamage', () => {
  it('uses the target\'s Body, not the initiator\'s Structure', () => {
    // Body 3, speed 5 (x2) -> 6, halved -> 3
    expect(SR5_ConverterHelpers.rammingNonVehicleDamage(3, {
      angle: 'side', attackerSpeed: 5, targetSpeed: 0
    })).toBe(3)
    // Body 5, speed 9 (x5) -> 25, halved and rounded up -> 13
    expect(SR5_ConverterHelpers.rammingNonVehicleDamage(5, {
      angle: 'side', attackerSpeed: 9, targetSpeed: 0
    })).toBe(13)
  })

  it('stays halved head-on (SR5 has no head-on case)', () => {
    // Body 4, speed 5 + 2 = 7 (x3) -> 12, halved -> 6
    expect(SR5_ConverterHelpers.rammingNonVehicleDamage(4, {
      angle: 'front', attackerSpeed: 5, targetSpeed: 2
    })).toBe(6)
  })
})
