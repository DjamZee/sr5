import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const {
  boneClashByPlayer, registerBoneAugmentationGuard
} = await import("../modules/system/bone-augmentation-guard.js")

// Bérénice's review: in a player's console, item.update({"system.isActive": true}) switched bone density on beside an
// active lacing, both bonuses added, unseen by the GM. The active GM now switches it off again and is told.

const lacing = (isActive = true) => ({
  id: "lac", type: "itemAugmentation", name: "Ossature renforcée (Titane)", system: {
    type: "cyberware", isActive, storedIn: ""
  }
})
const density = (isActive = true) => ({
  id: "den", type: "itemAugmentation", name: "Augmentation de densité osseuse", system: {
    type: "bioware", isActive, storedIn: ""
  }
})
const onActor = (...items) => {
  const parent = {
    name: "Essai", items
  }
  for (const i of items) {
    i.parent = parent
    i.update = vi.fn(async data => {
      i.system.isActive = data["system.isActive"]
    })
  }
  return items
}

let saved, hooks, warn
beforeEach(() => {
  saved = {
    users: game.users, i18n: game.i18n
  }
  const gm = {
    id: "gm", isGM: true, isSelf: true
  }
  const player = {
    id: "pl", isGM: false, name: "Joueuse"
  }
  game.users = Object.assign(new Map([["gm", gm], ["pl", player]]), {
    activeGM: gm
  })
  game.i18n = {
    localize: k => k, format: k => k
  }
  warn = vi.fn()
  globalThis.ui = {
    notifications: {
      warn
    }
  }
  hooks = {
  }
  globalThis.Hooks = {
    on: (name, fn) => {
      hooks[name] = fn
    }
  }
  registerBoneAugmentationGuard()
})
afterEach(() => {
  Object.assign(game, saved)
})

describe("what the active GM puts back", () => {
  it("a player who switches bone density on beside an active lacing", async () => {
    const [, den] = onActor(lacing(), density())
    await hooks.updateItem(den, {
      system: {
        isActive: true
      }
    }, {
    }, "pl")
    expect(den.update).toHaveBeenCalledWith({
      "system.isActive": false
    })
    expect(den.system.isActive).toBe(false)
    expect(warn).toHaveBeenCalledWith("SR5.WARN_BoneClashSwitchedOff", {
      permanent: true
    })
  })

  it("a player who creates one switched on beside the other", async () => {
    const [lac] = onActor(lacing(), density())
    await hooks.createItem(lac, {
    }, "pl")
    expect(lac.system.isActive).toBe(false)
  })

  it("not a gamemaster's write (H5: he may keep both), nor another change, nor without a clash", async () => {
    const [, den] = onActor(lacing(), density())
    await hooks.updateItem(den, {
      system: {
        isActive: true
      }
    }, {
    }, "gm")
    await hooks.updateItem(den, {
      system: {
        wirelessTurnedOn: true
      }
    }, {
    }, "pl")
    expect(den.update).not.toHaveBeenCalled()
    const [, alone] = onActor(lacing(false), density())
    expect(boneClashByPlayer(alone, {
      system: {
        isActive: true
      }
    }, "pl")).toBeNull()
  })

  it("only on the active GM's client", async () => {
    game.users.activeGM = {
      id: "other", isSelf: false
    }
    const [, den] = onActor(lacing(), density())
    await hooks.updateItem(den, {
      system: {
        isActive: true
      }
    }, {
    }, "pl")
    expect(den.update).not.toHaveBeenCalled()
  })
})
