import {
  describe, it, expect
} from "vitest"
import {
  isNecroSpirit, NECRO_SPIRIT_TYPES
} from "../modules/system/necro-spirits.js"
import fs from "node:fs"

// Forbidden Arcana p. 50, GM ruling of 05/10 (Q10): the five necro spirits, and only them, lower Magic
describe("necro spirits", () => {
  it("knows the five necro spirit types of the compendium", () => {
    expect(NECRO_SPIRIT_TYPES).toHaveLength(5)
    expect(isNecroSpirit("necroCorpse")).toBe(true)
    expect(isNecroSpirit("air")).toBe(false)
    expect(isNecroSpirit("vehicleAutomotive")).toBe(false)
  })

  it("lowers the summoner's Magic by 1 per necro spirit item, in the first pass on items", () => {
    const src = fs.readFileSync(new URL("../modules/entities/actors/entityActor.js", import.meta.url), "utf8")
    expect(src).toMatch(/isNecroSpirit\(iData\.type\)[^\n]*specialAttributes\.magic\.augmented, i\.name, "itemSpirit", -1\)/)
  })
})
