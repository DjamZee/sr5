import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Review M4 had left the adept side of Death Sower (Forbidden Arcana p. 40) to the text; lot L3 (l. 259) automates it:
// the +1 DV goes on the melee weapons of the adept, where the sheet and the attack read their damage
describe("Death Sower, adept side", () => {
  it("is added to the damage of the melee weapons", () => {
    expect(readFileSync("modules/entities/items/utilityItem.js", "utf8")).toMatch(/deathSowerAdeptDamage\([\s\S]*updateModifier\(itemData\.damageValue/)
  })
})
