import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// N72: an area spell resisted totally gets its effect "at 0" on the resistor, only to mark it as having
// resisted inside the template. A fixed-value effect (value 2) kept its value: the spell applied anyway.

let created
beforeEach(() => {
  created = []
  globalThis.ui = {
    notifications: {
      warn: () => {}, info: () => {}
    }
  }
  globalThis.game.user = {
    isGM: true
  }
  globalThis.game.scenes = [{
    templates: [{
      flags: {
        sr5: {
          itemHasEffect: true, itemUuid: "Actor.m.Item.spell", messageId: "cast1"
        }
      }
    }]
  }]
  globalThis.game.messages = new Map()
  const actor = {
    items: [],
    createEmbeddedDocuments: vi.fn(async (t, docs) => {
      created.push(...docs)
      for (const d of docs) actor.items.push({
        uuid: "x", system: {
          ownerItem: d["system.ownerItem"]
        }
      })
    })
  }
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => actor)
  vi.spyOn(SR5_EntityHelpers, "getLabelByKey").mockImplementation(k => k)
  vi.spyOn(SR5_ActorHelper, "linkEffectToSource").mockImplementation(async () => {})
  globalThis.fromUuid = async () => ({
    name: "Sort", type: "itemSpell", system: {
      targetOfEffect: {
      },
      customEffects: {
        a: {
          transfer: true, type: "value", value: 2, category: "itemsProperties", target: "system.itemsProperties.armor"
        },
        b: {
          transfer: true, type: "hits", category: "itemsProperties", target: "system.itemsProperties.armor"
        }
      }
    }
  })
})

const card = netHits => ({
  test: {
    type: "spellResistance"
  },
  previousMessage: {
    messageId: "cast1", itemUuid: "Actor.m.Item.spell"
  },
  magic: {
    spell: {
      area: 3
    }
  },
  owner: {
    actorId: "m", itemUuid: "Actor.m.Item.spell"
  },
  roll: {
    hits: 3, netHits
  },
})

describe("marker of an area spell resisted totally", () => {
  it("carries no value", async () => {
    await SR5_ActorHelper.applyExternalEffect("r", card(0), "customEffects")
    expect(created.length).toBe(2)
    for (const d of created) {
      expect(d["system.value"]).toBe(0)
      expect(d["system.customEffects"]["0"].value).toBe(0)
    }
  })

  it("a spell not resisted totally keeps its value", async () => {
    await SR5_ActorHelper.applyExternalEffect("r", card(1), "customEffects")
    expect(created[0]["system.value"]).toBe(2)
  })
})
