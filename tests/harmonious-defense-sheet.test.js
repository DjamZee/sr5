import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Review H1: an adept with Harmonious Defense has no Counterspelling row, the pool must show elsewhere
describe("Harmonious Defense on the sheet (Forbidden Arcana p. 45)", () => {
  it("has its own row in the astral block, with the pool's current and maximum", () => {
    const hbs = readFileSync("templates/actors/_partials/left-tabs/magicUser/astral.hbs", "utf8")
    expect(hbs).toMatch(/\{\{#if system\.magic\.metamagics\.harmoniousDefense\}\}[\s\S]*counterSpellPool\.current[\s\S]*counterSpellPool\.value[\s\S]*\{\{\/if\}\}/)
  })
})
