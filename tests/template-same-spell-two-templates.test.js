import {
  describe, it, expect, vi, afterEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// N64: two templates of the same spell. A spell's effect records only the spell (ownerItem), one per token
// whatever the number of templates, so deleting one template lifted it from tokens still inside the other
describe("deleting one of two templates of the same spell", () => {
  afterEach(() => vi.restoreAllMocks())

  const SPELL = "Actor.mage.Item.spell"
  let actors
  const actor = id => (actors[id] ??= {
    items: [{
      id: `fx-${id}`, type: "itemEffect", system: {
        ownerItem: SPELL
      }
    }],
    deleteEmbeddedDocuments: vi.fn(async (_t, ids) => {
      actors[id].items = actors[id].items.filter(i => !ids.includes(i.id))
    }),
  })
  const template = (id) => ({
    id, uuid: `Scene.A.MeasuredTemplate.${id}`, flags: {
      sr5: {
        itemHasEffect: true, itemUuid: SPELL
      }
    }
  })

  function scene(){
    const deleted = template("tplA"), other = template("tplB")
    const parent = {
      tokens: [{
        id: "inBoth"
      }, {
        id: "onlyInA"
      }],
      templates: [other],
    }
    parent.templates.get = id => parent.templates.find(t => t.id === id)
    deleted.parent = parent
    other.parent = parent
    return deleted
  }

  it("keeps the effect on a token still inside the other template, lifts it elsewhere", async () => {
    actors = {
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(async id => actor(id))
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockImplementation(async (tpl, token) => tpl.id === "tplA" || token.id === "inBoth")
    await SR5_EffectArea.removeTemplateEffect(scene())
    expect(actor("inBoth").items).toHaveLength(1)
    expect(actor("onlyInA").items).toEqual([])
  })

  // Measured in game: two templates drawn at once each gave the token inside both its own copy (ownerID = template)
  it("lifts only the deleted template's copy when the token holds one per template", async () => {
    actors = {
    }
    actor("inBoth").items = ["tplA", "tplB"].map(t => ({
      id: `fx-${t}`, type: "itemEffect", system: {
        ownerItem: SPELL, ownerID: t
      }
    }))
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(async id => actor(id))
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockImplementation(async (tpl, token) => tpl.id === "tplA" || token.id === "inBoth")
    await SR5_EffectArea.removeTemplateEffect(scene())
    expect(actor("inBoth").items.map(i => i.system.ownerID)).toEqual(["tplB"])
    expect(actor("onlyInA").items).toEqual([])
  })
})
