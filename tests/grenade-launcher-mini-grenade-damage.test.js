import {
  describe, it, expect
} from 'vitest'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'

// SR5 p. 437: mini-grenades have the same effects as the normal grenades. Flashbang 10S, fragmentation 18P (f),
// high explosive 16P, smoke and gas no damage. A fragmentation mini-grenade fired from a launcher dealt Stun.
const pool = () => ({
  base: 0, value: 0, modifiers: []
})
const launcher = type => ({
  type: 'grenadeLauncher', damageType: 'physical', damageElement: 'physical',
  ammunition: {
    type
  },
  armorPenetration: pool(), damageValue: pool(),
  blast: {
    radius: 0, damageFallOff: 0
  },
})

describe('mini-grenade damage type (SR5 p. 437)', () => {
  for (const [type, expected] of [
    ['fragmentationMini', 'physical'],
    ['fragmentation', 'physical'],
    ['highlyExplosiveMini', 'physical'],
    ['flashBangMini', 'stun'],
    ['fragmentationMissile', 'physical'],
  ]) {
    it(`${type} deals ${expected} damage`, () => {
      const itemData = launcher(type)
      SR5_UtilityItem._handleWeaponAmmunition(itemData)
      expect(itemData.damageType).toBe(expected)
    })
  }

  it('the fragmentation mini-grenade keeps 18, +5 and -1/m', () => {
    const itemData = launcher('fragmentationMini')
    SR5_UtilityItem._handleWeaponAmmunition(itemData)
    expect(itemData.blast).toEqual({
      radius: 18, damageFallOff: -1
    })
  })
})
