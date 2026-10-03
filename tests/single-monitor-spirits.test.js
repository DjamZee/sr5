import {
  describe, it, expect, vi, beforeAll, afterEach
} from "vitest"

// SR5 p. 301: watchers and homunculi have a single condition monitor, like grunts (p. 381).
// The actorSpirit schema only stored Physical and Stun, so the condition monitor existed in the
// prepared data only: toObject(false) dropped it, and damage or healing read or wrote nothing.

// Recording stand-ins for Foundry's data fields: a SchemaField keeps its children under `fields`
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  class Field {
    constructor(options) {
      this.options = options
    }
  }
  class SchemaField extends Field {
    constructor(fields, options) {
      super(options)
      this.fields = fields
    }
  }
  class ArrayField extends Field {
    constructor(element, options) {
      super(options)
      this.element = element
    }
  }
  globalThis.foundry ??= {
  }
  globalThis.foundry.data = {
    fields: new Proxy({
      SchemaField, ArrayField
    }, {
      get: (target, name) => target[name] ?? Field
    })
  }
})

import {
  sr5ActorSpiritDataModel
} from "../modules/datamodels/actors/actorSpirit.js"
import {
  SR5_SpiritTypes
} from "../modules/entities/items/spirit-types.js"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
  globalThis.game.actors ??= {
    get: () => undefined
  }
})

afterEach(() => {
  SR5_SpiritTypes.registry.clear()
})

function monitor(max = 0, damage = 0) {
  return {
    value: max, base: max, modifiers: [], actual: {
      value: damage, base: damage, modifiers: []
    }, boxes: []
  }
}

describe("actorSpirit schema", () => {
  const schema = sr5ActorSpiritDataModel.defineSchema()

  it("stores a single condition monitor next to Physical and Stun", () => {
    const monitors = schema.conditionMonitors.fields
    expect(Object.keys(monitors)).toEqual(expect.arrayContaining(["condition", "physical", "stun"]))
    expect(monitors.condition.fields.actual.fields).toHaveProperty("base")
  })

  it("has a status bar for that monitor", () => {
    expect(schema.statusBars.fields).toHaveProperty("condition")
  })
})

describe("which spirits have a single monitor (SR5 p. 301)", () => {
  it("watchers and homunculi do, other spirits do not", () => {
    expect(SR5_SpiritTypes.hasSingleMonitor("watcher")).toBe(true)
    expect(SR5_SpiritTypes.hasSingleMonitor("homunculus")).toBe(true)
    expect(SR5_SpiritTypes.hasSingleMonitor("air")).toBe(false)
    expect(SR5_SpiritTypes.hasSingleMonitor("")).toBe(false)
  })

  it("a custom type follows its own setting, then its base type", () => {
    const custom = (basedOn, conditionMonitor) => ({
      name: "Custom", system: {
        basedOn, conditionMonitor
      }
    })
    SR5_SpiritTypes.registry.set("singleFire", custom("fire", "single"))
    SR5_SpiritTypes.registry.set("standardWatcher", custom("watcher", "standard"))
    SR5_SpiritTypes.registry.set("watcherLike", custom("watcher", ""))
    expect(SR5_SpiritTypes.hasSingleMonitor("singleFire")).toBe(true)
    expect(SR5_SpiritTypes.hasSingleMonitor("standardWatcher")).toBe(false)
    expect(SR5_SpiritTypes.hasSingleMonitor("watcherLike")).toBe(true)
  })
})

// A spirit as its preparation sees it: every monitor of the schema, damage read from the source
function spirit(type, damage = {
}) {
  return {
    type: "actorSpirit",
    name: "Spirit",
    system: {
      type,
      attributes: {
        body: {
          augmented: {
            value: 4
          }
        },
        willpower: {
          augmented: {
            value: 6
          }
        },
      },
      specialAttributes: {
      },
      conditionMonitors: {
        condition: monitor(0, damage.condition ?? 0),
        physical: monitor(0, damage.physical ?? 0),
        stun: monitor(0, damage.stun ?? 0),
      },
      statusBars: {
        condition: {
          value: 0, max: 0
        },
        physical: {
          value: 0, max: 0
        },
        stun: {
          value: 0, max: 0
        },
      },
    },
  }
}

describe("spirit monitors at preparation", () => {
  it("a watcher keeps only its condition monitor, with the damage it has taken", () => {
    const watcher = spirit("watcher", {
      condition: 3
    })
    SR5_CharacterUtility.updateConditionMonitors(watcher)
    const monitors = watcher.system.conditionMonitors
    expect(Object.keys(monitors)).toEqual(["condition"])
    // Grunt monitor (SR5 p. 381): 8 + half the higher of Body and Willpower
    expect(monitors.condition.value).toBe(11)
    expect(monitors.condition.actual.value).toBe(3)
    expect(watcher.system.statusBars.condition).toEqual({
      value: 3, max: 11
    })
  })

  it("any other spirit keeps Physical and Stun and loses the condition monitor", () => {
    const air = spirit("air", {
      physical: 2, stun: 1
    })
    SR5_CharacterUtility.updateConditionMonitors(air)
    expect(Object.keys(air.system.conditionMonitors).sort()).toEqual(["physical", "stun"])
    expect(air.system.statusBars).not.toHaveProperty("condition")
    expect(air.system.conditionMonitors.physical.actual.value).toBe(2)
  })
})

