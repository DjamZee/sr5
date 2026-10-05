import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Review M4: the adept side of Death Sower (Forbidden Arcana p. 40) stays text, and the code says so
describe("Death Sower, adept side", () => {
  it("is written down as not automated", () => {
    expect(readFileSync("modules/entities/items/magic-masteries.js", "utf8")).toMatch(/Death Sower, adept side[\s\S]*not automated \(review M4\)/)
  })
})
