import {
  describe, it, expect, vi, afterEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// The template's form sets its effects one at a time. checkIfTokenIsInTemplate skipped a token that already had
// any effect of the template, so the Spam set after the light never put its noise on the tokens inside.
describe("SR5_EffectArea.checkIfTokenIsInTemplate", () => {
  afterEach(() => vi.restoreAllMocks())

  const template = {
    uuid: "Scene.A.MeasuredTemplate.t1", x: 0, y: 0, distance: 5,
    flags: {
      sr5: {
        environmentalModifiers: {
          light: 2
        }, matrixNoise: 3
      }
    },
  }
  const actorWithLight = {
    items: [{
      type: "itemEffect", system: {
        ownerItem: template.uuid
      }
    }]
  }

  it("still adds the template's other effects to a token inside that has one of them", async () => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockResolvedValue(actorWithLight)
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockResolvedValue(true)
    const create = vi.spyOn(SR5_EffectArea, "createTemplateEffect").mockResolvedValue()
    const token = {
      id: "tok1", parent: {
        templates: [template]
      }
    }
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    expect(create).toHaveBeenCalledWith(token, template)
  })

  it("lifts them from a token outside", async () => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockResolvedValue(actorWithLight)
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockResolvedValue(false)
    const create = vi.spyOn(SR5_EffectArea, "createTemplateEffect").mockResolvedValue()
    const remove = vi.spyOn(SR5_EffectArea, "deleteTemplateEffect").mockResolvedValue()
    await SR5_EffectArea.checkIfTokenIsInTemplate({
      id: "tok1", parent: {
        templates: [template]
      }
    })
    expect(create).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(actorWithLight, template.uuid)
  })
})
