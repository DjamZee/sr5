import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// N64: two templates A and B of the same spell. A token covered by at least one of them keeps exactly ONE copy of
// the spell's effect, and loses it only when it leaves the last one. A spell's effect records the spell
// (ownerItem) and the template that gave it (ownerID).
describe("one spell, two templates", () => {
  const SPELL = "Actor.mage.Item.spell"
  let actor, scene, token, created, inside

  const template = id => ({
    id, uuid: `Scene.S.MeasuredTemplate.${id}`, flags: {
      sr5: {
        itemHasEffect: true, itemUuid: SPELL
      }
    }
  })
  const copies = () => [...new Set(actor.items.map(i => i.system.ownerID))]
  // The token is inside the templates listed in `inside`
  const moveTo = (...ids) => {
    inside = new Set(ids)
  }

  beforeEach(() => {
    created = 0
    actor = {
      uuid: "Actor.victim", items: [],
      deleteEmbeddedDocuments: vi.fn(async (_t, ids) => {
        actor.items = actor.items.filter(i => !ids.includes(i.id))
      }),
    }
    scene = {
      templates: [template("tplA"), template("tplB")], tokens: []
    }
    scene.templates.get = id => scene.templates.find(t => t.id === id)
    for (let t of scene.templates) t.parent = scene
    token = {
      id: "victim", parent: scene
    }
    scene.tokens.push(token)
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(async () => actor)
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockImplementation(async tpl => inside.has(tpl.id))
    // The spell's apply gives one itemEffect per custom effect (two here), after a delay like a server round trip
    vi.spyOn(SR5_EffectArea, "createTemplateEffect").mockImplementation(async (_token, tpl) => {
      created++
      await new Promise(r => setTimeout(r, 5))
      for (let k of ["a", "b"]) actor.items.push({
        id: `${tpl.id}-${k}-${created}`, type: "itemEffect", system: {
          ownerItem: SPELL, ownerID: tpl.id
        }
      })
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it("entering both at once gives one copy, though the move hook is not awaited", async () => {
    moveTo("tplA", "tplB")
    await Promise.all([SR5_EffectArea.checkIfTokenIsInTemplate(token), SR5_EffectArea.checkIfTokenIsInTemplate(token)])
    expect(copies()).toHaveLength(1)
    expect(created).toBe(1)
  })

  it("leaving A while inside B keeps the copy, and gives nothing again", async () => {
    moveTo("tplA", "tplB")
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    const before = actor.items.map(i => i.id)
    moveTo("tplB")
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    expect(actor.items.map(i => i.id)).toEqual(before)
    expect(created).toBe(1)
  })

  it("leaving B while inside A keeps the copy, and gives nothing again", async () => {
    moveTo("tplA", "tplB")
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    const before = actor.items.map(i => i.id)
    moveTo("tplA")
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    expect(actor.items.map(i => i.id)).toEqual(before)
    expect(created).toBe(1)
  })

  it("leaving both lifts the copy", async () => {
    moveTo("tplA", "tplB")
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    moveTo()
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    expect(actor.items).toEqual([])
  })

  it("two templates drawn at once give one copy", async () => {
    moveTo("tplA", "tplB")
    await Promise.all(scene.templates.map(t => SR5_EffectArea.initiateTemplateEffect({
      document: t
    })))
    expect(copies()).toHaveLength(1)
  })

  it("a copy left twice by an older version is brought back to one", async () => {
    moveTo("tplA", "tplB")
    actor.items = ["tplA", "tplB"].map(t => ({
      id: `old-${t}`, type: "itemEffect", system: {
        ownerItem: SPELL, ownerID: t
      }
    }))
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    expect(copies()).toEqual(["tplA"])
  })

  it("deleting A keeps the copy of a token inside B, and lifts it from a token inside A only", async () => {
    moveTo("tplA", "tplB")
    await SR5_EffectArea.checkIfTokenIsInTemplate(token)
    const deleted = scene.templates[0]
    await SR5_EffectArea.removeTemplateEffect(deleted)
    expect(copies()).toHaveLength(1)
    moveTo("tplA")
    await SR5_EffectArea.removeTemplateEffect(deleted)
    expect(actor.items).toEqual([])
    expect(created).toBe(1)
  })
})
