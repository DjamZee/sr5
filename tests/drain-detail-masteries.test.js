import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Review M5: the Drain detail of the dialog names Death Sower and Mage Hunter
describe("Drain detail of a combat spell with masteries", () => {
  const hbs = readFileSync("templates/rolls/rollDialogPartial/drain.hbs", "utf8")

  it("shows the Death Sower line with its value", () => {
    expect(hbs).toMatch(/\{\{#if magic\.drain\.modifiers\.deathSower\}\}[\s\S]*SR5\.MagicMasteryDeathSower[\s\S]*magic\.drain\.modifiers\.deathSower\.value/)
  })

  it("shows the Mage Hunter line that its box fills", () => {
    expect(hbs).toMatch(/\{\{#if dialogSwitch\.mageHunter\}\}[\s\S]*SR5\.MagicMasteryMageHunter[\s\S]*name="dicePoolModMageHunter"/)
    expect(readFileSync("templates/rolls/rollDialogPartial/spellOptions.hbs", "utf8")).toContain('data-target="dicePoolModMageHunter"')
  })
})
