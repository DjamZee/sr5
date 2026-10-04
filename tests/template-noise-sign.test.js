import {
  describe, it, expect, afterEach, vi
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// A spam or static zone adds its rating to the Noise (SR5 p. 232). The noise of an actor is a positive rating
// that a matrix test turns into a malus (personalNoise = -noise). A template stored -rating, so every device
// inside it rolled more dice instead of fewer -- the same defect as the jam of SR5 p. 239 (efe7d9c3).
describe("SR5_EffectArea.createTemplateEffect, matrix noise", () => {
  afterEach(() => vi.restoreAllMocks())

  it("adds the template's noise rating to the actor's noise", async () => {
    const created = []
    const actor = {
      id: "a1", items: [], system: {
      },
      createEmbeddedDocuments: vi.fn(async (type, docs) => created.push(...docs)),
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actor)
    const template = {
      id: "t1", uuid: "Scene.s1.MeasuredTemplate.t1", name: "Zone", flags: {
        sr5: {
          matrixNoise: 3
        }
      }
    }

    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, template)

    const noise = created.find(e => e.system.customEffects.some(c => c.target === "system.matrix.noise"))
    expect(noise.system.value).toBe(3)
    expect(noise.system.customEffects[0].value).toBe(3)
  })
})
