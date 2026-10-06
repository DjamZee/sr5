import {
  describe, it, expect, vi
} from "vitest"

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import {
  WEAPON_ACCESSORY_CATALOG
} from "../modules/data/weaponAccessoryCatalog.js"

const total = property => property.modifiers.reduce((sum, m) => sum + m.value, 0)
const apply = (mods) => {
  const accuracy = {
    base: 5, modifiers: []
  }
  for (const [label, value, cumulative] of mods) SR5_EntityHelpers.updateModifier(accuracy, label, "weaponAccessory", value, false, cumulative)
  return accuracy
}

//Cumulative modifiers add up; non-cumulative ones compete among themselves (the strongest stays); the two then add up,
//whatever the order the accessories are mounted in
describe("Non-cumulative modifiers", () => {
  const longBarrel = ["Canon long", 1, true]
  const customGrip = ["Poignée personnalisée", 1, true]
  const laser = ["Visée laser", 1, false]
  const smartgun = ["Smartgun", 2, false]

  it("adds cumulative modifiers (long barrel + custom grip, Hard Targets p. 180, 182)", () => {
    expect(total(apply([longBarrel, customGrip]))).toBe(2)
  })

  it("keeps cumulative modifiers when a non-cumulative one arrives after them", () => {
    expect(total(apply([longBarrel, customGrip, laser]))).toBe(3)
    expect(total(apply([laser, longBarrel, customGrip]))).toBe(3)
  })

  it("keeps only the strongest non-cumulative modifier, with its own label", () => {
    for (const order of [[laser, smartgun], [smartgun, laser]]) {
      const accuracy = apply([longBarrel, ...order])
      expect(total(accuracy)).toBe(3)
      expect(accuracy.modifiers.filter(m => m.nonCumulative).map(m => m.source)).toEqual(["Smartgun"])
    }
  })

  it("keeps the deepest of two non-cumulative penalties", () => {
    expect(total(apply([["A", -1, false], ["B", -3, false], ["C", -2, false]]))).toBe(-3)
  })

  it("does not compare non-cumulative modifiers of different types", () => {
    const accuracy = {
      base: 5, modifiers: []
    }
    SR5_EntityHelpers.updateModifier(accuracy, "A", "weaponAccessory", 1, false, false)
    SR5_EntityHelpers.updateModifier(accuracy, "B", "ammunitionType", 1, false, false)
    expect(total(accuracy)).toBe(2)
  })
})

describe("Weapon accessory catalog", () => {
  const effects = key => WEAPON_ACCESSORY_CATALOG[key].itemEffects ?? []

  it("slide mount gives no recoil compensation (Run & Gun p. 70)", () => {
    expect(effects("slideMount").filter(e => e.target === "system.recoilCompensation")).toEqual([])
  })

  it("red dot sight: 750 nuyen and +1 non-cumulative Accuracy (Street Lethal p. 49)", () => {
    expect(WEAPON_ACCESSORY_CATALOG.redDotSight.price).toBe(750)
    expect(effects("redDotSight")).toEqual([expect.objectContaining({
      target: "system.accuracy", value: 1, cumulative: false
    })])
  })

  it("trigger removal: +1 non-cumulative Accuracy (Hard Targets p. 182)", () => {
    expect(effects("triggerRemoval")).toEqual([expect.objectContaining({
      target: "system.accuracy", value: 1, cumulative: false
    })])
  })
})
