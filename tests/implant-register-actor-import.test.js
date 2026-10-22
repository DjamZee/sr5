import {
  describe, it, expect, afterEach
} from "vitest"
import {
  registerImplantRegisterHooks, registerAsTheyStand, IMPLANT_REGISTER, PEAK_COST
} from "../modules/system/implant-register.js"

// Anatole, 23/10: Joy Keller imported from a compendium by the GM. Her items did not go through createItem, so the
// register knew nothing of her Biocondensateur (transhumanGift = true). Her player's first write on it (a cell taken
// out) worked the mark out again from the body: a permanent alert, and Prototype de transhumain's gift taken off.

const saved = {
  users: globalThis.game.users, settings: globalThis.game.settings, actors: globalThis.game.actors,
  warn: globalThis.ui.notifications.warn, hooks: globalThis.Hooks
}
afterEach(() => {
  Object.assign(globalThis.game, {
    users: saved.users, settings: saved.settings, actors: saved.actors
  })
  globalThis.ui.notifications.warn = saved.warn
  globalThis.Hooks = saved.hooks
})

const GM = "gm"
const PLAYER = "player"

/** A world with one active GM; the register's hooks caught, what is written and warned noted. */
function world() {
  const store = {
    [IMPLANT_REGISTER]: {
    }, sr5ShopCreationMode: false
  }
  const warnings = []
  const hooks = {
  }
  Object.assign(globalThis.game, {
    users: {
      activeGM: {
        isSelf: true
      }, get: id => ({
        id, name: id, isGM: id === GM
      }), some: () => false
    },
    settings: {
      get: (_scope, key) => store[key],
      set: async (_scope, key, value) => (store[key] = value),
    },
    actors: [],
  })
  globalThis.ui.notifications.warn = message => warnings.push(message)
  globalThis.Hooks = {
    on: (name, fn) => (hooks[name] = fn), once: () => {}
  }
  registerImplantRegisterHooks()
  return {
    store, warnings, hooks
  }
}

function joyKeller() {
  const actor = {
    documentName: "Actor", uuid: "Actor.joy", name: "Joy Keller", type: "actorPc", system: {
      essence: {
        holeAmount: 0, holeBase: 0
      }
    }, flags: {
    }, items: [],
  }
  const implant = (id, type, system) => {
    const item = {
      documentName: "Item", type: "itemAugmentation", id, uuid: `Actor.joy.Item.${id}`, name: id, parent: actor, system: {
        type, underAdapsine: false, augmentationBundle: false, transhumanGift: false, reversibleEssence: false,
        isAccessory: false, essenceCost: {
          base: 0.2, multiplier: "", value: 0.2
        }, ...system
      }, updates: [],
    }
    item.update = async data => item.updates.push(data)
    return item
  }
  actor.items = [
    implant("bc02", "bioware", {
      transhumanGift: true
    }),
    implant("eyes", "cyberware", {
      essenceCost: {
        base: 0.5, multiplier: "", value: 0.5
      }
    }),
  ]
  return actor
}

describe("a character the GM imports: its implants are registered as they stand", () => {
  it("keeps the Biocondensateur's gift at the player's next write, without an alert", async () => {
    const {
      store, warnings, hooks
    } = world()
    const joy = joyKeller()
    await hooks.createActor(joy, {
    }, GM)
    expect(store[IMPLANT_REGISTER]["Actor.joy.Item.bc02"]).toMatchObject({
      transhumanGift: true, [PEAK_COST]: 0.2
    })
    expect(store[IMPLANT_REGISTER]["Actor.joy.Item.eyes"]).toMatchObject({
      transhumanGift: false, "essenceCost.base": 0.5, [PEAK_COST]: 0.5
    })
    // An actor at its defaults needs no entry
    expect("Actor.joy" in store[IMPLANT_REGISTER]).toBe(false)
    // The player takes a cell out: an ordinary field
    const bc02 = joy.items[0]
    await hooks.updateItem(bc02, {
      system: {
        cells: 1
      }
    }, {
    }, PLAYER)
    expect(bc02.updates).toEqual([])
    expect(warnings).toEqual([])
  })
  it("registers the items a GM's importFromJSON brings in one write", async () => {
    const {
      store, hooks
    } = world()
    const joy = joyKeller()
    await hooks.updateActor(joy, {
      items: joy.items.map(i => ({
        _id: i.id
      }))
    }, {
    }, GM)
    expect(store[IMPLANT_REGISTER]["Actor.joy.Item.bc02"].transhumanGift).toBe(true)
  })
  it("still works out a player's own character from the body", async () => {
    const {
      store, warnings, hooks
    } = world()
    const joy = joyKeller()
    await hooks.createActor(joy, {
    }, PLAYER)
    expect(store[IMPLANT_REGISTER]["Actor.joy.Item.bc02"].transhumanGift).toBe(false)
    expect(joy.items[0].updates).toEqual([{
      "system.transhumanGift": false
    }])
    expect(warnings).toHaveLength(1)
  })
  it("takes no peak for a character in creation", () => {
    const joy = joyKeller()
    const register = registerAsTheyStand({
    }, joy.items, {
      creation: true
    })
    expect(PEAK_COST in register["Actor.joy.Item.bc02"]).toBe(false)
    expect(registerAsTheyStand(register, joy.items, {
      creation: true
    })).toBe(null)
  })
})
