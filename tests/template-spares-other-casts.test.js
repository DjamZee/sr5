import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// A template of a spell lifts the copies of the spell's effect its templates gave, never another cast's: the same
// spell cast by card (ownerID = the caster, flag castMessageId = its card), or through a template of another scene
// on a linked actor
describe("a template leaves the other casts of its spell alone", () => {
  const SPELL = "Actor.mage.Item.spell"
  let actor, scene, otherScene, token, inside

  const template = (id, messageId) => ({
    id, uuid: `Scene.S.MeasuredTemplate.${id}`, flags: {
      sr5: {
        itemHasEffect: true, itemUuid: SPELL, messageId
      }
    }
  })
  const effect = (id, ownerID, castMessageId) => ({
    id, type: "itemEffect", system: {
      ownerItem: SPELL, ownerID
    }, flags: castMessageId === undefined ? {
    } : {
      sr5: {
        castMessageId
      }
    }
  })
  const ids = () => actor.items.map(i => i.id)

  beforeEach(() => {
    inside = new Set()
    actor = {
      uuid: "Actor.victim", items: [],
      deleteEmbeddedDocuments: vi.fn(async (_t, list) => {
        actor.items = actor.items.filter(i => !list.includes(i.id))
      }),
    }
    scene = {
      templates: [template("tplHere", "castHere")], tokens: []
    }
    scene.templates.get = id => scene.templates.find(t => t.id === id)
    otherScene = {
      templates: [template("tplThere", "castThere")]
    }
    otherScene.templates.get = id => otherScene.templates.find(t => t.id === id)
    globalThis.game.scenes = [scene, otherScene]
    token = {
      id: "victim", parent: scene
    }
    scene.tokens.push(token)
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(async () => actor)
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockImplementation(async tpl => inside.has(tpl.id))
    vi.spyOn(SR5_EffectArea, "createTemplateEffect").mockImplementation(async () => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.game.scenes
  })

  it("keeps the effect of a cast by card when a template of the spell does not cover the token", async () => {
    actor.items = [effect("byCard", "mage", "cardMessage")]
    await SR5_EffectArea.syncSpellEffect(token, SPELL)
    expect(ids()).toEqual(["byCard"])
  })

  it("keeps it when that template is removed", async () => {
    actor.items = [effect("byCard", "mage", "cardMessage")]
    const removed = scene.templates.pop()
    await SR5_EffectArea.syncSpellEffect(token, SPELL, removed)
    expect(ids()).toEqual(["byCard"])
  })

  it("keeps the copy a template of another scene gave (a linked actor)", async () => {
    actor.items = [effect("there", "tplThere", "castThere"), effect("legacyThere", "tplThere")]
    await SR5_EffectArea.syncSpellEffect(token, SPELL)
    expect(ids()).toEqual(["there", "legacyThere"])
  })

  it("still lifts the copy its own template gave, and the resisted copy of its own cast", async () => {
    actor.items = [effect("own", "tplHere", "castHere"), effect("resisted", "mage", "castHere"), effect("byCard", "mage", "cardMessage")]
    await SR5_EffectArea.syncSpellEffect(token, SPELL)
    expect(ids()).toEqual(["byCard"])
  })

  it("lifts its copy when the template is removed, though the scene no longer lists it", async () => {
    actor.items = [effect("own", "tplHere", "castHere"), effect("resisted", "mage", "castHere")]
    const removed = scene.templates.pop()
    await SR5_EffectArea.syncSpellEffect(token, SPELL, removed)
    expect(ids()).toEqual([])
  })

  it("an effect made before the flag, by no template of another scene, is lifted as before", async () => {
    actor.items = [effect("old", "mage")]
    await SR5_EffectArea.syncSpellEffect(token, SPELL)
    expect(ids()).toEqual([])
  })

  it("inside the template, a card's copy stays beside the template's one", async () => {
    inside = new Set(["tplHere"])
    actor.items = [effect("own", "tplHere", "castHere"), effect("byCard", "mage", "cardMessage")]
    await SR5_EffectArea.syncSpellEffect(token, SPELL)
    expect(ids()).toEqual(["own", "byCard"])
  })
})
