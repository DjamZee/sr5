import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// A scene whose background count was never set stores null, or no rating at all, and the old test
// `!== 0` let both through : every actor on the active scene got an empty "Background Count"
// modifier of 0. Only a real rating may reach the actor (SR5 p. 315).
describe("SR5_CharacterUtility.updateBackgroundCount", () => {
  let saved

  const makeActor = () => ({
    id: "a1",
    system: {
      magic: {
        tradition: "hermetic",
        bgCount: {
          value: 0, base: 0, modifiers: []
        },
      },
    },
  })

  const putOnActiveScene = (flags) => {
    globalThis.game.scenes = {
      active: {
        flags: {
          sr5: flags
        },
        tokens: [{
          actorId: "a1"
        }],
      },
    }
  }

  beforeEach(() => {
    saved = globalThis.game.scenes
  })

  afterEach(() => {
    globalThis.game.scenes = saved
  })

  it.each([
    ["null", {
      backgroundCountValue: null
    }],
    ["missing", {
      environModLight: 0
    }],
    ["an empty string", {
      backgroundCountValue: ""
    }],
  ])("adds no modifier when the rating is %s", (_label, flags) => {
    putOnActiveScene(flags)
    const actor = makeActor()
    SR5_CharacterUtility.updateBackgroundCount(actor)
    expect(actor.system.magic.bgCount.modifiers).toEqual([])
    expect(actor.system.magic.bgCount.value).toBe(0)
  })

  it("still applies a real rating, against an actor of another tradition", () => {
    putOnActiveScene({
      backgroundCountValue: 3, backgroundCountAlignement: "shamanic"
    })
    const actor = makeActor()
    SR5_CharacterUtility.updateBackgroundCount(actor)
    expect(actor.system.magic.bgCount.modifiers).toHaveLength(1)
    expect(actor.system.magic.bgCount.value).toBe(-3)
  })

  it("reads a rating stored as text", () => {
    putOnActiveScene({
      backgroundCountValue: "2", backgroundCountAlignement: "hermetic"
    })
    const actor = makeActor()
    SR5_CharacterUtility.updateBackgroundCount(actor)
    expect(actor.system.magic.bgCount.value).toBe(2)
  })
})
