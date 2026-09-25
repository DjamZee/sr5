import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// The vision was given with a find on canvas.scene : a linked actor with two tokens had only the
// first one served, and a token on a scene that was not displayed was never updated.
describe("SR5_CharacterUtility vision on every token of an actor", () => {
  let saved

  const makeToken = (id, actorId, actorLink) => ({
    id,
    actorId,
    actorLink,
    sight: {
      visionMode: "basic", range: 0, enabled: true
    },
    detectionModes: [],
    update: vi.fn(),
  })
  const astralActor = (token = null) => ({
    id: "a1",
    token,
    system: {
      visions: {
        astral: {
          isActive: true
        }
      }
    },
  })

  beforeEach(() => {
    saved = {
      scenes: globalThis.game.scenes, scene: globalThis.canvas.scene, get: globalThis.game.settings.get, isNumeric: Number.isNumeric
    }
    globalThis.game.settings.get = (_system, key) => (key === "sr5VisionRangeAstral" ? 300 : 0)
    Number.isNumeric ??= (n) => Number.isFinite(Number(n))
    vi.spyOn(SR5_EntityHelpers, "addEffectToActor").mockResolvedValue()
  })

  afterEach(() => {
    globalThis.game.scenes = saved.scenes
    globalThis.canvas.scene = saved.scene
    globalThis.game.settings.get = saved.get
    Number.isNumeric = saved.isNumeric
    vi.restoreAllMocks()
  })

  it("serves both linked tokens of the viewed scene and the one on a scene not displayed", async () => {
    const first = makeToken("t1", "a1", true), second = makeToken("t2", "a1", true), elsewhere = makeToken("t3", "a1", true)
    const viewed = {
      tokens: [first, second]
    }
    globalThis.game.scenes = [viewed, {
      tokens: [elsewhere]
    }]
    globalThis.canvas.scene = viewed

    await SR5_CharacterUtility.handleAstralVision(astralActor())

    for (let token of [first, second, elsewhere]) {
      expect(token.update).toHaveBeenCalledTimes(1)
      expect(token.update.mock.calls[0][0].sight.range).toBe(300)
    }
  })

  it("leaves alone the unlinked tokens and the tokens of another actor", async () => {
    const unlinked = makeToken("t1", "a1", false), other = makeToken("t2", "b2", true)
    globalThis.game.scenes = [{
      tokens: [unlinked, other]
    }]

    await SR5_CharacterUtility.handleAstralVision(astralActor())

    expect(unlinked.update).not.toHaveBeenCalled()
    expect(other.update).not.toHaveBeenCalled()
  })

  it("serves a synthetic actor through its own token, even with no scene displayed", async () => {
    const own = makeToken("t1", "a1", false), sibling = makeToken("t2", "a1", false)
    globalThis.game.scenes = [{
      tokens: [own, sibling]
    }]
    globalThis.canvas.scene = null

    await SR5_CharacterUtility.handleAstralVision(astralActor(own))

    expect(own.update).toHaveBeenCalledTimes(1)
    expect(sibling.update).not.toHaveBeenCalled()
  })
})
