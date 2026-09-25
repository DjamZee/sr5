import {
  describe, it, expect, afterEach
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// The cybereyes (1) to (4) of the companion compendiums carry three effects each that set
// 'system.visions.<vision>.natural' to false. Item effects are applied after the metatype, so
// they overruled the world setting : unticked, an elf wearing them still lost its low-light
// vision, and the sheet said its vision had not been replaced.
const vision = () => ({
  hasVision: false, isActive: false, natural: false, augmented: false
})
const modifier = () => ({
  base: 0, value: 0, modifiers: []
})

const elfWearingCompendiumCyberEyes = () => {
  const actor = {
    type: "actorPc",
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
  // prepareBaseData : the metatype first
  SR5_CharacterUtility.applyRacialModifers(actor)
  // prepareEmbeddedDocuments : then the effects of the compendium cybereyes
  for (const key of ["lowLight", "thermographic", "ultrasound"]) actor.system.visions[key].natural = false
  // prepareDerivedData
  SR5_CharacterUtility.handleVision(actor)
  return actor
}

const originalGet = game.settings.get
const replaceSetting = (value) => {
  game.settings.get = (scope, key) => key === "sr5CyberEyesReplaceNaturalVision" ? value : originalGet(scope, key)
}
afterEach(() => {
  game.settings.get = originalGet
})

describe("the cybereyes setting against the effects of the cybereyes item", () => {
  it("unticked, the elf keeps its low-light vision whatever the item says", () => {
    replaceSetting(false)
    const actor = elfWearingCompendiumCyberEyes()
    expect(actor.system.visions.cyberEyes.replacedNaturalVision).toEqual([])
    expect(actor.system.visions.lowLight.natural).toBe(true)
    expect(actor.system.visions.lowLight.hasVision).toBe(true)
  })

  it("ticked, the elf loses it and the sheet says so", () => {
    replaceSetting(true)
    const actor = elfWearingCompendiumCyberEyes()
    expect(actor.system.visions.cyberEyes.replacedNaturalVision).toEqual(["lowLight"])
    expect(actor.system.visions.lowLight.natural).toBe(false)
    expect(actor.system.visions.lowLight.hasVision).toBe(false)
  })

  it("does not hand a vision the metatype never had", () => {
    replaceSetting(false)
    const actor = elfWearingCompendiumCyberEyes()
    expect(actor.system.visions.thermographic.natural).toBe(false)
    expect(actor.system.visions.ultrasound.natural).toBe(false)
  })

  it("leaves item effects alone on a character without cybereyes", () => {
    replaceSetting(false)
    const actor = {
      system: {
        biography: {
          metatype: "elf"
        },
        visions: {
          lowLight: {
            natural: false
          }, cyberEyes: {
            hasCyberEyes: false, replacedNaturalVision: []
          }
        }
      }
    }
    SR5_CharacterUtility.settleMetatypeVision(actor)
    expect(actor.system.visions.lowLight.natural).toBe(false)
  })
})
