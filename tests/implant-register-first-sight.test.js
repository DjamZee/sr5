import {
  describe, it, expect, afterEach
} from "vitest"
import {
  GM_ONLY_FIELDS
} from "../modules/system/implant-essence.js"
import {
  expectedValues, reconcileImplantRegister, IMPLANT_REGISTER, PEAK_COST
} from "../modules/system/implant-register.js"

// DjamZ's world, 07/10: at a reload, ten accessories of characters the GM had set up himself (Samouraï des rues,
// Agent de sécurité, Alkshe) were unknown to the register; the GM's arrival worked them out again as a player's
// implant, unticked "accessory" (no compendium origin found) and warned of a player. Ten false alerts, and the
// Essence of the characters lowered (1.9 to 0.1 for the Samouraï, measured on instance 12).

const saved = {
  users: globalThis.game.users, settings: globalThis.game.settings, actors: globalThis.game.actors, warn: globalThis.ui.notifications.warn
}
afterEach(() => {
  Object.assign(globalThis.game, {
    users: saved.users, settings: saved.settings, actors: saved.actors
  })
  globalThis.ui.notifications.warn = saved.warn
})

/** A world with one active GM, a register and characters; what is written and warned is noted. */
function world(register, actors) {
  const store = {
    [IMPLANT_REGISTER]: register, sr5ShopCreationMode: false
  }
  const warnings = []
  Object.assign(globalThis.game, {
    users: {
      activeGM: {
        isSelf: true
      }, get: () => null, some: () => false
    },
    settings: {
      get: (_scope, key) => store[key],
      set: async (_scope, key, value) => (store[key] = value),
    },
    actors,
  })
  globalThis.ui.notifications.warn = message => warnings.push(message)
  return {
    store, warnings
  }
}

function character(id, essence, implants) {
  const actor = {
    documentName: "Actor", uuid: `Actor.${id}`, name: id, type: "actorPc", system: {
      essence
    }, items: [], updates: [],
  }
  actor.update = async data => actor.updates.push(data)
  actor.items = implants.map(([itemId, system]) => {
    const item = {
      documentName: "Item", type: "itemAugmentation", id: itemId, uuid: `Actor.${id}.Item.${itemId}`, name: itemId,
      parent: actor, system: {
        type: "cyberware", underAdapsine: false, augmentationBundle: false, transhumanGift: false,
        reversibleEssence: false, isAccessory: false, ...system
      }, updates: [],
    }
    item.update = async data => item.updates.push(data)
    return item
  })
  return actor
}

const cost = (base, value = base) => ({
  essenceCost: {
    base, multiplier: "", value
  }
})

describe("the register at the GM's arrival: what it does not know yet is taken as it stands", () => {
  it("leaves the GM's implants and accessories untouched, warns nobody, and notes them all", async () => {
    const samurai = character("samurai", {
      holeAmount: 0.4, holeBase: 0.4
    }, [
      ["eyes", cost(0.3)],
      ["nightVision", {
        isAccessory: true, ...cost(0.1)
      }],
      ["holster", {
        isAccessory: true, ...cost(0)
      }],
      ["blades", {
        isAccessory: true, ...cost(0.3)
      }],
    ])
    const {
      store, warnings
    } = world({
    }, [samurai])
    await reconcileImplantRegister()
    expect(warnings).toEqual([])
    expect(samurai.updates).toEqual([])
    expect(samurai.items.flatMap(i => i.updates)).toEqual([])
    const register = store[IMPLANT_REGISTER]
    expect(register["Actor.samurai.Item.nightVision"]).toMatchObject({
      isAccessory: true, "essenceCost.base": 0.1, [PEAK_COST]: 0.1
    })
    expect(register["Actor.samurai.Item.holster"].isAccessory).toBe(true)
    expect(register["Actor.samurai.Item.blades"].isAccessory).toBe(true)
    expect(register["Actor.samurai.Item.eyes"]).toMatchObject({
      isAccessory: false, "essenceCost.base": 0.3, [PEAK_COST]: 0.3
    })
    // A character's Essence hole the GM set is noted too, so that a player's later write is checked against it
    expect(register["Actor.samurai"]).toEqual({
      "essence.holeAmount": 0.4, "essence.holeBase": 0.4
    })
  })
  it("completes an entry missing a field as the implant stands, without a warning", async () => {
    const agent = character("agent", {
    }, [["smartlink", {
      isAccessory: true, ...cost(0.1)
    }]])
    const {
      store, warnings
    } = world({
      "Actor.agent.Item.smartlink": {
        underAdapsine: false, augmentationBundle: false, transhumanGift: false
      }
    }, [agent])
    await reconcileImplantRegister()
    expect(warnings).toEqual([])
    expect(agent.items[0].updates).toEqual([])
    expect(store[IMPLANT_REGISTER]["Actor.agent.Item.smartlink"].isAccessory).toBe(true)
  })
  it("still puts back a box changed against what the register holds", async () => {
    const forged = character("pc", {
    }, [["eyes", {
      isAccessory: true, ...cost(0.3)
    }]])
    const known = Object.fromEntries(GM_ONLY_FIELDS.itemAugmentation.map(f => [f, false]))
    const {
      warnings
    } = world({
      "Actor.pc.Item.eyes": {
        ...known, "essenceCost.base": 0.3, "essenceCost.multiplier": ""
      }
    }, [forged])
    await reconcileImplantRegister()
    expect(forged.items[0].updates).toEqual([{
      "system.isAccessory": false
    }])
    expect(warnings).toHaveLength(1)
  })
  it("works a player's write on an unknown implant out again, as before", async () => {
    const pc = character("pc", {
    }, [["blades", {
      isAccessory: true, ...cost(0.3)
    }]])
    world({
    }, [pc])
    const resolve = async () => null
    expect((await expectedValues(pc.items[0], GM_ONLY_FIELDS.itemAugmentation, {
    }, {
      resolve
    })).isAccessory).toBe(false)
    expect((await expectedValues(pc.items[0], GM_ONLY_FIELDS.itemAugmentation, {
    }, {
      resolve, firstSight: true
    })).isAccessory).toBe(true)
  })
})
