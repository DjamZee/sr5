import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// A player's jammer stands on the scene the players look at, while the GM, whose client applies the
// noise, is looking at another one. Jamming read canvas.tokens, so it found nothing and jammed nobody;
// and the end of the jam lifted nothing either. Both now read the jammer's own scene.
describe("SR5_EffectArea, jamming on a scene the GM is not looking at", () => {
  let saved, jammer, near, far, jamScene, gmScene

  const makeActor = (id, items = []) => ({
    id, uuid: `Actor.${id}`, name: id, isToken: false, items, effects: [],
    deleteEmbeddedDocuments: vi.fn(),
  })
  const makeToken = (id, actor, x) => ({
    id, actorId: actor.id, actorLink: true, actor, x, y: 0
  })
  // 1 pixel = 1 unit, so a token's x is its distance in units from the jammer at x = 0
  const makeScene = (tokens, units) => ({
    grid: {
      units, measurePath: ([a, b]) => ({
        distance: Math.hypot(a.x - b.x, a.y - b.y)
      })
    },
    tokens: Object.assign(tokens, {
      get: (id) => tokens.find(t => t.id === id)
    }),
  })

  beforeEach(() => {
    saved = {
      scenes: globalThis.game.scenes, user: globalThis.game.user, canvas: globalThis.canvas
    }
    jammer = makeActor("jammer", [{
      system: {
        type: "signalJam", ownerID: "jammer", value: 5
      }
    }])
    near = makeActor("near")
    far = makeActor("far")
    // Meters on the jammer's scene; the scene on the canvas measures in feet and draws no token of it
    jamScene = makeScene([makeToken("tJ", jammer, 0), makeToken("tN", near, 60), makeToken("tF", far, 150)], "m")
    gmScene = makeScene([], "ft")
    globalThis.game.scenes = [gmScene, jamScene]
    globalThis.game.user = {
      isGM: true
    }
    globalThis.canvas = {
      scene: gmScene, grid: gmScene.grid, tokens: {
        placeables: []
      }
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(jammer)
    vi.spyOn(SR5_EffectArea, "createJammedEffect").mockResolvedValue()
  })

  afterEach(() => {
    globalThis.game.scenes = saved.scenes
    globalThis.game.user = saved.user
    globalThis.canvas = saved.canvas
    vi.restoreAllMocks()
  })

  it("jams the devices within 100 m on the jammer's own scene", async () => {
    await SR5_EffectArea.onJamCreation("jammer")
    expect(SR5_EffectArea.createJammedEffect).toHaveBeenCalledTimes(1)
    expect(SR5_EffectArea.createJammedEffect).toHaveBeenCalledWith(jammer, near, 5)
  })

  it("does not jam twice a device already jammed by the same jammer", async () => {
    near.items.push({
      system: {
        type: "signalJammed", ownerID: "jammer"
      }
    })
    await SR5_EffectArea.onJamCreation("jammer")
    expect(SR5_EffectArea.createJammedEffect).not.toHaveBeenCalled()
  })

  it("lifts the noise of the jammed devices when the jam ends", async () => {
    near.items.push({
      id: "i1", system: {
        type: "signalJammed", ownerID: "jammer"
      }
    })
    near.effects.push({
      id: "e1", origin: "signalJammed"
    })
    await SR5_EffectArea.onJamEnd("jammer")
    expect(near.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["e1"])
    expect(near.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["i1"])
    expect(far.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it("measures a moving token on its own scene, not on the canvas", async () => {
    const check = vi.spyOn(SR5_EffectArea, "checkAuraJamming").mockResolvedValue()
    const moved = jamScene.tokens.get("tN")
    moved.parent = jamScene
    await SR5_EffectArea.tokenAura(moved)
    // 60 units of a scene in meters, not 60 feet of the canvas scene
    expect(check).toHaveBeenCalledWith(moved, jamScene.tokens.get("tJ"), 60)
  })
})
