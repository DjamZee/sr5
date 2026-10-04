import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

// N93: the "Defend" buttons must go through defenseActorId, not straight to the selected token
describe('Defend buttons wiring', () => {
  const source = readFileSync(new URL('../modules/rolls/roll-message.js', import.meta.url), 'utf8')

  it('picks the defender with defenseActorId before rolling the defense', () => {
    const block = source.match(/case "defenseAstralCombat":([\s\S]*?)break/)[1]
    expect(block).toMatch(/actor = SR5_EntityHelpers\.getRealActorFromID\(defenseActorId\(/)
    expect(block.indexOf('defenseActorId')).toBeLessThan(block.indexOf('rollTest("defense"'))
  })
})
