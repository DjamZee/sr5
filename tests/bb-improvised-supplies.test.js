import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  improvisedSuppliesDice
} from "../modules/system/bb-healing-rules.js"

// Improvised supplies: -1 in the core rules (SR5 p. 208); with the advanced medkits of Bullets & Bandages,
// -3 less the hits of the improvising roll, capped at 3 (BB p. 18)
describe("improvised medical supplies", () => {
  it("keeps the core -1 without the advanced medkits", () => {
    expect(improvisedSuppliesDice(2, false)).toBe(-1)
  })

  it("takes the improvising hits off the -3", () => {
    expect(improvisedSuppliesDice(0, true)).toBe(-3)
    expect(improvisedSuppliesDice(2, true)).toBe(-1)
    expect(improvisedSuppliesDice(3, true)).toBe(0)
  })

  it("never turns into a bonus, nor reads text or negatives", () => {
    expect(improvisedSuppliesDice(9, true)).toBe(0)
    expect(improvisedSuppliesDice(-4, true)).toBe(-3)
    expect(improvisedSuppliesDice("abc", true)).toBe(-3)
  })

  it("is offered in the healing dialog", () => {
    const template = readFileSync("templates/rolls/rollDialogPartial/healingModifier.hbs", "utf8")
    expect(template).toMatch(/bbImprovisedHits/)
    const dialog = readFileSync("modules/rolls/roll-dialog.js", "utf8")
    expect(dialog).toMatch(/improvisedSuppliesDice\(/)
  })
})
