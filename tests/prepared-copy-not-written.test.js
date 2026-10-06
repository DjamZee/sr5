import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// A prepared copy (toObject(false)) written back whole puts every computed value in the source, and the next
// preparation adds its modifiers again: measured in game on a843cc549, the fatigue resistance of a character went
// 7, then 14, then 21 after two first aid tests. Only the changed paths are written, read from the source.

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
  globalThis.foundry.abstract.TypeDataModel.migrateData ??= (source) => source
  class Field {
    constructor(options) {
      this.options = options
    }
    _cast(value) {
      return value
    }
  }
  class SchemaField extends Field {
    constructor(fields, options) {
      super(options)
      this.fields = fields
    }
  }
  globalThis.foundry.data = {
    fields: new Proxy({
      SchemaField
    }, {
      get: (target, name) => target[name] ?? Field
    })
  }
})

import {
  SR5Combat
} from '../modules/system/srcombat.js'
import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'
import {
  SR5_PrepareRollTest
} from '../modules/rolls/roll-prepare.js'

function collection(docs){
  const list = [...docs]
  list.get = (id) => list.find(d => d.id === id)
  return list
}

// A document whose prepared data differs from its source, as Foundry's toObject(source = true) gives them
function doc(source, prepared, extra = {
}){
  return Object.assign({
  }, {
    ...extra,
    system: structuredClone(prepared),
    _source: {
      system: structuredClone(source)
    },
    toObject: (fromSource = true) => ({
      _id: extra.id, type: extra.type, system: structuredClone(fromSource ? source : prepared)
    }),
  })
}

// What the preparation adds on top of the source: a modifier that is not reset before being pushed again
const linked = {
  source: "Body", type: "linkedAttribute", value: 4
}

function patient(boxes){
  const source = {
    conditionMonitors: {
      physical: {
        value: 10, aggravated: 0, actual: {
          base: boxes, value: 0, modifiers: []
        }
      }
    },
    resistances: {
      fatigue: {
        value: 0, modifiers: []
      }
    },
  }
  const prepared = structuredClone(source)
  prepared.conditionMonitors.physical.actual.value = boxes
  prepared.resistances.fatigue.modifiers.push(linked)
  prepared.resistances.fatigue.value = 4
  return Object.assign(doc(source, prepared, {
    id: "p", name: "Patient"
  }), {
    update: vi.fn(async () => {}),
  })
}

// Nothing of the prepared resistances, and no whole system, may reach the update
function expectOnlyMonitor(update){
  expect(update).not.toHaveProperty("system")
  expect(JSON.stringify(update)).not.toContain("linkedAttribute")
  for (let key of Object.keys(update)) expect(key.startsWith("system.conditionMonitors.physical.")).toBe(true)
}

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("heal writes the monitor only", () => {
  it("first aid, 1 hit: 5 boxes become 4, the prepared resistances stay out of the source", async () => {
    const p = patient(5)
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(p)
    vi.spyOn(SR5_ActorHelper, "clearDamageKnockout").mockResolvedValue()
    // Foundry's deepClone hands a class instance back as is (common/utils/helpers.mjs); the test setup's does not
    vi.spyOn(foundry.utils, "deepClone").mockImplementation(o => o)
    await SR5_ActorHelper.heal("p", {
      roll: {
        netHits: 1
      }, test: {
        typeSub: "physical", type: "firstAid"
      }
    })
    const update = p.update.mock.calls[0][0]
    expectOnlyMonitor(update)
    expect(update["system.conditionMonitors.physical.actual.base"]).toBe(4)
  })
})

describe("a healing spell (removeDamage) writes the monitor only", () => {
  beforeEach(() => {
    globalThis.game = {
      ...globalThis.game, messages: {
        get: () => ({
          author: {
            isGM: true
          }
        })
      }
    }
    globalThis.fromUuid = async () => ({
      system: {
        customEffects: {
          0: {
            target: "physical.removeDamage", type: "hits", multiplier: 1, transfer: true
          }
        }
      }
    })
  })

  it("6 boxes, 2 hits: 4, and nothing else written", async () => {
    const p = patient(6)
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(p)
    await SR5_ActorHelper.applyExternalEffect("p", {
      owner: {
        itemUuid: "Item.soins", messageId: "m1"
      }, roll: {
        hits: 2, netHits: 0
      }, magic: {
      }, test: {
      },
    }, "customEffects")
    expect(p.update).toHaveBeenCalledTimes(1)
    const update = p.update.mock.calls[0][0]
    expectOnlyMonitor(update)
    expect(update["system.conditionMonitors.physical.actual.base"]).toBe(4)
  })
})

