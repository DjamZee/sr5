import {
  describe, it, expect, afterEach, vi
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"

// drawMeasuredTemplate also fires for the preview dragged before a template is placed. That preview has no id,
// so the effect it gave the tokens under it had no template to belong to: nothing ever lifted it, and with no
// scene in its owner it counted on every scene.
describe("SR5_EffectArea.initiateTemplateEffect", () => {
  afterEach(() => vi.restoreAllMocks())

  const template = id => ({
    document: {
      id, flags: {
        sr5: {
          environmentalModifiers: {
            light: 2
          }
        }
      }, parent: {
        tokens: [{
          id: "tok1", x: 0, y: 0
        }]
      }, x: 0, y: 0, distance: 5
    }
  })

  it("gives no effect from a template preview", async () => {
    const create = vi.spyOn(SR5_EffectArea, "createTemplateEffect").mockResolvedValue()
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockResolvedValue(true)
    await SR5_EffectArea.initiateTemplateEffect(template(null))
    expect(create).not.toHaveBeenCalled()
  })

  it("still gives it from a placed template", async () => {
    const create = vi.spyOn(SR5_EffectArea, "createTemplateEffect").mockResolvedValue()
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockResolvedValue(true)
    await SR5_EffectArea.initiateTemplateEffect(template("t1"))
    expect(create).toHaveBeenCalledTimes(1)
  })
})
