import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// SR5 p. 176: "only the most penalizing condition counts [...] If several are equally severe, raise the
// modifier one row. Note that range is an environmental modifier." The range line was added on top of the
// environment line instead of joining its columns: medium range (-1) in moderate fog (-3) came out at -4.
// The environment keeps its line; the range line carries what range adds, so the sum is the book's figure.
function scene(flags) {
  return {
    id: "s", getFlag: (_module, key) => flags[key] ?? 0
  }
}
function acteur() {
  const value = {
    value: 0
  }
  return {
    itemsProperties: {
      environmentalMod: {
        visibility: value, light: value, glare: value, wind: value
      }
    },
    visions: {
      lowLight: {
        isActive: false
      }
    },
  }
}
// Rows: visibility 2 is moderate fog (-3)
const SHORT = 0, MEDIUM = 1, LONG = 2, EXTREME = 3

// Total of the two lines of a ranged attack, as the roll dialog adds them up
function total(flags, rangeLine) {
  const columns = SR5_CombatHelpers.environmentalColumns(scene(flags), acteur(), false)
  const environment = SR5_CombatHelpers.handleEnvironmentalModifiers(scene(flags), acteur(), false)
  return {
    environment, range: SR5_CombatHelpers.rangeModifierWithEnvironment(rangeLine, columns), sum: environment + SR5_CombatHelpers.rangeModifierWithEnvironment(rangeLine, columns)
  }
}

describe("range in the environmental modifiers (SR5 p. 176)", () => {
  it("range alone: the range row of the table", () => {
    expect(total({
    }, SHORT).sum).toBe(0)
    expect(total({
    }, MEDIUM).sum).toBe(-1)
    expect(total({
    }, LONG).sum).toBe(-3)
    expect(total({
    }, EXTREME).sum).toBe(-6)
  })

  it("environment alone, at short range: the environment line, nothing from range", () => {
    const r = total({
      environModVisibility: 2
    }, SHORT)
    expect(r).toEqual({
      environment: -3, range: 0, sum: -3
    })
  })

  it("a lesser range does not add up with the environment", () => {
    // moderate fog (-3) and medium range (-1): -3, not -4
    expect(total({
      environModVisibility: 2
    }, MEDIUM).sum).toBe(-3)
  })

  it("a range as severe as the environment raises it one row", () => {
    // moderate fog (-3) and long range (-3): -6
    const r = total({
      environModVisibility: 2
    }, LONG)
    expect(r).toEqual({
      environment: -3, range: -3, sum: -6
    })
    // light fog (-1) and medium range (-1): -3, where the two lines gave -2
    expect(total({
      environModVisibility: 1
    }, MEDIUM).sum).toBe(-3)
  })

  it("a worse range takes over", () => {
    // light fog (-1) and extreme range (-6): -6, where the two lines gave -7
    expect(total({
      environModVisibility: 1
    }, EXTREME).sum).toBe(-6)
  })

  it("never goes past the -10 row", () => {
    expect(total({
      environModVisibility: 3
    }, EXTREME).sum).toBe(-10)
    expect(total({
      environModVisibility: 4
    }, EXTREME).sum).toBe(-10)
  })

  it("without the attack's columns, the range line is the bare range row, as before", () => {
    expect(SR5_CombatHelpers.rangeModifierWithEnvironment(LONG, undefined)).toBe(-3)
    expect(SR5_CombatHelpers.rangeModifierWithEnvironment(-1, undefined)).toBe(0)
  })

  it("melee (p. 188) and the defense against a shot read the environment alone, unchanged", () => {
    const flags = {
      environModLight: 2, environModWind: 2
    }
    // melee: Light and Visibility columns only, no range: dim light alone
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene(flags), acteur(), true, undefined, true)).toBe(-3)
    // defense (rollData-Defense: noWind): no range column either
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene(flags), acteur(), true)).toBe(-3)
    // the attacker's ranged roll keeps the wind: dim light and strong wind equally severe, -6
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene(flags), acteur(), false)).toBe(-6)
  })
})
