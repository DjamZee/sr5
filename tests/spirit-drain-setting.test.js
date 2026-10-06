import {
  describe, it, expect, beforeAll, afterEach, vi
} from "vitest"

// SR5 p. 403 (Innate Spell): critters and spirits resist Drain with Intuition or Charisma, at the gamemaster's
// discretion. A world setting picks the attribute added to Willpower, Charisma by default (DjamZ's ruling, 06/10).

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

let setting
beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})

afterEach(() => {
  vi.restoreAllMocks()
  setting = undefined
})

const value = (base = 0) => ({
  base, value: base, modifiers: []
})
const pools = () => new Proxy({
}, {
  get: (target, key) => (target[key] ??= {
    ...value(), dicePool: 0, max: 0, linkedAttribute: ""
  })
})
const attribute = (n) => ({
  natural: value(n), augmented: value(n)
})

function spirit({
  willpower = 4, intuition = 2, charisma = 6
} = {
}) {
  const attributes = {
  }
  for (const key of ["body", "agility", "reaction", "strength", "logic"]) attributes[key] = attribute(4)
  Object.assign(attributes, {
    willpower: attribute(willpower), intuition: attribute(intuition), charisma: attribute(charisma)
  })
  return {
    type: "actorSpirit",
    system: {
      type: "air",
      force: value(4),
      attributes,
      specialAttributes: {
        magic: attribute(4)
      },
      skills: new Proxy({
      }, {
        get: (target, key) => (target[key] ??= {
          rating: value()
        })
      }),
      magic: Object.assign(pools(), {
        magicType: "", initiationGrade: 0, metamagics: pools(), boundedSpirit: {
          max: 0
        }
      }),
    }
  }
}

function drainPool(actor) {
  vi.spyOn(SR5_CharacterUtility, "applyPenalty").mockImplementation(() => {})
  globalThis.game.settings = {
    get: (scope, key) => (key === "sr5SpiritDrainAttribute" ? setting : undefined)
  }
  SR5_CharacterUtility.setSpiritMagicType(actor)
  SR5_CharacterUtility.updateAstralValues(actor)
  return actor.system.magic.drainResistance.dicePool
}

describe("Drain of a spirit's innate spell (SR5 p. 403)", () => {
  it("adds Charisma to Willpower by default", () => {
    setting = "charisma"
    expect(drainPool(spirit())).toBe(10)
  })

  it("adds Intuition to Willpower when the world setting asks for it", () => {
    setting = "intuition"
    expect(drainPool(spirit())).toBe(6)
  })

  it("falls back on Charisma when the setting is not registered or holds anything else", () => {
    setting = undefined
    expect(drainPool(spirit())).toBe(10)
    setting = "logic"
    expect(drainPool(spirit())).toBe(10)
  })
})
