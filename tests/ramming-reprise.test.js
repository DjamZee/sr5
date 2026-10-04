import {
  describe, it, expect
} from 'vitest'
import {
  SR5_ConverterHelpers
} from '../modules/rolls/roll-helpers/converter.js'
import {
  SR5
} from '../modules/config.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

// R4: the init sort (sortTranslations) must keep the book's order of these lists
describe('ramming lists after the init sort', () => {
  it('keeps the angles and gaits in the book\'s order', () => {
    let sorted = SR5_EntityHelpers.sortTranslations(structuredClone(SR5))
    expect(Object.keys(sorted.rammingAngles)).toEqual(['rear', 'side', 'front'])
    expect(Object.keys(sorted.rammingGaits)).toEqual(['walk', 'run'])
  })
})

// SR5 p. 203: vehicle movement rates, walking and running, from the Speed attribute
describe('vehicleMetersPerTurn', () => {
  it('doubles the rate at each Speed point', () => {
    expect(SR5_ConverterHelpers.vehicleMetersPerTurn(0, 'walk')).toBe(0)
    expect(SR5_ConverterHelpers.vehicleMetersPerTurn(1, 'walk')).toBe(5)
    expect(SR5_ConverterHelpers.vehicleMetersPerTurn(1, 'run')).toBe(10)
    expect(SR5_ConverterHelpers.vehicleMetersPerTurn(3, 'walk')).toBe(20)
    expect(SR5_ConverterHelpers.vehicleMetersPerTurn(3, 'run')).toBe(40)
    expect(SR5_ConverterHelpers.vehicleMetersPerTurn(8, 'run')).toBe(1280)
  })
})

// SR5 p. 203: Collision Damage table, relative speed in m/turn
describe('collisionDamageMeters', () => {
  it('follows the m/turn bands', () => {
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 0)).toBe(0)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 1)).toBe(3)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 10)).toBe(3)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 11)).toBe(5)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 50)).toBe(5)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 51)).toBe(10)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 200)).toBe(10)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 201)).toBe(15)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 300)).toBe(15)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 301)).toBe(25)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 500)).toBe(25)
    expect(SR5_ConverterHelpers.collisionDamageMeters(5, 501)).toBe(50)
  })
})

// Rigger 5 p. 184: speed multipliers by locomotion; jet x4, vector thrust x3 and airship x1 by DjamZ's ruling (2026-10-04)
describe('rammingEffectiveSpeed', () => {
  it('applies the locomotion multiplier', () => {
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(2, 'ground')).toBe(2)
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(2, 'rotor')).toBe(6)
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(2, 'jet')).toBe(8)
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(2, 'vectorThrust')).toBe(6)
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(2, 'lta')).toBe(2)
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(2, undefined)).toBe(2)
  })

  // Rounded to the nearest, at least 1 when the vehicle moves (DjamZ's ruling, 2026-10-04)
  it('rounds the watercraft multiplier', () => {
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(3, 'naval')).toBe(2)
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(4, 'naval')).toBe(3)
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(1, 'naval')).toBe(1)
    expect(SR5_ConverterHelpers.rammingEffectiveSpeed(0, 'naval')).toBe(0)
  })
})

describe('rammingLocomotion', () => {
  it('reads the vehicle category first', () => {
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'boat'
    })).toBe('naval')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'submarine'
    })).toBe('naval')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'rotorCraft'
    })).toBe('rotor')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'fixedWingAircraft'
    })).toBe('jet')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'vectorThrustCraft'
    })).toBe('vectorThrust')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'lta'
    })).toBe('lta')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'car', pilotSkill: 'pilotAircraft'
    })).toBe('ground')
  })

  it('falls back on the pilot skill', () => {
    expect(SR5_ConverterHelpers.rammingLocomotion({
      pilotSkill: 'pilotWatercraft'
    })).toBe('naval')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      pilotSkill: 'pilotAircraft'
    })).toBe('rotor')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      pilotSkill: 'pilotAerospace'
    })).toBe('jet')
    expect(SR5_ConverterHelpers.rammingLocomotion({
    })).toBe('ground')
  })

  it('follows an active secondary propulsion', () => {
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'car', secondaryActive: true, secondaryType: 'rotor'
    })).toBe('rotor')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'car', secondaryActive: true, secondaryType: 'amphibiousSurface'
    })).toBe('naval')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'boat', secondaryActive: true, secondaryType: 'hovercraft'
    })).toBe('ground')
    expect(SR5_ConverterHelpers.rammingLocomotion({
      category: 'boat', secondaryActive: false, secondaryType: 'hovercraft'
    })).toBe('naval')
  })
})

