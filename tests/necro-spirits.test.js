import {
  describe, it, expect
} from "vitest"
import {
  isNecroSpirit, NECRO_SPIRIT_TYPES
} from "../modules/system/necro-spirits.js"
import {
  SR5_SpiritTypes
} from "../modules/entities/items/spirit-types.js"
import fs from "node:fs"

// Forbidden Arcana p. 50, GM ruling of 05/10 (Q10): the five necro spirits, and only them, lower Magic
describe("necro spirits", () => {
  it("recognises a type picked in the menu, whose key keyOf has slugified (review of Tess)", () => {
    for (const key of NECRO_SPIRIT_TYPES) {
      const picked = SR5_SpiritTypes.keyOf({
        name: "Esprit", system: {
          key
        }
      })
      expect(picked).toBe(key.toLowerCase())
      expect(isNecroSpirit(picked)).toBe(true)
    }
  })

  it("leaves other spirits alone", () => {
    expect(isNecroSpirit("air")).toBe(false)
    expect(isNecroSpirit("vehicleautomotive")).toBe(false)
    expect(isNecroSpirit("")).toBe(false)
  })

  it("lowers the summoner's Magic by 1 per necro spirit item, in the first pass on items", () => {
    const src = fs.readFileSync(new URL("../modules/entities/actors/entityActor.js", import.meta.url), "utf8")
    expect(src).toMatch(/isNecroSpirit\(iData\.type\)[^\n]*specialAttributes\.magic\.augmented, i\.name, "itemSpirit", -1\)/)
  })
})
