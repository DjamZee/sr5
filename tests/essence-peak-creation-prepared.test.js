import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"

// Relecture 70 (Clovis, Élise): the creation ends on a character the active GM prepares again at once, without its
// flag. Read on that prepared data, an implant's cost is already max(cost, peak): a peak an earlier stay in play left
// survived the end of creation. The peak must start from the creation cost, the one the implant took in creation.

const {
  registerImplantRegisterHooks, IMPLANT_REGISTER, PEAK_COST
} = await import("../modules/system/implant-register.js")
const {
  SR5Actor
} = await import("../modules/entities/actors/entityActor.js")
const {
  SR5_UtilityItem
} = await import("../modules/entities/items/utilityItem.js")

const saved = {
  users: globalThis.game.users, settings: globalThis.game.settings, Hooks: globalThis.Hooks
}
const hooks = {
}
let store
beforeEach(() => {
  globalThis.Hooks = {
    on: (name, fn) => (hooks[name] = fn), once: () => {
    }, call: () => true, callAll: () => true
  }
  registerImplantRegisterHooks()
  store = {
    [IMPLANT_REGISTER]: {
    }, sr5ShopCreationMode: false
  }
  Object.assign(globalThis.game, {
    users: {
      activeGM: {
        isSelf: true
      }, get: () => ({
        isGM: true
      }), some: () => false
    },
    settings: {
      get: (_scope, key) => store[key],
      set: async (_scope, key, value) => (store[key] = value),
    },
  })
  // The grade and the body's effects are not under test: the implant costs its base
  vi.spyOn(SR5_UtilityItem, "_handleAugmentation").mockImplementation(data => {
    data.essenceCost.value = data.essenceCost.base
  })
})
afterEach(() => {
  Object.assign(globalThis.game, saved)
  globalThis.Hooks = saved.Hooks
  vi.restoreAllMocks()
})

function preparedCharacter(base) {
  const actor = Object.create(SR5Actor.prototype)
  const flags = {
    sr5: {
      creation: {
        active: true, by: "gm"
      }
    }
  }
  const eyes = {
    documentName: "Item", type: "itemAugmentation", id: "eyes", uuid: "Actor.pc.Item.eyes", name: "eyes",
    prepareData: () => {
    },
    system: {
      type: "cyberware", grade: "standard", isActive: false, isAccessory: false, reversibleEssence: false,
      wirelessTurnedOn: false, isSlavedToPan: true, customEffects: {
      }, essenceCost: {
        base, multiplier: "", value: base, modifiers: []
      }
    },
  }
  const define = (key, value) => Object.defineProperty(actor, key, {
    value, configurable: true
  })
  define("type", "actorPc")
  define("documentName", "Actor")
  define("uuid", "Actor.pc")
  define("items", [eyes])
  define("flags", flags)
  define("system", {
    essence: {
      base: 6, value: 6, modifiers: []
    }, matrix: {
    }
  })
  eyes.parent = actor
  const prepare = () => {
    eyes.system.essenceCost.value = eyes.system.essenceCost.base
    try {
      actor.prepareEmbeddedDocuments()
    } catch {
      // What follows the items loop reads a full sheet: only the implants are under test here
    }
  }
  define("reset", prepare)
  return {
    actor, eyes, prepare
  }
}

describe("the end of creation on a prepared character", () => {
  it("starts the peak from the creation cost, not from a peak an earlier stay in play left", async () => {
    // Played (peak 1.0), put back in creation, its implant halved by a module (0.5)
    store[IMPLANT_REGISTER]["Actor.pc.Item.eyes"] = {
      [PEAK_COST]: 1
    }
    const {
      actor, eyes, prepare
    } = preparedCharacter(0.5)
    prepare()
    expect(eyes.system.essenceCost.value).toBe(0.5)
    // The gamemaster ends the creation: every client prepares the character again without its flag, then the hook
    delete actor.flags.sr5.creation
    prepare()
    await hooks.updateActor(actor, {
      flags: {
        sr5: {
          "-=creation": null
        }
      }
    }, {
    }, "gm")
    expect(store[IMPLANT_REGISTER]["Actor.pc.Item.eyes"][PEAK_COST]).toBe(0.5)
    // The peaks arrived: the character is prepared again with them, and takes 0.5, not the old 1.0
    Object.defineProperty(actor, "reset", {
      value: prepare, configurable: true
    })
    await hooks.updateSetting({
      key: `sr5.${IMPLANT_REGISTER}`
    })
    expect(eyes.system.essenceCost.value).toBe(0.5)
  })

  it("keeps the peak at its creation cost when nothing older is left", async () => {
    const {
      actor, prepare
    } = preparedCharacter(0.4)
    prepare()
    delete actor.flags.sr5.creation
    prepare()
    await hooks.updateActor(actor, {
      flags: {
        sr5: {
          "-=creation": null
        }
      }
    }, {
    }, "gm")
    expect(store[IMPLANT_REGISTER]["Actor.pc.Item.eyes"][PEAK_COST]).toBe(0.4)
  })

  it("does not queue a character whose register already holds its peaks (nothing is written)", async () => {
    // Characters an earlier test left waiting are prepared again first
    await hooks.updateSetting({
      key: `sr5.${IMPLANT_REGISTER}`
    })
    store[IMPLANT_REGISTER]["Actor.pc.Item.eyes"] = {
      [PEAK_COST]: 0.5
    }
    const {
      actor, eyes, prepare
    } = preparedCharacter(0.5)
    const reset = vi.fn(prepare)
    Object.defineProperty(actor, "reset", {
      value: reset, configurable: true
    })
    delete actor.flags.sr5.creation
    prepare()
    const before = store[IMPLANT_REGISTER]
    await hooks.updateActor(actor, {
      flags: {
        sr5: {
          "-=creation": null
        }
      }
    }, {
    }, "gm")
    expect(store[IMPLANT_REGISTER]).toBe(before)
    expect(eyes.system.essenceCost.value).toBe(0.5)
    // A later write of the register, for anything else, finds no character left waiting
    await hooks.updateSetting({
      key: `sr5.${IMPLANT_REGISTER}`
    })
    expect(reset).not.toHaveBeenCalled()
  })
})
