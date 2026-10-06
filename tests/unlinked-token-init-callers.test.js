import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_RollTest
} = await import('../modules/rolls/roll-test.js')
const {
  SR5_CombatHelpers
} = await import('../modules/rolls/roll-helpers/combat.js')
const {
  SR5Combat
} = await import('../modules/system/srcombat.js')

// An unlinked token's actor carries the id of its base actor: a change of initiative sent with actor.id named
// the base actor, which no combatant answers to any more (f26bdec4e), and the penalty was lost (SR5 p. 170)
const synthetic = {
  id: 'base', isToken: true, token: {
    id: 't1'
  }, effects: []
}
const linked = {
  id: 'lnk', isToken: false, effects: []
}

describe('the fighter id of an actor', () => {
  it('an unlinked token is named by its token, a linked actor by itself', () => {
    expect(SR5Combat.fighterIdOf(synthetic)).toBe('t1')
    expect(SR5Combat.fighterIdOf(linked)).toBe('lnk')
  })
})

describe('full defense of an unlinked token', () => {
  let init
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(SR5_CombatHelpers, 'applyFullDefenseEffect').mockImplementation(() => {})
    init = vi.spyOn(SR5Combat, 'changeInitInCombatHelper').mockImplementation(() => {})
  })

  it('the -10 is taken off the token, not off the base actor', () => {
    SR5_RollTest.applyDefenseStance({
      dicePool: {
        modifiers: [{
          type: 'fullDefense'
        }]
      }, combat: {
        activeDefenseSelected: 'none'
      }
    }, synthetic)
    expect(init).toHaveBeenCalledWith('t1', -10)
  })
})

describe('no change of initiative is sent with the id an unlinked token shares with its base actor', () => {
  const files = [
    'modules/rolls/roll-test.js', 'modules/rolls/roll-message.js', 'modules/hooks/item.js',
    'modules/entities/actors/entityActor-helpers.js', 'modules/rolls/roll-test-case/test-IceDefense.js',
    'modules/rolls/roll-test-case/test-Resistance.js'
  ]
  for (const file of files) it(file, () => {
    const calls = readFileSync(file, 'utf8').match(/changeInitInCombatHelper\([^,)]*/g) ?? []
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call).toMatch(/fighterIdOf\(/)
  })
})
