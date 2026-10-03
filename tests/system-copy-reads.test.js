import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
})

import {
  SR5Combat
} from '../modules/system/srcombat.js'
import {
  sr5HookDeleteCombatActions
} from '../modules/hooks/combat.js'
import {
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'
import {
  SR5_PrepareRollTest
} from '../modules/rolls/roll-prepare.js'

// A system data model as Foundry builds it: the prepared values are its own properties, the stored ones sit
// in _source. JSON goes through toJSON, so foundry.utils.duplicate(system) hands back the SOURCE (DataModel#toJSON)
class FakeSystem {
  constructor(source, prepared){
    Object.defineProperty(this, '_source', {
      value: source, enumerable: false
    })
    Object.assign(this, prepared)
  }
  toJSON(){
    return JSON.parse(JSON.stringify(this._source))
  }
}

// Foundry's deepClone (common/utils/helpers.mjs): an object that is not a plain Object comes back as is
function foundryDeepClone(original){
  if ((typeof original !== "object") || (original === null)) return original
  if (original instanceof Array) return original.map(o => foundryDeepClone(o))
  if (original instanceof Date) return new Date(original)
  if (original.constructor && (original.constructor !== Object)) return original
  const clone = {
  }
  for (const k of Object.keys(original)) clone[k] = foundryDeepClone(original[k])
  return clone
}

const action = (value, current = value) => ({
  value, base: value, modifiers: [], current
})

// Stored: 1 free, 2 simple, 1 complex (SR5 p. 163). Prepared: an effect grants one more simple action
function actionsSystem(){
  return new FakeSystem({
    specialProperties: {
      actions: {
        free: action(1, 0), simple: action(2, 0), complex: action(1, 0)
      }
    }
  }, {
    specialProperties: {
      actions: {
        free: action(1, 0), simple: {
          ...action(2, 0), value: 3, modifiers: [{
            source: 'effect', value: 1
          }]
        }, complex: action(1, 0)
      }
    }
  })
}

function fakeActor(system, extra = {
}){
  return {
    id: 'a1', name: 'Test', isToken: false, items: [], effects: [], system,
    update: vi.fn(async () => {}),
    ...extra,
  }
}

let realDeepClone
beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
  realDeepClone = foundry.utils.deepClone
  foundry.utils.deepClone = foundryDeepClone
})
afterEach(() => {
  foundry.utils.deepClone = realDeepClone
  vi.restoreAllMocks()
})

describe('actions per turn keep the extra actions granted by an effect (SR5 p. 163-165)', () => {
  it('resets the combatant and the actor to the prepared number of actions each turn', async () => {
    const actor = fakeActor(actionsSystem())
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    const combatant = {
      update: vi.fn(async () => {})
    }
    const user = game.user
    game.user = {
      isGM: true
    }

    await SR5Combat.resetActionInCombat('a1', combatant)
    game.user = user

    expect(combatant.update).toHaveBeenCalledWith({
      "flags.sr5.actions.free": 1,
      "flags.sr5.actions.simple": 3,
      "flags.sr5.actions.complex": 1,
    })
    const changes = actor.update.mock.calls[0][0]
    expect(changes["system.specialProperties.actions.simple.current"]).toBe(3)
    expect(changes["system.specialProperties.actions.free.current"]).toBe(1)
    expect(changes.system).toBeUndefined()
  })

  it('refuses to give actions back when the call does not come from the gamemaster', async () => {
    const actor = fakeActor(actionsSystem())
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    const combatant = {
      update: vi.fn(async () => {})
    }
    const user = game.user
    game.user = {
      isGM: false
    }

    await SR5Combat.resetActionInCombat('a1', combatant)
    game.user = user

    expect(combatant.update).not.toHaveBeenCalled()
    expect(actor.update).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith("SR5.WARN_ResetActionsGMOnly")
  })

  it('gives the actions back to the synthetic actor of an unlinked token, without the canvas', async () => {
    const actor = fakeActor(actionsSystem())
    //No canvas: the token id resolves to nothing
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(undefined)
    const combatant = {
      actor, tokenId: 't1', update: vi.fn(async () => {})
    }
    const user = game.user
    game.user = {
      isGM: true
    }

    await SR5Combat.resetActionInCombat('t1', combatant)
    game.user = user

    expect(SR5Combat.getActorFromCombatant(combatant)).toBe(actor)
    expect(actor.update.mock.calls[0][0]["system.specialProperties.actions.simple.current"]).toBe(3)
  })

  it('resets the actor to the prepared number of actions when the combat ends', async () => {
    const actor = fakeActor(actionsSystem())
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    globalThis.game.user = {
      isGM: true
    }

    await sr5HookDeleteCombatActions({
      combatants: [{
        actor: {
          isToken: false
        }, actorId: 'a1'
      }]
    })

    const changes = actor.update.mock.calls[0][0]
    expect(changes["system.specialProperties.actions.simple.current"]).toBe(3)
    expect(changes.system).toBeUndefined()
  })
})

