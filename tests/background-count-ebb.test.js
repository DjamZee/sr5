import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// Aetherologie p. 34: a background count runs from -24 to +24. Below 0 it is a mana ebb or void,
// and its absolute value is what weighs on magic: an ebb is a penalty for everyone, whatever the
// alignment. The old code negated the rating for every non-aligned tradition, so -5 became +5.
describe("updateBackgroundCount, mana ebb (negative count)", () => {
  let saved
  const makeActor = () => ({
    id: "a1",
    system: {
      magic: {
        tradition: "hermetic", bgCount: {
          value: 0, base: 0, modifiers: []
        }
      }
    },
  })
  const putOnActiveScene = (flags) => {
    globalThis.game.scenes = {
      active: {
        flags: {
          sr5: flags
        }, tokens: [{
          actorId: "a1"
        }]
      }
    }
  }
  beforeEach(() => {
    saved = globalThis.game.scenes
  })
  afterEach(() => {
    globalThis.game.scenes = saved
  })

  it("gives a penalty, not a bonus, without alignment", () => {
    putOnActiveScene({
      backgroundCountValue: -5, backgroundCountAlignement: ""
    })
    const actor = makeActor()
    SR5_CharacterUtility.updateBackgroundCount(actor)
    expect(actor.system.magic.bgCount.value).toBe(-5)
  })

  it("ignores the alignment of an ebb, even the actor's own tradition", () => {
    putOnActiveScene({
      backgroundCountValue: -4, backgroundCountAlignement: "hermetic"
    })
    const actor = makeActor()
    SR5_CharacterUtility.updateBackgroundCount(actor)
    expect(actor.system.magic.bgCount.value).toBe(-4)
  })

  it("caps the count at 24 either way", () => {
    putOnActiveScene({
      backgroundCountValue: -30
    })
    const actor = makeActor()
    SR5_CharacterUtility.updateBackgroundCount(actor)
    expect(actor.system.magic.bgCount.value).toBe(-24)
  })
})