// An armor whose preparation computed its price, and received the effect of another item
function armor(effects = []){
  const source = {
    isActive: true, isAccessory: false, price: {
      base: 1000, value: 0
    }, itemEffects: effects
  }
  const prepared = structuredClone(source)
  prepared.price.value = 1000
  prepared.itemEffects.push({
    name: "injected", target: "system.armorValue", type: "value", value: 1, multiplier: 1
  })
  return doc(source, prepared, {
    id: "armor", type: "itemArmor", name: "Veste"
  })
}

function expectOnlyEffects(written, expected){
  expect(written).toEqual({
    _id: "armor", "system.itemEffects": expected
  })
}

describe("acid writes the armor effects only, from the source", () => {
  it("first hit: the acid effect is added to the stored effects", async () => {
    const a = armor()
    const actor = {
      id: "a1", name: "Test", items: collection([a]),
      updateEmbeddedDocuments: vi.fn(async () => {}),
      createEmbeddedDocuments: vi.fn(async () => {}),
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
    vi.spyOn(SR5Combat, "changeInitInCombatHelper").mockResolvedValue()
    await SR5_ActorHelper.acidDamageEffect("a1", 4, "weapon").catch(() => {})
    const written = actor.updateEmbeddedDocuments.mock.calls[0][1][0]
    expect(written["system.itemEffects"].map(e => e.value)).toEqual([-1])
    expect(written["system.itemEffects"][0].target).toBe("system.armorValue")
    expect(Object.keys(written).sort()).toEqual(["_id", "system.itemEffects"])
  })

  it("end of a Combat Turn: the stored acid effect goes to -2, nothing else", async () => {
    const acid = {
      id: "acid", type: "itemEffect", name: "acid", system: {
        type: "acidDamage", value: "6", durationType: "special", duration: 0
      }, update: vi.fn(async () => {}),
    }
    const a = armor([{
      name: "acid", target: "system.armorValue", type: "value", value: -1, multiplier: 1
    }])
    const actor = {
      id: "a1", name: "Test", isToken: false, effects: [], items: collection([acid, a]),
      system: {
        conditionMonitors: {
        }, specialProperties: {
        }
      },
      update: vi.fn(async () => {}), rollTest: vi.fn(), updateEmbeddedDocuments: vi.fn(async () => {}),
    }
    vi.spyOn(SR5Combat, "getActorFromCombatant").mockReturnValue(actor)
    vi.spyOn(SR5_PrepareRollTest, "getBaseRollData").mockImplementation(() => ({
      damage: {
      }
    }))
    await SR5Combat.manageTurnEnd({
      name: "Test"
    })
    expectOnlyEffects(actor.updateEmbeddedDocuments.mock.calls[0][1][0], [{
      name: "acid", target: "system.armorValue", type: "value", value: -2, multiplier: 1
    }])
  })
})

describe("electricity extends the stored duration only", () => {
  it("2 rounds stored, 5 prepared: 3 written, nothing else", async () => {
    const effect = doc({
      type: "electricityDamage", duration: 2, value: "-1"
    }, {
      type: "electricityDamage", duration: 5, value: "-1", computed: true
    }, {
      id: "elec", type: "itemEffect", name: "Électricité"
    })
    const actor = {
      id: "a1", name: "Test", items: collection([effect]), updateEmbeddedDocuments: vi.fn(async () => {}),
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
    await SR5_ActorHelper.electricityDamageEffect("a1")
    expect(actor.updateEmbeddedDocuments.mock.calls[0][1]).toEqual([{
      _id: "elec", "system.duration": 3
    }])
  })
})

describe("regeneration writes the monitors only", () => {
  function regenerating(type, monitors){
    const source = {
      conditionMonitors: structuredClone(monitors), resistances: {
        fatigue: {
          value: 0, modifiers: []
        }
      }
    }
    const prepared = structuredClone(source)
    for (let m of Object.values(prepared.conditionMonitors)) m.actual.value = m.actual.base
    prepared.resistances.fatigue.modifiers.push(linked)
    return Object.assign(doc(source, prepared, {
      id: "r", name: "Troll", type
    }), {
      update: vi.fn(async () => {}),
    })
  }
  const monitor = (boxes, extra = {
  }) => ({
    value: 10, ...extra, actual: {
      base: boxes, value: 0, modifiers: []
    }
  })

  beforeEach(() => {
    vi.spyOn(SR5_ActorHelper, "clearDamageKnockout").mockResolvedValue()
    vi.spyOn(foundry.utils, "deepClone").mockImplementation(o => o)
  })

  it("a character, 3 net hits on 2 Physical and 4 Stun: 0 and 3, nothing of the prepared resistances", async () => {
    const r = regenerating("actorPc", {
      overflow: monitor(0), physical: monitor(2, {
        aggravated: 0
      }), stun: monitor(4)
    })
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(r)
    await SR5_ActorHelper.regenerate("r", {
      roll: {
        netHits: 3
      }
    })
    const update = r.update.mock.calls[0][0]
    expect(update).not.toHaveProperty("system")
    expect(JSON.stringify(update)).not.toContain("linkedAttribute")
    expect(update["system.conditionMonitors.physical.actual.base"]).toBe(0)
    expect(update["system.conditionMonitors.stun.actual.base"]).toBe(3)
    for (let key of Object.keys(update)) expect(key.startsWith("system.conditionMonitors.")).toBe(true)
  })

  it("a grunt heals its condition monitor, nothing else written", async () => {
    const r = regenerating("actorGrunt", {
      condition: monitor(5, {
        aggravated: 0
      })
    })
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(r)
    await SR5_ActorHelper.regenerate("r", {
      roll: {
        netHits: 2
      }
    })
    expect(r.update.mock.calls[0][0]).toEqual({
      "system.conditionMonitors.condition.actual.base": 3, "system.conditionMonitors.condition.aggravated": 0
    })
  })
})

describe("an effect put on a device (Redundancy) writes the device effects only", () => {
  it("adds the effect to the stored effects, never the prepared device", async () => {
    const source = {
      isActive: true, price: {
        base: 5000, value: 0
      }, itemEffects: []
    }
    const prepared = structuredClone(source)
    prepared.price.value = 5000
    prepared.itemEffects.push({
      name: "injected", target: "system.matrix.attributes.firewall", type: "value", value: 1
    })
    const device = doc(source, prepared, {
      id: "deck", type: "itemDevice", name: "Deck"
    })
    const items = collection([device])
    const actor = {
      id: "a1", name: "Test", isToken: false, items,
      createEmbeddedDocuments: vi.fn(async (_, [data]) => {
        items.push({
          id: "fx", uuid: "Item.fx", system: {
            ownerItem: data["system.ownerItem"]
          }
        })
      }),
      updateEmbeddedDocuments: vi.fn(async () => {}),
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
    vi.spyOn(SR5_EntityHelpers, "getLabelByKey").mockReturnValue("Moniteur matriciel")
    vi.spyOn(SR5_ActorHelper, "linkEffectToSource").mockResolvedValue()
    globalThis.game = {
      ...globalThis.game, user: {
        isGM: true
      }
    }
    globalThis.fromUuid = async () => ({
      name: "Redondance", type: "itemComplexForm", system: {
        targetOfEffect: {
        }, itemEffects: {
          0: {
            name: "red", transfer: true, target: "system.conditionMonitors.matrix", type: "value", value: 1, multiplier: 1
          }
        }
      }
    })
    await SR5_ActorHelper.applyExternalEffect("a1", {
      owner: {
        itemUuid: "Item.red", actorId: "a1", messageId: "m1"
      }, roll: {
        hits: 2, netHits: 0
      }, magic: {
      }, test: {
        typeSub: "redundancy"
      },
    }, "itemEffects")
    const written = actor.updateEmbeddedDocuments.mock.calls[0][1]
    expect(written).toHaveLength(1)
    expect(Object.keys(written[0]).sort()).toEqual(["_id", "system.itemEffects"])
    expect(written[0]._id).toBe("deck")
    expect(written[0]["system.itemEffects"]).toEqual([expect.objectContaining({
      target: "system.conditionMonitors.matrix", value: 1, ownerItem: "Item.red"
    })])
  })
})

describe("sourceItemEffects", () => {
  it("reads the stored effects, never the prepared ones, and lists an older object as an array", () => {
    expect(SR5_ActorHelper.sourceItemEffects(armor())).toEqual([])
    const old = doc({
      itemEffects: {
        0: {
          value: 1
        }
      }
    }, {
      itemEffects: [{
        value: 1
      }, {
        value: 9
      }]
    })
    expect(SR5_ActorHelper.sourceItemEffects(old)).toEqual([{
      value: 1
    }])
  })
})
