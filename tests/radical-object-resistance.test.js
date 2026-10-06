import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  radicalObjectReduction
} from "../modules/system/reagents.js"

// Forbidden Arcana p. 181: a radical reagent lowers the object resistance by 1 per drachm, the bonuses
// together never above the caster's Magic (arbitrage de DjamZ, 2026-10-06: per drachm, as printed)
describe("radical reagents against object resistance", () => {
  it("takes 1 die off per drachm", () => {
    expect(radicalObjectReduction({
      system: "forbiddenArcana", tier: "radical", effective: 3, magic: 10
    })).toBe(3)
  })

  it("stays under the Magic the Drain reduction left", () => {
    expect(radicalObjectReduction({
      system: "forbiddenArcana", tier: "radical", effective: 5, magic: 6, drainReductionUsed: 4
    })).toBe(2)
  })

  it("does nothing for another tier or another reagent system", () => {
    expect(radicalObjectReduction({
      system: "forbiddenArcana", tier: "refined", effective: 3, magic: 6
    })).toBe(0)
    expect(radicalObjectReduction({
      system: "shadowSpells", tier: "radical", effective: 3, magic: 6
    })).toBe(0)
  })

  it("is read by the GM's object resistance test, checked against the card's author", () => {
    const source = readFileSync("modules/rolls/roll-prepare-case/rollData-ObjectResistance.js", "utf8")
    expect(source).toMatch(/radicalReagent/)
    expect(source).toMatch(/testUserPermission\(author, "OWNER"\)/)
    // the casting card is read again by its id, and must be a spell card of the same caster and spell
    expect(source).toMatch(/game\.messages\?\.get\(chatData\?\.owner\?\.messageId\)/)
    expect(source).toMatch(/card\.owner\?\.actorId !== chatData\.owner\?\.actorId/)
    expect(source).toMatch(/card\.test\?\.type !== "spell"/)
  })
})
