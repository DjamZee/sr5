import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// An elf with its low-light vision pinned puts cybereyes in : the vision is gone, but it stayed
// 'isActive'. No pin showed as active, the tokens kept the vision, and a shot in the dark ignored
// its light penalty, since the roll reads 'lowLight.isActive' alone.
const vision = () => ({
  hasVision: false, isActive: false, natural: false, augmented: false
})
const modifier = () => ({
  base: 0, value: 0, modifiers: []
})
const elfWhoLostItsPinnedVision = () => {
  const actor = {
    id: "a1",
    type: "actorPc",
    token: null,
    items: [],
    system: {
      biography: {
        metatype: "elf"
      },
      initiatives: {
        astralInit: {
          isActive: false
        }
      },
      itemsProperties: {
        environmentalMod: {
          visibility: modifier(), light: modifier(), glare: modifier(), wind: modifier(), range: modifier()
        }
      },
      visions: {
        astral: vision(), lowLight: vision(), thermographic: vision(), ultrasound: vision(),
        hasActiveVision: false,
        cyberEyes: {
          hasCyberEyes: true, replacedNaturalVision: []
        },
      },
    },
  }
  actor.system.visions.lowLight.isActive = true
  SR5_CharacterUtility.applyRacialModifers(actor)
  SR5_CharacterUtility.handleVision(actor)
  return actor
}
const darkScene = {
  getFlag: (_scope, key) => (key === "environModLight" ? 3 : 0)
}
const makeToken = (visionMode) => ({
  actorId: "a1", actorLink: true, sight: {
    visionMode, range: 0, enabled: true
  }, detectionModes: [], update: vi.fn(),
})

describe("a pinned vision the character loses", () => {
  let saved
  beforeEach(() => {
    saved = {
      get: game.settings.get, scenes: game.scenes
    }
    game.settings.get = (_scope, key) => key === "sr5CyberEyesReplaceNaturalVision"
  })
  afterEach(() => {
    game.settings.get = saved.get
    game.scenes = saved.scenes
    vi.restoreAllMocks()
  })

  it("is no longer in use, so the natural vision pin shows again", () => {
    const actor = elfWhoLostItsPinnedVision()
    expect(actor.system.visions.lowLight.hasVision).toBe(false)
    expect(actor.system.visions.lowLight.isActive).toBe(false)
    expect(actor.system.visions.hasActiveVision).toBe(false)
  })

  it("no longer cancels the light penalty of a roll", () => {
    const actor = elfWhoLostItsPinnedVision()
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(darkScene, actor.system, true)).toBeLessThan(0)
  })

  it("comes back in use when the character gets it back", () => {
    game.settings.get = () => false
    const actor = elfWhoLostItsPinnedVision()
    expect(actor.system.visions.lowLight.isActive).toBe(true)
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(darkScene, actor.system, true)).toBe(0)
  })

  it("is taken off the tokens that still show it, and only those", async () => {
    const actor = elfWhoLostItsPinnedVision()
    const stale = makeToken("lowLight")
    game.scenes = new Set([{
      tokens: [stale]
    }])
    await SR5_CharacterUtility.refreshVisionOfTokens(actor)
    expect(stale.update).toHaveBeenCalledTimes(1)
    expect(stale.update.mock.calls[0][0].sight.visionMode).toBe("basic")

    const served = makeToken("basic")
    game.scenes = new Set([{
      tokens: [served]
    }])
    await SR5_CharacterUtility.refreshVisionOfTokens(actor)
    expect(served.update).not.toHaveBeenCalled()
  })
})
