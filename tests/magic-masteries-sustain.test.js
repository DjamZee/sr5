import {
  describe, it, expect
} from "vitest"
import {
  utilityActorSource
} from './fixtures/utility-actor-source.js'

// Measured in play: a spell freed once by Illusionist kept its freedom after its Force went above Magic,
// because the freedom was written on the item, which survives the actor's preparations
describe("sustaining freed by a mastery (Forbidden Arcana p. 37, 38)", () => {
  const code = utilityActorSource()

  it("never writes the freedom on the item", () => {
    expect(code).not.toMatch(/freed\.has\(i\.id\)\) i\.system\.freeSustain = true/)
  })

  it("skips the penalty of the spells freed at this preparation", () => {
    expect(code).toMatch(/if \(freedByMastery\.has\(i\.id\)\) continue/)
  })
})
