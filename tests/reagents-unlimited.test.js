import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  rollLimitValue, secondChanceLimit
} from "../modules/rolls/roll-helpers/limit.js"

// Radical reagents lift the limit (Forbidden Arcana p. 181): neither Second Chance nor the card may bring it back
describe("a roll without limit (radical reagents)", () => {
  const unlimited = {
    base: 1, value: 1, unlimited: true
  }

  it("lets Second Chance keep every new hit", () => {
    expect(secondChanceLimit(unlimited, 3)).toBeNull()
  })

  it("still caps Second Chance under an ordinary limit (SR5 p. 58)", () => {
    expect(secondChanceLimit({
      value: 5
    }, 3)).toBe(2)
    expect(secondChanceLimit({
      value: 5
    }, 6)).toBe(0)
    expect(secondChanceLimit({
      value: 0
    }, 3)).toBeNull()
  })

  it("shows no nominal limit on the card", () => {
    // The card prints the limit only when limit.value > 0 (rollCardPartial/limitRoll.hbs)
    expect(rollLimitValue(unlimited)).toBe(0)
    expect(rollLimitValue({
      value: 7
    })).toBe(7)
    const card = readFileSync("templates/rolls/roll-card.hbs", "utf8")
    expect(card).toMatch(/\{\{#if \(gt limit\.value 0\)\}\}\s*\{\{> systems\/sr5\/templates\/rolls\/rollCardPartial\/limitRoll\.hbs\}\}/)
  })
})