// Edge: stored 1 point spent, prepared rating 4
function edgeSystem(){
  const edge = () => ({
    value: 4, actual: {
      base: 1, value: 1, modifiers: []
    }
  })
  return new FakeSystem({
    conditionMonitors: {
      edge: edge()
    }
  }, {
    conditionMonitors: {
      edge: edge()
    }
  })
}

describe('Seize the Initiative and Blitz spend their Edge point by path', () => {
  for (const method of ['seizeInitiative', 'blitz']) {
    it(`${method} never sends the live data model to update`, async () => {
      const system = edgeSystem()
      const actor = fakeActor(system)
      vi.spyOn(SR5Combat, 'getActorFromCombatant').mockReturnValue(actor)
      const combatant = {
        setFlag: vi.fn(async () => {}), update: vi.fn(async () => {})
      }

      await SR5Combat[method](combatant)

      expect(actor.update).toHaveBeenCalledWith({
        "system.conditionMonitors.edge.actual.base": 2
      })
      // The prepared data is left alone until the update rebuilds it
      expect(system.conditionMonitors.edge.actual.base).toBe(1)
    })
  }
})

describe('the end of a turn resets the counterspelling pool by path', () => {
  it('resets the pool without sending a system object, and reads it after the damage of the turn', async () => {
    const monitors = (damage) => ({
      physical: {
        value: 10, actual: {
          base: damage, value: damage, modifiers: []
        }
      }
    })
    const build = (damage) => new FakeSystem({
      conditionMonitors: monitors(damage),
      magic: {
        counterSpellPool: {
          value: 3, current: 0
        }
      },
    }, {
      conditionMonitors: monitors(damage),
      magic: {
        counterSpellPool: {
          value: 3, current: 0
        }
      },
      specialProperties: {
      },
    })
    const fire = {
      id: 'fire', type: 'itemEffect', name: 'Feu',
      system: {
        type: 'fireDamage', value: 4, durationType: 'permanent'
      },
      update: vi.fn(async () => {}),
    }
    const actor = fakeActor(build(0), {
      items: [fire]
    })
    // The damage update rebuilds actor.system, as Foundry does after every update
    actor.takeDamage = vi.fn(async () => {
      actor.system = build(4)
    })
    vi.spyOn(SR5Combat, 'getActorFromCombatant').mockReturnValue(actor)
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
      damage: {
      }
    })

    await SR5Combat.manageTurnEnd({
      name: 'Test'
    })

    expect(actor.takeDamage).toHaveBeenCalled()
    for (const [changes] of actor.update.mock.calls) {
      expect(changes.system).toBeUndefined()
    }
    expect(actor.update).toHaveBeenCalledWith({
      "system.magic.counterSpellPool.current": 3
    })
  })
})

// Body: natural 3, augmented to 5 by cyberware. The source keeps the default 0 for the augmented value
function drugActor(){
  const attributes = (augmented) => ({
    body: {
      natural: {
        value: 3
      }, augmented: {
        value: augmented
      }
    }
  })
  const drug = {
    _id: 'd1', id: 'd1', name: 'Bliss', type: 'itemDrug',
    system: {
      isActive: false, wirelessTurnedOn: false, interact: false, quantity: 2, speed: 1,
      systemEffects: {
        0: {
          category: 'drug', value: 'bliss'
        }
      },
      addiction: {
        rating: 5, threshold: 3
      },
      onUse: {
        duration: '', contrecoup: ''
      },
      handleShot: {
      },
    },
  }
  return fakeActor(new FakeSystem({
    attributes: attributes(0), essence: {
      value: 0
    }, addictions: []
  }, {
    attributes: attributes(5), essence: {
      value: 4.5
    }, addictions: []
  }), {
    items: [drug]
  })
}

describe('drug durations read the augmented Body (SR5 p. 411-413)', () => {
  it('lasts (6 - augmented Body) hours for Bliss, not 6 hours', async () => {
    const actor = drugActor()
    const sheet = Object.create(ActorSheetSR5.prototype)
    Object.defineProperty(sheet, 'actor', {
      value: actor
    })

    await sheet._onEditItemValue({
      currentTarget: {
        closest: () => ({
          dataset: {
            itemId: 'd1'
          }
        }),
        dataset: {
          binding: 'system.isActive', dtype: 'Boolean'
        },
      },
      target: {
        value: ''
      },
    })

    const items = actor.update.mock.calls.at(-1)[0].items
    const bliss = items.find(i => i._id === 'd1')
    expect(bliss.system.handleShot.duration).toBe(1)
  })
})

