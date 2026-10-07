import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  registerImplantRegisterHooks, reconcileImplantRegister, essenceTaken, creationEnded, peaksAtCreationEnd,
  IMPLANT_REGISTER, PEAK_COST
} from "../modules/system/implant-register.js"

// Lot C0-bis of the character creator: buying an implant at creation is no surgery (SR5 p. 454, "après sa création"),
// so a character the gamemaster put "in creation" takes no Essence peak; the peak starts from the cost of now when the
// creation ends. Off creation, the peak is noted as before (SR5 p. 53).

const saved = {
  users: globalThis.game.users, settings: globalThis.game.settings, actors: globalThis.game.actors, Hooks: globalThis.Hooks
}
const hooks = {
}
let store
beforeEach(() => {
  globalThis.Hooks = {
    on: (name, fn) => (hooks[name] = fn), once: () => {
    }
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
})
afterEach(() => {
  Object.assign(globalThis.game, {
    users: saved.users, settings: saved.settings, actors: saved.actors
  })
  globalThis.Hooks = saved.Hooks
})

function character(creation) {
  return Object.assign(new Actor(), {
    documentName: "Actor", uuid: "Actor.pc", type: "actorPc", items: [], system: {
    }, flags: {
      sr5: creation ? {
        creation: {
          active: true, by: "gm"
        }
      } : {
      }
    }, update: async () => {
    },
  })
}

function implant(actor, value, id = "eyes") {
  const item = {
    documentName: "Item", type: "itemAugmentation", id, uuid: `Actor.pc.Item.${id}`, name: id, parent: actor,
    system: {
      type: "cyberware", underAdapsine: false, augmentationBundle: false, transhumanGift: false, reversibleEssence: false,
      isAccessory: false, essenceCost: {
        base: value, multiplier: "", value
      }
    }, update: async () => {
    },
  }
  actor.items.push(item)
  return item
}

const peakOf = id => store[IMPLANT_REGISTER][`Actor.pc.Item.${id}`]?.[PEAK_COST]

describe("an implant bought at creation takes no Essence peak", () => {
  it("notes the peak off creation, as before", async () => {
    const eyes = implant(character(false), 0.5)
    await hooks.createItem(eyes, {
    }, "gm")
    expect(peakOf("eyes")).toBe(0.5)
  })
  it("notes none in creation, at the purchase or when the cost is lowered", async () => {
    const actor = character(true)
    const eyes = implant(actor, 0.5)
    await hooks.createItem(eyes, {
    }, "gm")
    expect(peakOf("eyes")).toBeUndefined()
    // A module halves the cost (a house rule of the world): the implant takes the halved cost
    eyes.system.essenceCost = {
      base: 0.25, multiplier: "", value: 0.25
    }
    await hooks.updateItem(eyes, {
    }, {
    }, "gm")
    expect(peakOf("eyes")).toBeUndefined()
    expect(essenceTaken(eyes, 0.25, store[IMPLANT_REGISTER])).toBe(0.25)
  })
  it("ignores, in creation, a peak an earlier stay in play left", () => {
    const eyes = implant(character(true), 0.25)
    expect(essenceTaken(eyes, 0.25, {
      [eyes.uuid]: {
        [PEAK_COST]: 0.5
      }
    })).toBe(0.25)
    eyes.parent.flags.sr5 = {
    }
    expect(essenceTaken(eyes, 0.25, {
      [eyes.uuid]: {
        [PEAK_COST]: 0.5
      }
    })).toBe(0.5)
  })
  it("notes none at the GM's arrival for a character in creation", async () => {
    const actor = character(true)
    implant(actor, 0.5)
    globalThis.game.actors = [actor]
    await reconcileImplantRegister()
    expect(peakOf("eyes")).toBeUndefined()
  })
  it("starts the peak from the cost of now when the creation ends", async () => {
    const actor = character(true)
    const eyes = implant(actor, 0.25)
    store[IMPLANT_REGISTER][eyes.uuid] = {
      [PEAK_COST]: 0.5
    }
    implant(actor, 0.1, "ears")
    actor.flags.sr5 = {
    }
    await hooks.updateActor(actor, {
      flags: {
        sr5: {
          "-=creation": null
        }
      }
    }, {
    }, "gm")
    expect(peakOf("eyes")).toBe(0.25)
    expect(peakOf("ears")).toBe(0.1)
  })
  it("leaves the peaks alone on any other update of a character", async () => {
    const actor = character(false)
    implant(actor, 0.25)
    store[IMPLANT_REGISTER]["Actor.pc.Item.eyes"] = {
      [PEAK_COST]: 0.5
    }
    await hooks.updateActor(actor, {
      name: "x"
    }, {
    }, "gm")
    expect(peakOf("eyes")).toBe(0.5)
  })
})

describe("creationEnded / peaksAtCreationEnd", () => {
  it("reads the flag unset, set inactive or nulled, and nothing else", () => {
    expect(creationEnded({
      flags: {
        sr5: {
          "-=creation": null
        }
      }
    })).toBe(true)
    expect(creationEnded({
      flags: {
        sr5: {
          creation: null
        }
      }
    })).toBe(true)
    expect(creationEnded({
      flags: {
        sr5: {
          creation: {
            active: false
          }
        }
      }
    })).toBe(true)
    expect(creationEnded({
      flags: {
        sr5: {
          creation: {
            active: true, by: "gm"
          }
        }
      }
    })).toBe(false)
    expect(creationEnded({
      system: {
      }
    })).toBe(false)
  })
  it("skips a reversible implant and returns null when nothing changes", () => {
    const actor = character(false)
    implant(actor, 0.2)
    implant(actor, 0.3, "tattoo").system.reversibleEssence = true
    expect(peaksAtCreationEnd({
      "Actor.pc.Item.eyes": {
        [PEAK_COST]: 0.2
      }
    }, actor)).toBe(null)
    expect(peaksAtCreationEnd({
    }, actor)).toEqual({
      "Actor.pc.Item.eyes": {
        [PEAK_COST]: 0.2
      }
    })
  })
})
