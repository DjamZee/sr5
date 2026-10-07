import {
  describe, it, expect
} from 'vitest'
import {
  isMountedWeapon, vehicleMeleeStrength, vehicleMeleeSpeedBonus, vehicleWeaponSkill
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
