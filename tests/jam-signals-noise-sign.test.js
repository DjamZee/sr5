import {
  describe, it, expect, afterEach, vi
} from "vitest"
import {
  SR5_MatrixHelpers
} from "../modules/rolls/roll-helpers/matrix.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// Jam Signals "adds all hits to the Noise rating" (SR5 p. 239). The noise of an actor is a positive
// rating that a matrix test turns into a malus (personalNoise = -noise). The jam stored -hits, so the
// jammer, and every device it jammed with the same value, rolled more dice instead of fewer.
describe("SR5_MatrixHelpers.jamSignals", () => {
  afterEach(() => vi.restoreAllMocks())

  it("adds the hits to the jammer's noise rating", async () => {
    const created = []
    const actor = {
      id: "a1", name: "Jammer",
      createEmbeddedDocuments: vi.fn(async (type, docs) => created.push([type, docs])),
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)

    await SR5_MatrixHelpers.jamSignals({
      owner: {
        actorId: "a1"
      }, roll: {
        hits: 5
      }
    })

    const [, [item]] = created.find(([type]) => type === "Item")
    expect(item["system.value"]).toBe(5)
    expect(item["system.customEffects"]["0"].target).toBe("system.matrix.noise")
    expect(item["system.customEffects"]["0"].value).toBe(5)
  })
})
