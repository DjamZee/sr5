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

// Some powers « sont toujours actifs et ne nécessitent donc aucune action pour leur activation ; ils sont listés
// avec une action « automatique » » (SR5 p. 396). Given to a new spirit, they used to arrive switched off: the
// Armor of an Immunity did not count until the GM ticked it. They come switched on (arbitrage de DjamZ, H39).

const item = (type, actionType, key, name = key) => ({
  type, name, system: {
    actionType, systemEffects: [{
      category: "spiritPower", value: key
    }]
  },
  toObject: () => ({
    type, name, system: {
      actionType, isActive: false
    }
  }),
})

describe("powers given to a new spirit", () => {
  it("come switched on when their action is automatic or permanent, off otherwise", () => {
    const on = name => SR5_CompendiumUtility.givenItem(item("itemPower", name, "x")).system.isActive
    expect(on("automatic")).toBe(true)
    expect(on("permanent")).toBe(true)
    expect(on("complex")).toBe(false)
    expect(on("simple")).toBe(false)
    expect(on("")).toBe(false)
  })

  it("leaves weapons as they are", () => {
    expect(SR5_CompendiumUtility.givenItem(item("itemWeapon", "automatic", "x")).system.isActive).toBe(false)
  })

  it("applies to the base powers of a spirit type", async () => {
    const compendium = [
      item("itemPower", "automatic", "astralForm", "Forme astrale"),
      item("itemPower", "simple", "manifestation", "Manifestation"),
    ]
    const found = await SR5_CompendiumUtility.findBaseSpiritPowersInCompendium([], compendium, "watcher")
    expect(Object.fromEntries(found.map(i => [i.name, i.system.isActive]))).toEqual({
      "Forme astrale": true, "Manifestation": false
    })
  })
})
