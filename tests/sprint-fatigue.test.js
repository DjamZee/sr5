import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  sprintFatigueStep, isSprintCard, onSprintCard, SPRINT_FATIGUE_FLAG
} = await import('../modules/system/sprint-fatigue.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  SR5Combat
} = await import('../modules/system/srcombat.js')

// SR5 p. 174: 1E for each consecutive action phase or Combat Turn of sprint, cumulative (1E, 2E, 3E...)
describe('the streak of a sprinter', () => {
  it('starts at 1E', () => {
    expect(sprintFatigueStep(undefined, 1, 1)).toEqual({
      round: 1, pass: 1, streak: 1
    })
  })

  it('goes up on a later phase of the same Combat Turn, and on the next Combat Turn', () => {
    expect(sprintFatigueStep({
      round: 1, pass: 1, streak: 1
    }, 1, 2).streak).toBe(2)
    expect(sprintFatigueStep({
      round: 1, pass: 3, streak: 2
    }, 2, 1).streak).toBe(3)
  })

  it('starts again at 1E after a Combat Turn without sprint', () => {
    expect(sprintFatigueStep({
      round: 1, pass: 1, streak: 4
    }, 3, 1).streak).toBe(1)
  })

  it('counts a phase once', () => {
    expect(sprintFatigueStep({
      round: 2, pass: 1, streak: 1
    }, 2, 1)).toBeNull()
  })
})

describe('the resistance of fatigue (SR5 p. 174: Body + Willpower, without armor)', () => {
  it('takes the fatigue pool, not the damage one with its armor, and Stun damage', async () => {
    const {
      default: resistance
    } = await import('../modules/rolls/roll-prepare-case/rollData-Resistance.js')
    const fatigue = [{
      source: 'Constitution', type: 'linkedAttribute', value: 4
    }, {
      source: 'Volonté', type: 'linkedAttribute', value: 3
    }]
    const target = {
      id: 'a', type: 'actorPc', system: {
        resistances: {
          fatigue: {
            dicePool: 7, modifiers: fatigue
          }, physicalDamage: {
            dicePool: 16, modifiers: []
          }
        }
      }
    }
    const result = await resistance({
      damage: {
      }, previousMessage: {
      }, combat: {
      }, test: {
      }, threshold: {
      }, dicePool: {
        modifiers: []
      }
    }, 'resistanceCard', target, {
      owner: {
      }, roll: {
      }, combat: {
        calledShot: {
        }, grenade: {
        }
      }, magic: {
      }, test: {
      }, damage: {
        value: 2, type: 'stun', resistanceType: 'fatigue'
      }
    })
    expect(result.dicePool.base).toBe(7)
    expect(result.dicePool.composition).toEqual(fatigue)
    expect(result.damage.type).toBe('stun')
    expect(result.test.typeSub).toBe('fatigue')
  })
})

describe('the Sprint card read by the active GM', () => {
  let combat, actor, roll, owner
  const player = {
    id: 'u1', isGM: false
  }
  const card = (author = player, test = {
    type: 'movement', typeSub: 'run'
  }) => ({
    author, flags: {
      sr5data: {
        test, owner: {
          actorId: 'a1'
        }
      }
    }
  })

  beforeEach(() => {
    owner = true
    actor = {
      id: 'a1', system: {
        resistances: {
          fatigue: {
            dicePool: 7, modifiers: []
          }
        }
      },
      testUserPermission: vi.fn(() => owner),
      rollTest: vi.fn(async () => {})
    }
    roll = actor.rollTest
    combat = {
      started: true, round: 1, flags: {
        sr5: {
          combatInitiativePass: 1
        }
      },
      getFlag(scope, key) { return this.flags[scope][key] },
      setFlag: vi.fn(async function (scope, key, value) { this.flags[scope][key] = value })
    }
    globalThis.game.combat = combat
    globalThis.game.users = {
      activeGM: {
        isSelf: true
      }
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    vi.spyOn(SR5Combat, 'getCombatantFromActor').mockReturnValue({
      id: 'k1'
    })
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
      damage: {
      }
    }))
  })
  afterEach(() => vi.restoreAllMocks())

  it('recognizes the Sprint test only', () => {
    expect(isSprintCard(card())).toBe(true)
    expect(isSprintCard(card(player, {
      type: 'movement', typeSub: 'swim'
    }))).toBe(false)
  })

  it('has the GM roll 1E, then 2E in the next pass, Body + Willpower without armor', async () => {
    await onSprintCard(card())
    expect(roll).toHaveBeenCalledWith('resistanceCard', null, {
      damage: {
        value: 1, type: 'stun', resistanceType: 'fatigue'
      }
    })
    combat.flags.sr5.combatInitiativePass = 2
    await onSprintCard(card())
    expect(roll.mock.calls[1][2].damage.value).toBe(2)
    expect(combat.flags.sr5[SPRINT_FATIGUE_FLAG].k1).toEqual({
      round: 1, pass: 2, streak: 2
    })
  })

  it('counts a second card of the same phase once, even arriving together', async () => {
    await onSprintCard(card())
    await onSprintCard(card())
    expect(roll).toHaveBeenCalledTimes(1)
    combat.flags.sr5.combatInitiativePass = 2
    await Promise.all([onSprintCard(card()), onSprintCard(card())])
    expect(roll).toHaveBeenCalledTimes(2)
  })

  it('reads nothing from a card whose author does not own the actor (a forged card)', async () => {
    owner = false
    await onSprintCard(card())
    expect(roll).not.toHaveBeenCalled()
    expect(combat.setFlag).not.toHaveBeenCalled()
  })

  it('only the active GM counts, and only in a started combat', async () => {
    globalThis.game.users.activeGM.isSelf = false
    await onSprintCard(card())
    globalThis.game.users.activeGM.isSelf = true
    combat.started = false
    await onSprintCard(card())
    expect(roll).not.toHaveBeenCalled()
  })
})
