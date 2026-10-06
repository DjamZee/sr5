import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Review M1: Mage Hunter (Forbidden Arcana p. 34) is a trade, +1 Drain per level for -2 per level to the
// counterspelling against the spell. The player used to pay every time and receive nothing.
describe("Mage Hunter trade", () => {
  const spell = readFileSync("modules/rolls/roll-prepare-case/rollData-Spell.js", "utf8")
  const dialog = readFileSync("modules/rolls/roll-dialog.js", "utf8")

  it("does not charge the Drain when the spell is prepared", () => {
    expect(spell).not.toMatch(/drain\.modifiers\.mageHunter = \{/)
    expect(spell).toContain("rollData.dialogSwitch.mageHunter = true")
  })

  it("offers an unticked box that adds the Drain only when ticked", () => {
    const hbs = readFileSync("templates/rolls/rollDialogPartial/spellOptions.hbs", "utf8")
    expect(hbs).toMatch(/\{\{#if dialogSwitch\.mageHunter\}\}[\s\S]*data-modifier="mageHunter"/)
    expect(hbs).not.toMatch(/data-modifier="mageHunter"[^>]*checked/)
    expect(dialog).toMatch(/case "mageHunter": \{[\s\S]*value = isChecked \? level : 0[\s\S]*else delete dialogData\.magic\.drain\.modifiers\.mageHunter/)
  })

  it("tells the GM on the spell card what the counterspelling loses", () => {
    expect(readFileSync("modules/rolls/roll-test-case/test-Spell.js", "utf8")).toMatch(/if \(cardData\.magic\.mageHunter\?\.used\)[\s\S]*SR5\.MageHunterCounterspell[\s\S]*2 \* \(cardData\.magic\.mageHunter\.level/)
    expect(JSON.parse(readFileSync("lang/fr.json", "utf8"))["SR5.MageHunterCounterspell"]).toContain("{value}")
  })
})
