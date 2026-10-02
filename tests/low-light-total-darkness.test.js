import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// Low-light vision "treats partial and dim light as full light" (SR5 p. 177) and is "of no help in
// complete darkness" (SR5 p. 447). The roll already zeroes partial and dim light for it, but the
// actor still took two light rows off as well, so total darkness (row 3) came out at row 1 : -1
// instead of -6. These cases go through handleVision, as the roll window does.
const vision = () => ({
  hasVision: false, isActive: false, natural: false, augmented: false
})
const modifier = () => ({
  base: 0, value: 0, modifiers: []
})
const character = (metatype, setup = () => {}) => {
  const actor = {
    id: "a1",
    type: "actorPc",
    token: null,
    items: [],
    system: {
      biography: {
        metatype
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
          hasCyberEyes: false, replacedNaturalVision: []
        },
      },
    },
  }
  setup(actor.system.visions)
  SR5_CharacterUtility.applyRacialModifers(actor)
  SR5_CharacterUtility.handleVision(actor)
  return actor
}
const shot = (actor, light) => SR5_CombatHelpers.handleEnvironmentalModifiers({
  getFlag: (_scope, key) => (key === "environModLight" ? light : 0)
}, actor.system, false)
// Light rows of the table (SR5 p. 176) : full, partial, dim, total darkness
const atEachLight = (actor) => [0, 1, 2, 3].map((light) => shot(actor, light))

describe("low-light vision in total darkness", () => {
  let saved
  beforeEach(() => {
    saved = game.settings.get
    game.settings.get = () => false
  })
  afterEach(() => {
    game.settings.get = saved
  })

  it("leaves a human the whole light column", () => {
    expect(atEachLight(character("human"))).toEqual([0, -1, -3, -6])
  })

  it("gives an elf who has not pinned it nothing", () => {
    expect(atEachLight(character("elf"))).toEqual([0, -1, -3, -6])
  })

  it("cancels partial and dim light for an elf who uses it, and not total darkness", () => {
    const elf = character("elf", (v) => { v.lowLight.isActive = true })
    expect(atEachLight(elf)).toEqual([0, 0, 0, -6])
  })

  it("works the same when it comes from a vision enhancement", () => {
    const human = character("human", (v) => { v.lowLight.augmented = true; v.lowLight.isActive = true })
    expect(atEachLight(human)).toEqual([0, 0, 0, -6])
  })

  // Thermographic vision takes the light rows up one (SR5 p. 177) : it does help in the dark
  it("leaves thermographic vision its one row, darkness included", () => {
    const human = character("human", (v) => { v.thermographic.augmented = true; v.thermographic.isActive = true })
    expect(atEachLight(human)).toEqual([0, 0, -1, -3])
  })

  it("lets thermographic vision alone decide in the dark when both are in use", () => {
    const actor = character("human", (v) => {
      v.lowLight.augmented = true; v.lowLight.isActive = true
      v.thermographic.augmented = true; v.thermographic.isActive = true
    })
    expect(atEachLight(actor)).toEqual([0, 0, 0, -3])
  })
})
