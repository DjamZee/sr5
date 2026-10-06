import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

// Ossature renforcée (SR5 p. 458): "un seul type pouvant être installé à la fois". Aluminium, Titane and Plastique
// added up (armor +6, resistance +6, MESURES-M7 T1). A second one is refused to a player, whatever the way in
// (shop, drop, loot: the shared screening), and when switched on; the gamemaster goes past it (decision H5).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
  },
}))

const {
  screenRejectedImplants, isBoneLacing, activeBoneLacing
} = await import("../modules/system/implant-essence.js")

// As in both compendiums (the system's and the Megapack's)
const lacing = (name, value = 3, extra = {
}) => ({
  type: "itemAugmentation", name, system: {
    type: "cyberware", storedIn: "", isActive: true, customEffects: {
      0: {
        category: "characterResistances", target: "system.resistances.physicalDamage", type: "value", value
      },
      1: {
        category: "itemArmor", target: "system.itemsProperties.armor", type: "value", value
      },
      2: {
        category: "weaponEffectTargets", target: "system.itemsProperties.weapon.damageValue", type: "unarmedCombat",
        value, damageType: "physical"
      },
    }, ...extra
  }
})
const boneDensity = () => ({
  type: "itemAugmentation", name: "Augmentation de densité osseuse", system: {
    type: "bioware", isActive: true, customEffects: {
      0: {
        category: "characterResistances", type: "rating"
      },
      1: {
        category: "weaponEffectTargets", type: "unarmedCombat", damageType: "physical"
      },
    }
  }
})
const dermal = () => ({
  type: "itemAugmentation", name: "Armure dermique", system: {
    type: "cyberware", isActive: true, customEffects: [{
      category: "itemArmor", value: 2
    }]
  }
})
const body = (items = []) => Object.assign(Object.create(Actor.prototype), {
  name: "Essai", items
})

let confirmAnswer, asked
beforeEach(() => {
  asked = 0
  confirmAnswer = null
  globalThis.foundry.applications.api.DialogV2 = {
    confirm: async () => {
      asked++
      return confirmAnswer
    }
  }
})
afterEach(() => {
  delete globalThis.foundry.applications.api.DialogV2
})

describe("what an Ossature renforcée is", () => {
  it("the cyberware giving Armor and unarmed damage, variants (NE) included, in any language", () => {
    expect(isBoneLacing(lacing("Ossature renforcée (Titane)"))).toBe(true)
    expect(isBoneLacing(lacing("Ossature renforcée (Plastique) (NE)", 1))).toBe(true)
    expect(isBoneLacing(lacing("Bone Lacing (Aluminum)", 2))).toBe(true)
  })
  it("one taken from a Megapack before 2.0.16, its unarmed effect without damageType (measured on 2.0.10)", () => {
    const old = lacing("Ossature renforcée (Aluminium)", 2)
    delete old.system.customEffects[2].damageType
    expect(isBoneLacing(old)).toBe(true)
  })
  it("one from sr5-compendiums 13.0.0-alpha.6: Armor and resistance, no unarmed effect (Honoré's review)", () => {
    const old = lacing("Ossature renforcée (Titane)")
    delete old.system.customEffects[2]
    expect(isBoneLacing(old)).toBe(true)
  })
  it("not a laser pointer: it touches the unarmed attacks, but its accuracy, and gives no Armor", () => {
    expect(isBoneLacing({
      type: "itemAugmentation", name: "Pointeur laser", system: {
        type: "cyberware", customEffects: [{
          category: "weaponEffectTargets", target: "system.itemsProperties.weapon.accuracy", type: "unarmedCombat", value: 1
        }]
      }
    })).toBe(false)
  })
  it("not bone density (bioware), dermal armor, an accessory, or another type", () => {
    expect(isBoneLacing(boneDensity())).toBe(false)
    expect(isBoneLacing(dermal())).toBe(false)
    expect(isBoneLacing(lacing("Ossature", 3, {
      isAccessory: true
    }))).toBe(false)
    expect(isBoneLacing({
      ...lacing("Ossature"), type: "itemGear"
    })).toBe(false)
  })
})

describe("a second one is refused before it moves", () => {
  it("refused to a player, with DjamZ's words, the first named", async () => {
    const warned = []
    const titane = lacing("Ossature renforcée (Titane)")
    const result = await screenRejectedImplants(body([lacing("Ossature renforcée (Aluminium)", 2)]), [titane, dermal()], {
      isGM: false, warn: (key, data) => warned.push([key, data.lacing])
    })
    expect(result.refused).toEqual([titane])
    expect(warned).toEqual([["SR5.WARN_BoneLacingSecond", "Ossature renforcée (Aluminium)"]])
    expect(asked).toBe(0)
  })
  it("an inactive one installed counts: installed is installed", async () => {
    const titane = lacing("Ossature renforcée (Titane)")
    expect((await screenRejectedImplants(body([lacing("Ossature renforcée (Plastique)", 1, {
      isActive: false
    })]), [titane], {
      isGM: false, warn: () => {}
    })).refused).toEqual([titane])
  })
  it("two in the same batch (a shop cart): the second is refused, the first goes", async () => {
    const a = lacing("Ossature renforcée (Aluminium)", 2), t = lacing("Ossature renforcée (Titane)")
    expect((await screenRejectedImplants(body([]), [a, t], {
      isGM: false, warn: () => {}
    })).refused).toEqual([t])
  })
  it("a stored one neither blocks nor is blocked", async () => {
    const stored = lacing("Ossature renforcée (Titane)", 3, {
      storedIn: "stash"
    })
    expect((await screenRejectedImplants(body([lacing("Ossature renforcée (Aluminium)", 2)]), [stored], {
      isGM: false, warn: () => {}
    })).refused).toEqual([])
    expect((await screenRejectedImplants(body([stored]), [lacing("Ossature renforcée (Aluminium)", 2)], {
      isGM: false, warn: () => {}
    })).refused).toEqual([])
  })
  it("bone density beside a lacing is not this decision", async () => {
    expect((await screenRejectedImplants(body([lacing("Ossature renforcée (Titane)")]), [boneDensity()], {
      isGM: false, warn: () => {}
    })).refused).toEqual([])
  })
  it("the gamemaster is asked, and may keep it", async () => {
    confirmAnswer = true
    expect(await screenRejectedImplants(body([lacing("Ossature renforcée (Aluminium)", 2)]), [lacing("Ossature renforcée (Titane)")], {
      isGM: true
    })).toEqual({
      refused: [], confirmed: true
    })
    expect(asked).toBe(1)
  })
})

describe("switching one on", () => {
  it("finds the other one switched on, not itself, not an inactive or stored one", () => {
    const alu = lacing("Ossature renforcée (Aluminium)", 2)
    const titane = lacing("Ossature renforcée (Titane)", 3, {
      isActive: false
    })
    expect(activeBoneLacing(body([alu, titane]), titane)).toBe(alu)
    expect(activeBoneLacing(body([alu]), alu)).toBe(null)
    expect(activeBoneLacing(body([{
      ...alu, system: {
        ...alu.system, isActive: false
      }
    }, titane]), titane)).toBe(null)
    expect(activeBoneLacing(body([{
      ...alu, system: {
        ...alu.system, storedIn: "stash"
      }
    }, titane]), titane)).toBe(null)
  })
})
