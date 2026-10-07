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
  vintageWirelessRefused
} from '../modules/entities/items/weaponTraits.js'
import {
  enhancementRefused
} from '../modules/entities/items/weapon-accessory-rules.js'
import {
  presetLocks, resetWhispers
} from '../modules/system/rule-locks.js'

// B13, lot 2 (PLAN-AUTOMATISATION-LEGERE.md, family 3): each site keeps its test, only its exit goes through
// refuseByRule. Book: refused as before. Lifted: the action goes on, and the active GM is asked to whisper it

let settings, emits
const flush = () => new Promise(resolve => setTimeout(resolve, 30))
const lift = locks => {
  settings.sr5RuleLocks = {
    ...presetLocks('book'), ...locks
  }
}
const ammoKeys = () => emits.filter(([, d]) => d.family === 'ammo').map(([, d]) => d.key)

beforeEach(() => {
  resetWhispers()
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
    attributes: {
      agility: {
        augmented: {
          value: 4
        }
      }
    },
    specialProperties: {
      actions: {
        free: {
          current: 1, value: 1
        }, simple: {
          current: 2, value: 2
        }, complex: {
          current: 1, value: 1
        }, ...actions
      },
    },
  },
  items: [],
})

describe('suppressive fire with too few rounds (roll-test, SR5 p. 179)', () => {
  const dialog = () => ({
    test: {
      typeSub: 'rangedWeapon'
    },
    combat: {
      firingMode: {
        selected: 'SF'
      }, ammo: {
        value: 3
      }, actions: [{
        type: 'complex', value: 1, source: 'attack'
      }]
    },
  })

  it('the "ammo" family checked: the dialog stays open, as before', async () => {
    expect(SR5_RollTest.rollClickRefused(runner(), dialog())).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_FiringModeAmmo')
    await flush()
    expect(emits).toEqual([])
  })

  it('the family lifted: the roll goes, the player is not warned, the GM is asked', async () => {
    lift({
      ammo: false
    })
    expect(SR5_RollTest.rollClickRefused(runner(), dialog())).toBe(false)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    await flush()
    expect(emits).toHaveLength(1)
    expect(emits[0][1]).toMatchObject({
      family: 'ammo', key: 'SR5.WARN_FiringModeAmmo', actor: 'Dodger', data: {
        needed: 20, left: 3
      }
    })
  })

  it('lifted, but no action left: the dialog stays open and nothing is said of the rounds', async () => {
    lift({
      ammo: false
    })
    const actor = runner({
      complex: {
        current: 0, value: 1
      }
    })
    globalThis.game.combat = {
      id: 'cb', round: 1, started: true, combatant: {
        id: 'c1'
      }
    }
    vi.spyOn(SR5Combat, 'getCombatantFromActor').mockReturnValue({
      id: 'c1', initiative: 10, actor
    })
    expect(SR5_RollTest.rollClickRefused(actor, dialog())).toBe(true)
    await flush()
    expect(ammoKeys()).toEqual([])
  })

  it('the roll gone, the clip stops at 0, never below', async () => {
    const weapon = {
      type: 'itemWeapon', isOwner: true, update: vi.fn(),
      system: {
        category: 'rangedWeapon', ammunition: {
          value: 3
        }, firingMode: {
          current: 'SF'
        }, choke: {
          current: ''
        }
      },
    }
    weapon.toObject = () => structuredClone({
      type: weapon.type, system: weapon.system
    })
    globalThis.fromUuid = vi.fn(async () => weapon)
    vi.spyOn(foundry.utils, 'duplicate').mockImplementation(o => structuredClone(o.toObject ? o.toObject() : o))
    // Foundry's own diff, reduced to what this roll changes
    foundry.utils.diffObject = (_before, after) => after
    foundry.utils.isEmpty = o => !Object.keys(o).length
    await SR5_RollTestHelper.updateItemAfterRoll({
      owner: {
        itemUuid: 'Item.w'
      }, combat: {
        ammo: {
          fired: 20
        }, firingMode: {
          selected: 'SF'
        }, choke: {
          selected: ''
        }
      }, roll: {
      }, magic: {
      }, matrix: {
      },
    })
    expect(weapon.update).toHaveBeenCalledWith({
      system: expect.objectContaining({
        ammunition: {
          value: 0
        }
      })
    })
    delete foundry.utils.diffObject
    delete foundry.utils.isEmpty
    delete globalThis.fromUuid
  })
})

