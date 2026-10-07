import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

// The attack card of a melee weapon showed "Reach: 0" when no scene was viewed (Morning Star of Vertige, Reach 1,
// Garance): handleTargetInfo stops before its melee block, which was the only one to copy the Reach.
const source = readFileSync(new URL('../modules/rolls/roll-prepare-case/rollData-Weapon.js', import.meta.url), 'utf8')

describe('Reach on the melee attack card', () => {
  it('is copied before the target and scene are read', () => {
    const copy = source.indexOf('rollData.combat.reach = itemData.reach.value')
    const call = source.indexOf('rollData = await handleTargetInfo(rollData, actor, item)')
    expect(copy).toBeGreaterThan(-1)
    expect(copy).toBeLessThan(call)
  })
  it('is copied once, so the clinch that cancels it (Run & Gun p. 133) still has the last word', () => {
    expect(source.split('rollData.combat.reach = itemData.reach.value').length).toBe(2)
    expect(source.indexOf('rollData.combat.reach = 0')).toBeGreaterThan(source.indexOf('rollData.combat.reach = itemData.reach.value'))
  })
})
