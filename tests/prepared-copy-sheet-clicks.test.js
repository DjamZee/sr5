import {
  describe, it, expect, vi, afterEach
} from 'vitest'
import fs from 'node:fs'

// A prepared copy (toObject(false)) written back whole puts every computed value in the source, and the next
// preparation adds its modifiers again. These are the sheet clicks and the action refund that still did it, after
// the healing and acid sites (prepared-copy-not-written.test.js).

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
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'
import {
  SR5Combat
} from '../modules/system/srcombat.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

// A document whose prepared data differs from its source, as Foundry's toObject(source = true) gives them
function doc(source, prepared, extra = {
}){
  const d = {
    ...extra,
    system: structuredClone(prepared),
    toObject: (fromSource = true) => ({
      _id: extra.id, system: structuredClone(fromSource ? source : prepared)
    }),
    toJSON: () => ({
      _id: extra.id, system: structuredClone(source)
    }),
    update: vi.fn(async () => {}),
    updateEmbeddedDocuments: vi.fn(async () => {}),
  }
  // As a TypeDataModel: duplicate(x.system) goes through toJSON and gives the source
  Object.defineProperty(d.system, 'toJSON', {
    value: () => structuredClone(source)
  })
  return d
}

function sheetFor(actor){
  const sheet = Object.create(ActorSheetSR5.prototype)
  Object.defineProperty(sheet, 'actor', {
    get: () => actor
  })
  return sheet
}

function clickEvent(binding, {
  itemId, button = 2, dtype
} = {
}){
  const currentTarget = {
    dataset: {
      binding, dtype
    },
    closest: () => itemId ? {
      dataset: {
        itemId
      }
    } : null,
  }
  return {
    currentTarget, button, target: {
      value: undefined
    }, shiftKey: false, ctrlKey: false
  }
}

// What the preparation adds on top of the source: an armor modifier and a resistance pool built from it
const sourceSystem = {
  magic: {
    reagents: 3
  },
  resistances: {
    physicalDamage: {
      base: 0, dicePool: 0, modifiers: []
    }
  },
  matrix: {
    actions: {
      hackOnTheFly: {
        specialization: false
      }
    }
  },
}
const preparedSystem = {
  magic: {
    reagents: 3
  },
  resistances: {
    physicalDamage: {
      base: 0, dicePool: 7, modifiers: [{
        source: "linkedAttribute", value: 4
      }, {
        source: "armor", value: 3
      }]
    }
  },
  matrix: {
    actions: {
      hackOnTheFly: {
        specialization: false
      }
    }
  },
}

afterEach(() => vi.restoreAllMocks())

describe('a click on the sheet writes the clicked path only', () => {
  it('a reagent clicked on the actor does not write its prepared resistances', () => {
    const actor = doc(sourceSystem, preparedSystem)
    actor.items = {
      get: () => null
    }
    sheetFor(actor)._onChangeValueByClick(clickEvent("system.magic.reagents"))
    expect(actor.update).toHaveBeenCalledWith({
      "system.magic.reagents": 4
    })
  })

  it('the rating clicked on an item does not write its prepared price', () => {
    const item = doc({
      itemRating: 2, price: {
        base: 100, value: 100, modifiers: []
      }
    }, {
      itemRating: 2, price: {
        base: 100, value: 300, modifiers: [{
          source: "rating", value: 200
        }]
      }
    }, {
      id: "item1"
    })
    const actor = doc(sourceSystem, preparedSystem)
    actor.items = {
      get: (id) => id === "item1" ? item : null
    }
    sheetFor(actor)._onChangeValueByClick(clickEvent("system.itemRating", {
      itemId: "item1", button: 0
    }))
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{
      _id: "item1", "system.itemRating": 1
    }])
  })

  it('sharing raised at the device rating takes one from noise reduction, and writes those two paths only', () => {
    const matrix = {
      deviceRating: 3, attributes: {
        sharing: {
          base: 1
        }, noiseReduction: {
          base: 2
        }
      }
    }
    const actor = doc({
      ...sourceSystem, matrix
    }, {
      ...preparedSystem, matrix
    })
    actor.items = {
      get: () => null
    }
    sheetFor(actor)._onChangeValueByClick(clickEvent("system.matrix.attributes.sharing.base"))
    expect(actor.update).toHaveBeenCalledWith({
      "system.matrix.attributes.noiseReduction.base": 1,
      "system.matrix.attributes.sharing.base": 2,
    })
  })

  it('a matrix specialization toggled writes that boolean only', () => {
    const actor = doc(sourceSystem, preparedSystem)
    sheetFor(actor)._onEditActorValue(clickEvent("system.matrix.actions.hackOnTheFly.specialization", {
      dtype: "Boolean"
    }))
    expect(actor.update).toHaveBeenCalledWith({
      "system.matrix.actions.hackOnTheFly.specialization": true
    })
  })
})

