import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// A smoke template (environmental modifiers) at the left edge, radius 10 scene units (100 px each).
const smoke = () => ({
  id: "smoke", uuid: "Scene.S.MeasuredTemplate.smoke", x: 0, y: 0, distance: 10,
  flags: {
    sr5: {
      environmentalModifiers: {
        visibility: -2
      }
    }
  }
})

// A token document as Foundry 13 hands it to updateToken: x and y follow the move animation, _source holds the
// destination
const token = (id, from, to, actorId = "glitch", actorLink = true) => ({
  id, actorId, actorLink, x: from, y: 0, _source: {
    x: to, y: 0
  }
})

describe("environment templates", () => {
  let actor, scene, created, deleted
  beforeEach(() => {
    created = 0
    deleted = 0
    actor = {
      items: []
    }
    scene = {
      templates: [smoke()], tokens: []
    }
    globalThis.canvas.grid = {
      measurePath: ([a, b]) => ({
        distance: Math.hypot(b.x - a.x, b.y - a.y) / 100
      })
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(async () => actor)
    vi.spyOn(SR5_EffectArea, "createTemplateEffect").mockImplementation(async () => {
      created++
      if (!actor.items.length) actor.items.push({
        id: "fx", type: "itemEffect", system: {
          ownerItem: "Scene.S.MeasuredTemplate.smoke"
        }
      })
    })
    vi.spyOn(SR5_EffectArea, "deleteTemplateEffect").mockImplementation(async () => {
      deleted++
      actor.items = []
    })
  })
  afterEach(() => vi.restoreAllMocks())

  const add = t => {
    t.parent = scene
    scene.tokens.push(t)
    return t
  }

  // B4: the hook reads the destination, not the animated position the token is leaving
  it("a token moving into the smoke gets the effect on that move", async () => {
    const t = add(token("t1", 2000, 100))
    await SR5_EffectArea.checkIfTokenIsInTemplate(t)
    expect(created).toBe(1)
  })

  it("a token moving out of the smoke loses it on that move", async () => {
    actor.items.push({
      id: "fx", type: "itemEffect", system: {
        ownerItem: "Scene.S.MeasuredTemplate.smoke"
      }
    })
    const t = add(token("t1", 100, 2000))
    await SR5_EffectArea.checkIfTokenIsInTemplate(t)
    expect(created).toBe(0)
    expect(deleted).toBe(1)
  })

  // B5: one linked actor, two tokens: the effect is the actor's, it stays while one of them is inside
  it("a linked actor keeps the effect while its other token stays inside", async () => {
    actor.items.push({
      id: "fx", type: "itemEffect", system: {
        ownerItem: "Scene.S.MeasuredTemplate.smoke"
      }
    })
    const leaving = add(token("t1", 100, 2000))
    add(token("t2", 300, 300))
    await SR5_EffectArea.checkIfTokenIsInTemplate(leaving)
    expect(deleted).toBe(0)
    expect(actor.items).toHaveLength(1)
  })

  it("it loses the effect once neither token is inside", async () => {
    actor.items.push({
      id: "fx", type: "itemEffect", system: {
        ownerItem: "Scene.S.MeasuredTemplate.smoke"
      }
    })
    const leaving = add(token("t1", 100, 2000))
    add(token("t2", 3000, 3000))
    await SR5_EffectArea.checkIfTokenIsInTemplate(leaving)
    expect(deleted).toBe(1)
  })

  it("an unlinked token of the same actor does not hold the effect for another one", async () => {
    actor.items.push({
      id: "fx", type: "itemEffect", system: {
        ownerItem: "Scene.S.MeasuredTemplate.smoke"
      }
    })
    const leaving = add(token("t1", 100, 2000, "ganger", false))
    add(token("t2", 300, 300, "ganger", false))
    await SR5_EffectArea.checkIfTokenIsInTemplate(leaving)
    expect(deleted).toBe(1)
  })

  // B5 for an area spell: its effect is synchronised over all its templates, and now over all the actor's tokens
  it("a linked actor keeps a spell's effect while its other token stays inside", async () => {
    const SPELL = "Actor.mage.Item.spell"
    scene.templates = [{
      id: "spellTpl", uuid: "Scene.S.MeasuredTemplate.spellTpl", x: 0, y: 0, distance: 10, flags: {
        sr5: {
          itemHasEffect: true, itemUuid: SPELL
        }
      }
    }]
    actor.uuid = "Actor.glitch"
    actor.items.push({
      id: "spellFx", type: "itemEffect", system: {
        ownerItem: SPELL, ownerID: "spellTpl"
      }
    })
    actor.deleteEmbeddedDocuments = vi.fn(async () => {
      actor.items = []
    })
    const leaving = add(token("t1", 100, 2000))
    add(token("t2", 300, 300))
    await SR5_EffectArea.checkIfTokenIsInTemplate(leaving)
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