describe('clearing physical boxes clears the overflow (SR5 p. 171, p. 209)', () => {
  // physical: boxes filled in the source; the preparation shows no overflow below a full monitor
  // (utilityActor, case "overflow"), while the source may still hold it: a ghost overflow
  function sheetWithDamagedActor(physical = 10){
    const monitors = (physicalMax, overflow) => ({
      physical: {
        value: physicalMax, actual: {
          base: physical, value: physical, modifiers: []
        }
      },
      overflow: {
        value: 4, actual: {
          base: overflow, value: overflow, modifiers: []
        }
      },
    })
    const actor = fakeActor(new FakeSystem({
      conditionMonitors: monitors(0, 2)
    }, {
      conditionMonitors: monitors(10, physical < 10 ? 0 : 2)
    }))
    actor.toJSON = () => ({
      system: actor.system.toJSON()
    })

    let onBoxClick, onMonitorReset
    const element = {
      classList: {
        toggle(){}
      },
      querySelector: () => null,
      querySelectorAll: (sel) => {
        if (sel === '.boxes:not(.box-disabled)') return [{
          addEventListener: (evt, fn) => {
            if (evt === 'click') onBoxClick = fn
          }
        }]
        if (sel === '.monitorReset') return [{
          addEventListener: (evt, fn) => {
            if (evt === 'mousedown') onMonitorReset = fn
          }
        }]
        return []
      },
    }
    // The select menus close on a click anywhere in the page
    globalThis.document ??= {
      addEventListener(){}, querySelectorAll: () => []
    }
    const sheet = Object.create(ActorSheetSR5.prototype)
    for (const [key, value] of Object.entries({
      actor, element, isEditable: true, isEditMode: false, isPlayMode: true, tabGroups: {
      },
      _updateScrollFades(){}
    })) Object.defineProperty(sheet, key, {
      value
    })
    sheet._onRender({
    }, {
    })
    return {
      actor,
      reset: (monitor) => onMonitorReset({
        preventDefault(){}, which: 3, button: 2, currentTarget: {
          dataset: {
            target: monitor
          }
        }
      }),
      click: (index, monitor = 'physical') => onBoxClick({
        currentTarget: {
          dataset: {
            index: String(index)
          },
          closest: () => ({
            dataset: {
              target: `system.conditionMonitors.${monitor}.actual.base`
            }
          }),
        }
      })
    }
  }

  it('empties the overflow once the physical monitor is no longer full', () => {
    const {
      actor, click
    } = sheetWithDamagedActor()
    click(7)
    const changes = actor.update.mock.calls[0][0]
    expect(changes.system.conditionMonitors.physical.actual.base).toBe(8)
    expect(changes.system.conditionMonitors.overflow.actual.base).toBe(0)
  })

  it('leaves the overflow alone when another monitor is clicked', () => {
    const {
      actor, click
    } = sheetWithDamagedActor()
    click(0, 'overflow')
    const changes = actor.update.mock.calls[0][0]
    expect(changes.system.conditionMonitors.overflow.actual.base).toBe(1)
    expect(changes.system.conditionMonitors.physical.actual.base).toBe(10)
  })

  it('clears a ghost overflow left in the source below a full monitor', () => {
    const {
      actor, click
    } = sheetWithDamagedActor(5)
    click(5)
    const changes = actor.update.mock.calls[0][0]
    expect(changes.system.conditionMonitors.physical.actual.base).toBe(6)
    expect(changes.system.conditionMonitors.overflow.actual.base).toBe(0)
  })

  it('empties the overflow too when the physical monitor is reset by right-click', () => {
    const {
      actor, reset
    } = sheetWithDamagedActor()
    reset('physical')
    const changes = actor.update.mock.calls[0][0]
    expect(changes.system.conditionMonitors.physical.actual.base).toBe(0)
    expect(changes.system.conditionMonitors.overflow.actual.base).toBe(0)
  })

  it('leaves the overflow alone when the stun monitor is reset', () => {
    const {
      actor, reset
    } = sheetWithDamagedActor()
    reset('stun')
    const changes = actor.update.mock.calls[0][0]
    expect(changes.system.conditionMonitors.overflow.actual.base).toBe(2)
  })
})