// The accessory put on an item is a copy kept in the item's source: its prepared copy carried the computed price,
// dice pools and monitors of the accessory into the host's source, which the sheet then shows and saves as stored
describe('an accessory attached from the item sheet', () => {
  it('is copied from its source, not from its prepared data', () => {
    const ITEM_SHEET = fs.readFileSync('modules/entities/items/itemSheet.js', 'utf8')
    const attach = ITEM_SHEET.match(/let aItem = this\.actor\.items\.find\(i => i\.id === accessory\)[\s\S]{0,400}?let accObj = aItem\.toObject\(([^)]*)\)/)
    expect(attach).not.toBeNull()
    expect(attach[1]).toBe("")
  })

  it('the drone wireless switch writes its action counters only', () => {
    const DRONE_SHEET = fs.readFileSync('modules/entities/actors/droneSheet.js', 'utf8')
    expect(DRONE_SHEET).not.toMatch(/"system\.specialProperties\.actions":/)
    expect(DRONE_SHEET).toContain('updates["system.specialProperties.actions.simple.current"] = actionsLeft.simple.current')
  })
})

// SR5 p. 164: a refund never gives more than the pass grants. The pass grants the prepared count (base and the
// item effects that add actions), which the source copy does not carry: its stored value is the default
describe('an action refunded in combat', () => {
  function fighter(){
    const counters = (simple) => ({
      free: {
        base: 1, value: 1, current: 1, modifiers: []
      },
      simple: {
        base: 2, value: simple, current: 2, modifiers: simple > 2 ? [{
          source: "itemEffect", value: simple - 2
        }] : []
      },
      complex: {
        base: 1, value: 1, current: 1, modifiers: []
      },
    })
    const source = {
      specialProperties: {
        actions: counters(2)
      }
    }
    const prepared = {
      specialProperties: {
        actions: counters(3)
      }
    }
    const actor = doc(source, prepared)
    actor.items = []
    actor.name = "Fighter"
    actor.resetRecoil = vi.fn(async () => {})
    return {
      actor, source, prepared
    }
  }

  it('gets back to what the prepared pass grants, not to the stored default', async () => {
    const {
      actor
    } = fighter()
    // An action already spent: two simple actions of three left (current is 2 in both copies)
    const combatant = {
      update: vi.fn(async () => {})
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    vi.spyOn(SR5Combat, 'getCombatantFromActor').mockReturnValue(combatant)
    globalThis.ui = {
      notifications: {
        info(){}, warn(){}
      }
    }
    await SR5Combat.changeActionInCombat("a1", [{
      type: "simple", value: -1, source: "changeChokeSettings"
    }])
    expect(combatant.update).toHaveBeenCalledWith(expect.objectContaining({
      "flags.sr5.actions.simple": 3
    }))
    const written = actor.update.mock.calls[0][0]
    expect(written["system.specialProperties.actions.simple.current"]).toBe(3)
    // Only the counters are written, never the prepared value or its modifiers
    expect(written.system).toBeUndefined()
    expect(Object.keys(written).every(k => k.endsWith(".current"))).toBe(true)
  })
})
