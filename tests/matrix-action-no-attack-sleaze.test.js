import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  lacksLimitAttribute
} from "../modules/rolls/roll-prepare-case/rollData-MatrixAction.js"

// SR5 p. 227: only decks and hosts have Attack and Sleaze. A rigger on an RCC had a limit of 0 on Brute Force,
// which the roll read as no limit (séance de DjamZ du 09/10)
const persona = (attack, sleaze, extra = {
}) => ({
  system: {
    matrix: {
      attributes: {
        attack: {
          value: attack
        }, sleaze: {
          value: sleaze
        }
      }
    }, ...extra
  }
})
const action = linkedAttribute => ({
  limit: {
    linkedAttribute
  }
})

describe("an action limited by an attribute the persona lacks", () => {
  it("is refused to an RCC or a commlink, for Attack and Sleaze", () => {
    expect(lacksLimitAttribute(action("attack"), persona(0, 0))).toBe(true)
    expect(lacksLimitAttribute(action("sleaze"), persona(0, 0))).toBe(true)
  })
  it("goes with a deck", () => {
    expect(lacksLimitAttribute(action("attack"), persona(5, 4))).toBe(false)
    expect(lacksLimitAttribute(action("sleaze"), persona(5, 4))).toBe(false)
  })
  it("never concerns Data Processing or Firewall actions", () => {
    expect(lacksLimitAttribute(action("dataProcessing"), persona(0, 0))).toBe(false)
    expect(lacksLimitAttribute(action("firewall"), persona(0, 0))).toBe(false)
  })
  it("lets an AI with its Depth active emulate the attribute (Data Trails p. 157)", () => {
    expect(lacksLimitAttribute(action("attack"), persona(0, 0, {
      activeSpecialAttribute: "depth"
    }))).toBe(false)
  })
  it("the rule lock lifted, tells the gamemaster the roll went with no limit, not that it scores no hit", () => {
    const read = path => readFileSync(new URL(path, import.meta.url), "utf8")
    expect(read("../modules/rolls/roll-prepare-case/rollData-MatrixAction.js")).toContain('liftedKey: "SR5.WARN_NoAttackSleazeLifted"')
    for (const lang of ["fr", "en"]) {
      const text = JSON.parse(read(`../lang/${lang}.json`))["SR5.WARN_NoAttackSleazeLifted"]
      expect(text).toContain("{attribute}")
      expect(text).toMatch(lang === "fr" ? /sans limite/ : /no limit/)
    }
  })
  it("says nothing of a persona whose attribute is not known", () => {
    expect(lacksLimitAttribute(action("attack"), {
      system: {
      }
    })).toBe(false)
  })
})
