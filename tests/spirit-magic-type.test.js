import {
  describe, it, expect, beforeAll, afterEach, vi
} from "vitest"
import {
  readFileSync
} from "node:fs"

// A spirit is a magical being: its astral values (astral damage, astral defense, drain resistance) are
// computed for magicType "spirit". V12's template.json stored it; the V13 shared magic schema starts
// empty and nothing filled it, so every spirit created since dealt 0 astral damage (SR5 p. 315).

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})

afterEach(() => {
  vi.restoreAllMocks()
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

function spirit(type, force) {
  const attributes = {
  }
  for (const key of ["body", "agility", "reaction", "strength", "willpower", "logic", "intuition", "charisma"]) attributes[key] = attribute(force)
  return {
    type: "actorSpirit",
    system: {
      type,
      force: value(force),
      attributes,
      specialAttributes: {
        magic: attribute(force)
      },
      skills: new Proxy({
      }, {
        get: (target, key) => (target[key] ??= {
          rating: value()
        })
      }),
      // As a spirit created in V13 stores it
      magic: Object.assign(pools(), {
        magicType: "", initiationGrade: 0, metamagics: pools(), boundedSpirit: {
          max: 0
        }
      }),
    }
  }
}

function prepared(actor) {
  vi.spyOn(SR5_CharacterUtility, "applyPenalty").mockImplementation(() => {})
  SR5_CharacterUtility.setSpiritMagicType(actor)
  SR5_CharacterUtility.updateAstralValues(actor)
  return actor.system.magic
}

describe("spirits are magical beings", () => {
  it("get magicType spirit whatever their source holds", () => {
    expect(prepared(spirit("air", 4)).magicType).toBe("spirit")
  })

  it("deal their Force in astral damage, 1 for a homunculus (SR5 p. 315)", () => {
    expect(prepared(spirit("air", 4)).astralDamage.value).toBe(4)
    expect(prepared(spirit("homunculus", 4)).astralDamage.value).toBe(1)
  })

  it("get an astral defense and a drain resistance (WIL + CHA)", () => {
    const magic = prepared(spirit("fire", 5))
    expect(magic.astralDefense.dicePool).toBe(10)
    expect(magic.drainResistance.dicePool).toBe(10)
  })

  it("the actor preparation sets it for every spirit", () => {
    const entity = readFileSync("modules/entities/actors/entityActor.js", "utf8")
    const base = entity.slice(entity.indexOf("prepareBaseData() {"))
    const spiritCase = base.slice(base.indexOf('case "actorSpirit":'), base.indexOf("break", base.indexOf('case "actorSpirit":')))
    expect(spiritCase).toContain("setSpiritMagicType(actor)")
  })
})
