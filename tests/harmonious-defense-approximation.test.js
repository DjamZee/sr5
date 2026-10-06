import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Review H2: the permanent pool is an accepted approximation of the book, and the code says so
describe("Harmonious Defense approximation (Forbidden Arcana p. 45)", () => {
  it("is written down where the pool is computed", () => {
    expect(readFileSync("modules/entities/actors/utilityActor.js", "utf8")).toMatch(/Accepted approximation \(review H2\)/)
  })
})
