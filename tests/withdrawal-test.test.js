import {
  describe, it, expect
} from "vitest"
import {
  withdrawalModifier, withdrawalOutcome, WITHDRAWAL_PENALTIES
} from "../modules/rolls/roll-helpers/addiction.js"
import {
  isWithdrawalRollOf
} from "../modules/system/deadlines.js"
import {
  cardFromGM
} from "../modules/system/card-rows.js"

describe("withdrawal test (SR5 p. 79, 417), review of Ursula", () => {
  it("takes no modifier by default: the book gives none (arbitrage de DjamZ)", () => {
    for (const level of ["mild", "moderate", "severe", "burnout"]) expect(withdrawalModifier(level, "none")).toBe(0)
  })

  it("takes the craving penalty as its modifier when the world asks for it", () => {
    expect(withdrawalModifier("mild", "craving")).toBe(-2)
    expect(withdrawalModifier("moderate", "craving")).toBe(-4)
    expect(withdrawalModifier("severe", "craving")).toBe(-4)
    expect(withdrawalModifier("burnout", "craving")).toBe(-6)
  })

  it("gives the craving on a failure, on the attributes of the addiction, and never a worse addiction", () => {
    expect(WITHDRAWAL_PENALTIES).toEqual({
      mild: -2, moderate: -4, severe: -4, burnout: -6
    })
    expect(withdrawalOutcome(1, 3, "moderate", "physiological")).toEqual({
      resisted: false, penalty: -4, attributes: "physical"
    })
    expect(withdrawalOutcome(0, 2, "burnout", "psychological")).toEqual({
      resisted: false, penalty: -6, attributes: "mental"
    })
    expect(withdrawalOutcome(3, 3, "mild", "both")).toEqual({
      resisted: true
    })
    //No level is ever written by the outcome: worsening is the addiction test's alone (p. 416)
    expect(Object.keys(withdrawalOutcome(0, 3, "mild", "physiological"))).not.toContain("level")
  })

  it("moves the deadline on the withdrawal roll of that addiction only, not on its addiction test", () => {
    const roll = (withdrawal, index = 0, name = "Jazz") => ({
      test: {
        type: "addictionTest"
      }, various: {
        withdrawal, addictionIndex: index, addictionName: name
      }
    })
    expect(isWithdrawalRollOf(roll(true), 0, "Jazz")).toBe(true)
    expect(isWithdrawalRollOf(roll(false), 0, "Jazz")).toBe(false)
    expect(isWithdrawalRollOf(roll(true, 1), 0, "Jazz")).toBe(false)
    expect(isWithdrawalRollOf(roll(true, 0, "Novacoke"), 0, "Jazz")).toBe(false)
    expect(isWithdrawalRollOf(undefined, 0, "Jazz")).toBe(false)
  })
})

describe("calendar cards are believed from a GM only (Ursula)", () => {
  it("ignores a card a player posted with the same flag", () => {
    expect(cardFromGM({
      author: {
        isGM: true
      }
    })).toBe(true)
    expect(cardFromGM({
      author: {
        isGM: false
      }
    })).toBe(false)
    expect(cardFromGM({
    })).toBe(false)
  })
})
