import {
  describe, it, expect
} from 'vitest'
import {
  isMountedWeapon, vehicleMeleeStrength, vehicleMeleeSpeedBonus, vehicleWeaponSkill, isDroneArm, droneArmProfile
} from '../modules/system/vehicle-melee.js'

const mount = (weaponId, isActive = true) => ({
  type: 'itemVehicleMod', system: {
    isWeaponMounted: true, mountedWeapon: weaponId, isActive
  }
})

describe('Melee weapon of a vehicle (Rigger 5.0 p. 129, 182)', () => {
  it('a weapon held by an active weapon mount is mounted', () => {
    expect(isMountedWeapon('w1', [mount('w1')])).toBe(true)
    expect(isMountedWeapon('w1', [mount('w2')])).toBe(false)
    expect(isMountedWeapon('w1', [mount('w1', false)])).toBe(false)
    expect(isMountedWeapon('w1', undefined)).toBe(false)
  })
  it('mounted, it hits with half the Body (p. 182); in a drone arm, with the Body (p. 129)', () => {
    expect(vehicleMeleeStrength(5, true)).toBe(2)
    expect(vehicleMeleeStrength(6, true)).toBe(3)
    expect(vehicleMeleeStrength(5, false)).toBe(5)
    expect(vehicleMeleeStrength(undefined, false)).toBe(0)
  })
  it('the Speed is added to the damage (p. 182)', () => {
    expect(vehicleMeleeSpeedBonus(3)).toBe(3)
    expect(vehicleMeleeSpeedBonus(-1)).toBe(0)
  })
  it('the controller rolls Gunnery for a mounted weapon (SR5 p. 134), the melee skill for an arm', () => {
    expect(vehicleWeaponSkill('rangedWeapon', false, 'automatics')).toBe('gunnery')
    expect(vehicleWeaponSkill('meleeWeapon', true, 'blades')).toBe('gunnery')
    expect(vehicleWeaponSkill('meleeWeapon', false, 'blades')).toBe('blades')
    expect(vehicleWeaponSkill('meleeWeapon', false, '')).toBe('gunnery')
  })
})

const arm = (name, droneArm = {
}) => ({
  type: 'itemVehicleMod', name, system: {
    droneArm: {
      isDroneArm: false, strength: 0, agility: 0, ...droneArm
    }
  }
})

describe('Drone arm (Rigger 5.0 p. 129)', () => {
  it('is the modification ticked as one, or named after it', () => {
    expect(isDroneArm(arm('Pince', {
      isDroneArm: true
    }))).toBe(true)
    expect(isDroneArm(arm('Bras de drone (Force 6, Agilité 2)'))).toBe(true)
    expect(isDroneArm(arm('Drone arm'))).toBe(true)
    expect(isDroneArm(arm('Jambes de drone'))).toBe(false)
    expect(isDroneArm({
      type: 'itemWeapon', name: 'Bras de drone'
    })).toBe(false)
  })
  it('starts with Strength = Body and Agility = Pilot', () => {
    expect(droneArmProfile([arm('Bras de drone')], 5, 3)).toEqual({
      name: 'Bras de drone', strength: 5, agility: 3
    })
  })
  it('reads the value set on the modification, then the one its name gives (the Mule of the Mégapack)', () => {
    expect(droneArmProfile([arm('Bras de drone', {
      strength: 7, agility: 4
    })], 5, 3)).toMatchObject({
      strength: 7, agility: 4
    })
    expect(droneArmProfile([arm('Bras de drone (Force 6, Agilité 2)')], 4, 2)).toMatchObject({
      strength: 6, agility: 2
    })
  })
  it('never more than twice the drone\'s, whatever the upgrades', () => {
    expect(droneArmProfile([arm('Bras de drone', {
      strength: 11, agility: 9
    })], 5, 3)).toMatchObject({
      strength: 10, agility: 6
    })
  })
  it('the strongest arm holds the weapon; none, no profile', () => {
    expect(droneArmProfile([arm('Bras de drone (Force 4)'), arm('Bras de drone (Force 8)')], 4, 2).strength).toBe(8)
    expect(droneArmProfile([], 4, 2)).toBeNull()
  })
  it('the weapon in the arm hits with the arm\'s Strength, a mounted one with half the Body', () => {
    expect(vehicleMeleeStrength(5, false, 8)).toBe(8)
    expect(vehicleMeleeStrength(5, true, 8)).toBe(2)
  })
})
