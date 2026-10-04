import {
  describe, it, expect, vi
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_CompendiumUtility
} from "../modules/entities/actors/utilityCompendium.js"

// SR5 p. 301: a homunculus comes with Sapience and Dual Natured.

const power = (key) => ({
  name: key, system: {
    systemEffects: [{
      category: "spiritPower", value: key
    }]
  }, toObject: () => ({
    name: key
  })
})

describe("homunculus base powers", () => {
  it("finds Sapience and Dual Natured", async () => {
    const compendium = ["sapience", "dualNatured", "astralForm", "materialization"].map(power)
    const found = await SR5_CompendiumUtility.findBaseSpiritPowersInCompendium([], compendium, "homunculus")
    expect(found.map(i => i.name).sort()).toEqual(["dualNatured", "sapience"])
  })

  it("finds the sludge spirit powers too", async () => {
    const compendium = ["mutagen", "engulfWater", "sapience"].map(power)
    const found = await SR5_CompendiumUtility.findBaseSpiritPowersInCompendium([], compendium, "sludge")
    expect(found.map(i => i.name).sort()).toEqual(["engulfWater", "mutagen", "sapience"])
  })
})

// A power list is found by the spirit type key: a misspelt list name is silently never read.
describe("every power list matches a spirit type", async () => {
  const {
    SR5
  } = await import("../modules/config.js")
  it("has no orphan list", () => {
    const orphans = Object.keys(SR5).filter(k => /^spirit(Base|Optional)Powers./.test(k))
      .map(k => k.replace(/^spirit(Base|Optional)Powers/, ""))
      .filter(type => !(type in SR5.spiritTypes))
    expect(orphans).toEqual([])
  })
})