// What Foundry's toObject(false) does: walk the schema, read the prepared value of each declared
// field, and skip what the schema does not declare or the preparation deleted
function schemaToObject(fields, value) {
  const out = {
  }
  for (const [name, field] of Object.entries(fields)) {
    if (value?.[name] === undefined) continue
    out[name] = field.fields ? schemaToObject(field.fields, value[name]) : JSON.parse(JSON.stringify(value[name]))
  }
  return out
}

// The real actor: prepared data on `system`, toObject(false) keeps only what the schema declares
function actorDocument(prepared) {
  const schema = sr5ActorSpiritDataModel.defineSchema()
  const actor = {
    id: "w1", type: "actorSpirit", name: "Watcher", effects: [],
    system: prepared,
    toObject: () => ({
      type: "actorSpirit", system: schemaToObject(schema, actor.system)
    }),
    update: vi.fn(async (data) => {
      if (data.system) actor.system = data.system
      for (const [path, value] of Object.entries(data)) {
        if (path.startsWith("system.")) foundry.utils.setProperty(actor.system, path.slice(7), value)
      }
    }),
  }
  return actor
}

function watcherPrepared(damage) {
  const watcher = spirit("watcher", {
    condition: damage
  })
  SR5_CharacterUtility.updateConditionMonitors(watcher)
  watcher.system.limits = {
    physicalLimit: {
      value: 4
    }
  }
  watcher.system.itemsProperties = {
    armor: {
      value: 0
    }
  }
  return watcher.system
}

describe("damage and healing on a watcher", () => {
  it("combat damage goes to the condition monitor", async () => {
    const actor = actorDocument(watcherPrepared(0))
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
    await SR5_ActorHelper.takeDamage("w1", {
      damage: {
        value: 3, type: "physical", matrix: {
          value: 0
        }, element: ""
      },
      combat: {
        ammo: {
        }
      },
    })
    expect(actor.update).toHaveBeenCalledWith({
      "system.conditionMonitors.condition.actual.base": 3
    })
    vi.restoreAllMocks()
  })

  it("first aid heals the condition monitor", async () => {
    const actor = actorDocument(watcherPrepared(4))
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
    // Foundry's deepClone returns a document untouched: only plain objects are cloned
    vi.spyOn(foundry.utils, "deepClone").mockImplementation((obj) => obj)
    await SR5_ActorHelper.heal("w1", {
      roll: {
        netHits: 2
      }, test: {
        typeSub: "condition"
      }
    })
    expect(actor.system.conditionMonitors.condition.actual.base).toBe(2)
    vi.restoreAllMocks()
  })
})

// The roll dialog checks "Patient Awakened or Emerged" (SR5 p. 208) from the target's attributes
describe("first aid dialog on a target without Magic or Resonance", () => {
  function openDialog(target) {
    const fields = {
    }
    const html = {
      querySelector: (sel) => (fields[sel] ??= {
        value: 0, checked: false, style: {
        }
      })
    }
    const dialogData = {
      owner: {
        actorId: "healer"
      },
      target: {
        actorId: "patient"
      },
      dicePool: {
        base: 6, modifiers: []
      },
      limit: {
        modifiers: {
        }
      },
      various: {
      },
    }
    const roll = new SR5_RollDialog({
      position: {
      }, setPosition: () => {}
    }, null, dialogData)
    roll.updateDicePoolValue = () => {}
    const actors = {
      healer: {
        effects: []
      }, patient: target
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation((id) => actors[id])
    const checkbox = {
      dataset: {
        modifier: "patientAwakenedOrEmerged", target: "dicePoolModPatientAwakenedOrEmerged"
      }
    }
    roll._filledCheckBox([checkbox], html, dialogData)
    vi.restoreAllMocks()
    return dialogData.dicePool.modifiers
  }

  it("a spirit without Resonance and no Magic does not break the dialog", () => {
    const watcher = {
      system: {
        specialAttributes: {
          magic: {
            augmented: {
              value: 0
            }
          }
        }
      }
    }
    expect(openDialog(watcher)).toEqual([])
  })

  it("an AI without Magic is still read for Resonance", () => {
    const ai = {
      system: {
        specialAttributes: {
          resonance: {
            augmented: {
              value: 0
            }
          }
        }
      }
    }
    expect(openDialog(ai)).toEqual([])
  })

  it("an awakened patient still gets the modifier", () => {
    const mage = {
      system: {
        specialAttributes: {
          magic: {
            augmented: {
              value: 3
            }
          }, resonance: {
            augmented: {
              value: 0
            }
          }
        }
      }
    }
    expect(openDialog(mage)).toEqual([expect.objectContaining({
      type: "patientAwakenedOrEmerged", value: -2
    })])
  })
})