describe('rammingAttackDamage', () => {
  // Rigger 5 p. 179 between two vehicles, speeds multiplied by locomotion first
  it('uses the Speed table against a vehicle', () => {
    let ramming = {
      targetIsVehicle: true, angle: 'front', attackerSpeed: 2, attackerLocomotion: 'ground', targetSpeed: 1, targetLocomotion: 'rotor'
    }
    expect(SR5_ConverterHelpers.rammingImpactSpeed(ramming)).toBe(5)
    expect(SR5_ConverterHelpers.rammingAttackDamage(ramming, 10)).toBe(20)
  })

  // R1: SR5 p. 203-204 against a pedestrian, relative speed in m/turn
  it('uses the m/turn table against a pedestrian', () => {
    let ramming = {
      targetIsVehicle: false, angle: 'side', attackerSpeed: 3, relativeSpeed: 40
    }
    expect(SR5_ConverterHelpers.rammingImpactSpeed(ramming)).toBe(40)
    expect(SR5_ConverterHelpers.rammingAttackDamage(ramming, 10)).toBe(10)
  })
})

describe('rammingDefenseDamages', () => {
  const vehicleRamming = {
    targetIsVehicle: true, angle: 'side', attackerSpeed: 3, attackerLocomotion: 'ground', targetSpeed: 0, targetLocomotion: 'ground'
  }
  const pedestrianRamming = {
    targetIsVehicle: false, angle: 'side', attackerSpeed: 3, relativeSpeed: 40
  }

  // R3: the defender's actual type picks the branch
  it('halves the attack against a vehicle', () => {
    expect(SR5_ConverterHelpers.rammingDefenseDamages(vehicleRamming, {
      defenderIsVehicle: true, defenderBody: 4, damageBase: 10, netHits: 3
    }))
      .toEqual({
        target: 13, initiator: 7
      })
  })

  it('uses the pedestrian\'s Body against a pedestrian', () => {
    expect(SR5_ConverterHelpers.rammingDefenseDamages(pedestrianRamming, {
      defenderIsVehicle: false, defenderBody: 6, damageBase: 10, netHits: 3
    }))
      .toEqual({
        target: 13, initiator: 3
      })
  })

  it('takes the defender type over the dialog\'s guess', () => {
    expect(SR5_ConverterHelpers.rammingDefenseDamages(pedestrianRamming, {
      defenderIsVehicle: true, defenderBody: 4, damageBase: 10, netHits: 2
    }).initiator).toBe(6)
  })

  // R2: no relative speed, no damage, net hits included
  it('deals no damage at zero relative speed', () => {
    let rear = {
      ...vehicleRamming, angle: 'rear', targetSpeed: 3
    }
    expect(SR5_ConverterHelpers.rammingDefenseDamages(rear, {
      defenderIsVehicle: true, defenderBody: 4, damageBase: 0, netHits: 4
    }))
      .toEqual({
        target: 0, initiator: 0
      })
    expect(SR5_ConverterHelpers.rammingDefenseDamages({
      ...pedestrianRamming, relativeSpeed: 0
    }, {
      defenderIsVehicle: false, defenderBody: 4, damageBase: 0, netHits: 4
    }))
      .toEqual({
        target: 0, initiator: 0
      })
  })
})
