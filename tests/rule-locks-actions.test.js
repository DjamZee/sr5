import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import {
  SR5Combat
} from '../modules/system/srcombat.js'
import {
  SR5Item
} from '../modules/entities/items/entityItem.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'
import SR5_RollDialog from '../modules/rolls/roll-dialog.js'
import {
  SR5_RollTest
} from '../modules/rolls/roll-test.js'
import {
  SR5_RollTestHelper
} from '../modules/rolls/roll-test-helper.js'
import {
  SR5_SocketHandler
} from '../modules/socket.js'
import {
  presetLocks, resetWhispers
} from '../modules/system/rule-locks.js'

// B13, lot 1 (PLAN-AUTOMATISATION-LEGERE.md, family 1): each site keeps its test, only its exit goes through
// refuseByRule. Book: refused as before. Lifted: the action goes on, and the active GM is asked to whisper it

let settings, emits
const flush = () => new Promise(resolve => setTimeout(resolve, 30))
const lift = locks => {
  settings.sr5RuleLocksMigration = 2
  settings.sr5RuleLocks = {
    ...presetLocks('book'), ...locks
  }
}

beforeEach(() => {
  resetWhispers()
  // A world migrated to the book
  settings = {
    sr5RuleLocksMigration: 2, sr5RuleLocks: presetLocks('book'), sr5FreeReload: false, sr5WifiRequiresDNI: false,
  }
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
  globalThis.game.user = {
    id: 'p1', isGM: false, name: 'Joueuse'
  }
  globalThis.game.users = {
    activeGM: {
      id: 'gm'
    }
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  emits = []
  vi.spyOn(SR5_SocketHandler, 'emitForGM').mockImplementation(async (type, data) => {
    emits.push([type, data])
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.game.combat
  delete globalThis.game.users
})

const runner = (actions = {
}) => ({
  id: 'a1', uuid: 'Actor.a1', name: 'Dodger', isToken: false,
  system: {
    specialProperties: {
      actions: {
        free: {
          current: 1, value: 1
        }, simple: {
          current: 0, value: 2
        }, complex: {
          current: 0, value: 1
        }, ...actions
      },
      smartlink: {
        value: 0
      },
    },
    skills: {
      unarmedCombat: {
        rating: {
          value: 0
        }
      }
    },
  },
  items: [],
})

function inCombat(actor, initiative = 10) {
  globalThis.game.combat = {
    id: 'cb', round: 1, started: true, combatant: {
      id: 'c1'
    }
  }
  vi.spyOn(SR5Combat, 'getCombatantFromActor').mockReturnValue({
    id: 'c1', initiative, actor
  })
}

describe('actions left in the pass (hasActionsLeft)', () => {
  const simple = [{
    type: 'simple', value: 1, source: 'test'
  }]

  it('"missing actions" checked: refused as before, nothing whispered', async () => {
    const actor = runner()
    inCombat(actor)
    expect(SR5Combat.hasActionsLeft(actor, simple)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_NoActionLeft')
    await flush()
    expect(emits).toEqual([])
  })

  it('"missing actions" lifted: the action goes, the player is not warned, the GM is asked once', async () => {
    lift({
      missingActions: false
    })
    const actor = runner()
    inCombat(actor)
    expect(SR5Combat.hasActionsLeft(actor, simple)).toBe(true)
    expect(SR5Combat.hasActionsLeft(actor, simple)).toBe(true)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    await flush()
    expect(emits).toHaveLength(1)
    expect(emits[0][0]).toBe('ruleLockWhisper')
    expect(emits[0][1]).toMatchObject({
      family: 'actions', key: 'SR5.WARN_NoActionLeft', actor: 'Dodger'
    })
  })

  it('an initiative score of 0 or less: refused with the box, goes without it', async () => {
    const actor = runner({
      simple: {
        current: 2, value: 2
      }
    })
    inCombat(actor, 0)
    expect(SR5Combat.hasActionsLeft(actor, simple)).toBe(false)
    lift({
      missingActions: false
    })
    expect(SR5Combat.hasActionsLeft(actor, simple)).toBe(true)
    await flush()
    expect(emits[0][1].key).toBe('SR5.WARN_ActionNoInitiative')
  })
})

describe('reloading in combat (entityItem.reloadAmmo, § 0.5)', () => {
  function weapon() {
    const owner = runner()
    owner.items = [{
      type: 'itemAmmunition', system: {
        type: 'regular', class: 'heavyPistol', quantity: 30
      }, update: vi.fn()
    }]
    const item = Object.create(SR5Item.prototype)
    Object.defineProperty(item, 'actor', {
      value: owner
    })
    item.system = {
      type: 'heavyPistol', isWireless: false, accessory: [],
      ammunition: {
        casing: 'clip', type: 'regular', value: 0, max: 15, clipInserted: false
      }
    }
    item.update = vi.fn()
    item.toObject = () => ({
      system: item.system
    })
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(owner)
    vi.spyOn(foundry.utils, 'duplicate').mockImplementation(o => structuredClone(o.toObject ? o.toObject() : o))
    vi.spyOn(SR5Combat, 'changeActionInCombat').mockImplementation(() => {})
    globalThis.game.combat = {
    }
    return item
  }

  it('the "actions" family checked: no action left, no reload, even with "missing actions" unchecked', async () => {
    lift({
      missingActions: false
    })
    const item = weapon()
    await item.reloadAmmo('insert')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_NotEnoughAction')
    expect(item.update).not.toHaveBeenCalled()
  })

  it('the family lifted: the clip goes in, the GM is asked', async () => {
    lift({
      actions: false
    })
    const item = weapon()
    await item.reloadAmmo('insert')
    expect(item.update).toHaveBeenCalled()
    await flush()
    expect(emits[0][1]).toMatchObject({
      family: 'actions', key: 'SR5.WARN_NotEnoughAction'
    })
  })
})

describe('interruption and active defense (roll-dialog)', () => {
  it('not enough initiative for an interruption: refused by the book, goes with the family lifted', async () => {
    const actor = runner()
    inCombat(actor, 4)
    expect(SR5_RollDialog.hasInitiativeForInterruption(actor, 5)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_NotEnoughInitiative')
    lift({
      actions: false
    })
    expect(SR5_RollDialog.hasInitiativeForInterruption(actor, 5)).toBe(true)
    await flush()
    expect(emits[0][1].key).toBe('SR5.WARN_NotEnoughInitiative')
  })

  it('"missing actions" unchecked does not lift the interruption', () => {
    lift({
      missingActions: false
    })
    const actor = runner()
    inCombat(actor, 4)
    expect(SR5_RollDialog.hasInitiativeForInterruption(actor, 5)).toBe(false)
  })

  it('a block without Unarmed Combat: refused by the book, goes with the family lifted', async () => {
    const actor = runner()
    expect(SR5_RollDialog.hasActiveDefenseSkill(actor, 'block')).toBe(false)
    lift({
      actions: false
    })
    expect(SR5_RollDialog.hasActiveDefenseSkill(actor, 'block')).toBe(true)
    await flush()
    expect(emits[0][1].key).toBe('SR5.WARN_ActiveDefenseNoSkill')
  })
})

describe('Edge during an extended test (roll-test, ruling of 05/10)', () => {
  const card = (extra = {
  }) => ({
    id: 'm1', flags: {
      sr5data: {
        test: {
          isExtended: true, extended: {
            roll: 2
          }
        },
        edge: {
          hasUsedPushTheLimit: false
        },
        roll: {
          hits: 1, dices: [], rollDices: [{
            result: 2
          }]
        },
        dicePool: {
          value: 6
        },
        limit: {
          value: 0
        },
        ...extra,
      }
    }
  })

  it('Second Chance: refused by the book; with the family lifted, the dice roll', async () => {
    const actor = runner()
    vi.spyOn(SR5_RollTest, 'rollDice').mockRejectedValue(new Error('rolled'))
    expect(await SR5_RollTest.secondeChance(card(), actor)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_EdgeExtendedTestPushOnly')
    lift({
      actions: false
    })
    await expect(SR5_RollTest.secondeChance(card(), actor)).rejects.toThrow('rolled')
    await flush()
    expect(emits[0][1].key).toBe('SR5.WARN_EdgeExtendedTestPushOnly')
  })

  it('Push the Limit after the first roll: refused by the book; with the family lifted, it goes on', async () => {
    const actor = runner()
    vi.spyOn(SR5_RollTestHelper, 'determineEdgeActor').mockRejectedValue(new Error('pushed'))
    expect(await SR5_RollTest.pushTheLimit(card(), actor)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_EdgeExtendedTestStartOnly')
    lift({
      actions: false
    })
    await expect(SR5_RollTest.pushTheLimit(card(), actor)).rejects.toThrow('pushed')
    await flush()
    expect(emits[0][1].key).toBe('SR5.WARN_EdgeExtendedTestStartOnly')
  })
})