describe('reloading (entityItem.reloadAmmo)', () => {
  function weapon({
    casing = 'clip', value = 0, clipInserted = false, accessory = [], actions = {
    }
  } = {
  }) {
    const owner = runner(actions)
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
      type: 'heavyPistol', isWireless: false, accessory,
      ammunition: {
        casing, type: 'regular', value, max: 15, clipInserted
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
  const capBall = () => weapon({
    casing: 'cylinder', accessory: [{
      name: 'capBall'
    }]
  })

  it('Cap & Ball, a whole cylinder in combat: refused by the book', async () => {
    const item = capBall()
    await item.reloadAmmo('insert')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_CapBallRoundByRound')
    expect(item.update).not.toHaveBeenCalled()
  })

  it('Cap & Ball, the family lifted: it reloads like any cylinder, the GM is asked', async () => {
    lift({
      ammo: false
    })
    const item = capBall()
    await item.reloadAmmo('insert')
    expect(item.update).toHaveBeenCalled()
    await flush()
    expect(ammoKeys()).toEqual(['SR5.WARN_CapBallRoundByRound'])
  })

  it('Cap & Ball lifted, but no action for the reload: refused, and nothing is said of the rule', async () => {
    lift({
      ammo: false
    })
    const item = weapon({
      casing: 'cylinder', accessory: [{
        name: 'capBall'
      }], actions: {
        complex: {
          current: 0, value: 1
        }
      }
    })
    await item.reloadAmmo('insert')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_NotEnoughAction')
    expect(item.update).not.toHaveBeenCalled()
    await flush()
    expect(ammoKeys()).toEqual([])
  })

  it('filling a clip round by round in combat: refused by the book, goes with the family lifted', async () => {
    const item = weapon()
    await item.reloadAmmo('insertRoundFull')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_NotPossibleInCombat')
    expect(item.update).not.toHaveBeenCalled()
    lift({
      ammo: false
    })
    await item.reloadAmmo('insertRoundFull')
    expect(item.update).toHaveBeenCalled()
    await flush()
    expect(ammoKeys()).toEqual(['SR5.WARN_NotPossibleInCombat'])
  })

  it('a clip over a clip in combat: refused by the book, goes with the family lifted', async () => {
    const item = weapon({
      value: 5, clipInserted: true
    })
    await item.reloadAmmo('insert')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_RemoveClipFirst')
    expect(item.update).not.toHaveBeenCalled()
    lift({
      ammo: false
    })
    await item.reloadAmmo('insert')
    expect(item.update).toHaveBeenCalled()
    await flush()
    expect(ammoKeys()).toEqual(['SR5.WARN_RemoveClipFirst'])
  })
})

describe('Vintage wireless (baseSheet, Gun H(e)aven 3 p. 3)', () => {
  const vintage = {
    type: 'itemWeapon', system: {
      accessory: [{
        name: 'vintage'
      }]
    }
  }

  it('refused by the book; the switch goes with the family lifted', async () => {
    expect(vintageWirelessRefused(vintage, runner())).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_VintageNoWireless')
    lift({
      ammo: false
    })
    expect(vintageWirelessRefused(vintage, runner())).toBe(false)
    await flush()
    expect(ammoKeys()).toEqual(['SR5.WARN_VintageNoWireless'])
  })

  it('a modern weapon is never concerned', () => {
    expect(vintageWirelessRefused({
      type: 'itemWeapon', system: {
        accessory: []
      }
    }, runner())).toBe(false)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })
})

describe('Capacity of a weapon accessory (itemSheet, SR5 p. 447)', () => {
  const scope = {
    name: 'imagingScope', system: {
      weaponAccessory: {
        capacity: 1, visionEnhancements: [{
          system: {
            capacityTaken: {
              value: 1
            }
          }
        }]
      }
    }
  }
  const enhancement = {
    system: {
      capacityTaken: {
        value: 1
      }
    }
  }

  it('full: refused by the book; mounted with the family lifted', async () => {
    expect(enhancementRefused(scope, enhancement, runner())).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_AccessoryCapacityFull')
    lift({
      ammo: false
    })
    expect(enhancementRefused(scope, enhancement, runner())).toBe(false)
    await flush()
    expect(ammoKeys()).toEqual(['SR5.WARN_AccessoryCapacityFull'])
  })
})
