import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  registerEssenceHoleHooks
} from "../modules/system/essence-hole.js"
import {
  IMPLANT_REGISTER
} from "../modules/system/implant-register.js"
import {
  ESSENCE_HOLE_SETTING
} from "../modules/system/implant-essence.js"

// Lot C0 of the character creator: an implant taken off a character the gamemaster put "in creation" leaves no
// Essence hole, as under the world's creation mode; off creation, the hole opens as before (Chrome Flesh p. 74).

const saved = {
  users: globalThis.game.users, settings: globalThis.game.settings, Hooks: globalThis.Hooks
}
let onDelete, world
beforeEach(() => {
  world = false
  globalThis.Hooks = {
    on: (name, fn) => {
      if (name === "deleteItem") onDelete = fn
    }
  }
  registerEssenceHoleHooks()
  Object.assign(globalThis.game, {
    users: {
      activeGM: {
        isSelf: true
      }
    },
    settings: {
      get: (_scope, key) => ({
        [IMPLANT_REGISTER]: {
        }, sr5ShopCreationMode: world, [ESSENCE_HOLE_SETTING]: true
      })[key],
    },
  })
})
afterEach(() => {
  Object.assign(globalThis.game, {
    users: saved.users, settings: saved.settings
  })
  globalThis.Hooks = saved.Hooks
})

/** A character with one implant, removed: the updates it receives. */
async function removeImplant(flags) {
  const actor = Object.assign(new Actor(), {
    documentName: "Actor", uuid: "Actor.pc", flags: {
      sr5: flags
    }, system: {
      essence: {
        base: 6, holeAmount: 0, holeBase: 0
      }
    }, updates: [],
  })
  actor.update = async data => actor.updates.push(data)
  const implant = {
    type: "itemAugmentation", id: "imp", uuid: "Actor.pc.Item.imp", parent: actor, system: {
      type: "cyberware", isAccessory: false, reversibleEssence: false, essenceCost: {
        value: 1
      }
    },
  }
  actor.items = [implant]
  await onDelete(implant)
  // The hook catches its own errors: let its promise settle
  await new Promise(resolve => setTimeout(resolve, 0))
  return actor.updates
}

describe("C0: no Essence hole for a character in creation", () => {
  it("off creation, removing an implant opens the hole", async () => {
    expect(await removeImplant({
    })).toHaveLength(1)
  })

  it("a character the gamemaster put in creation: no hole", async () => {
    expect(await removeImplant({
      creation: {
        active: true, by: "gm"
      }
    })).toHaveLength(0)
  })

  it("the world's creation mode: no hole for anyone", async () => {
    world = true
    expect(await removeImplant({
    })).toHaveLength(0)
  })
})
