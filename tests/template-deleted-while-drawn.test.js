import {
  describe, it, expect, vi, afterEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// A smoke grenade thrown out of range: the weapon roll removes its template 11 ms after it is placed
// (rollData-Weapon, "target too far"), while initiateTemplateEffect is still creating its effects. The delete hook
// found nothing to lift, and the smoke stayed on the thrower and the target. Measured in game on 9624e1ec.
describe("a template deleted while its effects are created", () => {
  afterEach(() => vi.restoreAllMocks())

  const actors = {
  }
  const actor = id => (actors[id] ??= {
    items: [],
    deleteEmbeddedDocuments: vi.fn(async (_t, ids) => {
      actors[id].items = actors[id].items.filter(i => !ids.includes(i.id))
    }),
  })

  const templateDocument = (stillThere) => {
    const doc = {
      id: "tpl1", uuid: "Scene.A.MeasuredTemplate.tpl1", x: 0, y: 0, distance: 10,
      flags: {
        sr5: {
          environmentalModifiers: {
            visibility: 3
          }
        }
      },
    }
    doc.parent = {
      tokens: [{
        id: "thrower"
      }, {
        id: "target"
      }],
      templates: {
        get: id => (stillThere && id === "tpl1" ? doc : undefined)
      },
    }
    return doc
  }

  const giveSmoke = () => vi.spyOn(SR5_EffectArea, "createTemplateEffect").mockImplementation(async (token, template) => {
    actor(token.id).items.push({
      id: `fx-${token.id}`, type: "itemEffect", system: {
        ownerItem: template.uuid
      }
    })
  })

  it("lifts the effects it just gave once the template is gone", async () => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(async id => actor(id))
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockResolvedValue(true)
    giveSmoke()
    await SR5_EffectArea.initiateTemplateEffect({
      document: templateDocument(false)
    })
    expect(actor("thrower").items).toEqual([])
    expect(actor("target").items).toEqual([])
  })

  it("keeps them while the template stands", async () => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(async id => actor(id))
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockResolvedValue(true)
    giveSmoke()
    actors.thrower = undefined
    actors.target = undefined
    await SR5_EffectArea.initiateTemplateEffect({
      document: templateDocument(true)
    })
    expect(actor("thrower").items).toHaveLength(1)
    expect(actor("target").items).toHaveLength(1)
  })
})
