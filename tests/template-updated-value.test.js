import {
  describe, it, expect, afterEach, vi
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// A template changed while a token is inside (light -2 to -4, or set back to 0) kept the effect it gave first: the
// effect was only created when missing, never rewritten, so the token had to step out and back in.
describe("SR5_EffectArea.createTemplateEffect, template changed under a token", () => {
  afterEach(() => vi.restoreAllMocks())

  const lightEffect = (value, deleted) => ({
    type: "itemEffect", system: {
      ownerID: "t1", customEffects: [{
        target: "system.itemsProperties.environmentalMod.light", value
      }]
    }, delete: vi.fn(async () => deleted.push(value)),
  })
  const actorWith = (items, created) => ({
    id: "a1", items, system: {
    },
    createEmbeddedDocuments: vi.fn(async (type, docs) => created.push(...docs)),
  })
  const templateWith = light => ({
    id: "t1", uuid: "Scene.s1.MeasuredTemplate.t1", name: "Zone", author: {
      isGM: true
    }, flags: {
      sr5: {
        environmentalModifiers: {
          light
        }
      }
    }
  })

  it("gives the new value to a token that had the old one", async () => {
    const created = [], deleted = []
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actorWith([lightEffect(2, deleted)], created))
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, templateWith(3))
    expect(deleted).toEqual([2])
    expect(created[0].system.customEffects[0].value).toBe(3)
  })

  it("leaves an effect already at the right value", async () => {
    const created = [], deleted = []
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actorWith([lightEffect(3, deleted)], created))
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, templateWith(3))
    expect(deleted).toEqual([])
    expect(created).toEqual([])
  })

  it("lifts the effect when the value goes back to 0", async () => {
    const created = [], deleted = []
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(actorWith([lightEffect(2, deleted)], created))
    await SR5_EffectArea.createTemplateEffect({
      id: "tok1"
    }, templateWith(0))
    expect(deleted).toEqual([2])
    expect(created).toEqual([])
  })
})
