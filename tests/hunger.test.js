import {
  describe, it, expect
} from "vitest"
import {
  monthSeconds, newHunger, hasten, lossesDue, essenceAfter, deadlineFrom, powerHastens, DAY, WEEK, LUNAR_MONTH_DAYS
} from "../modules/system/hunger.js"

// Essence Loss (SR5 p. 403)
describe("hunger of the Infected", () => {
  const month = monthSeconds(LUNAR_MONTH_DAYS)

  it("a lunar month is 29.5 days by default, and a bad setting falls back to it", () => {
    expect(month).toBe(29.5 * DAY)
    expect(monthSeconds(0)).toBe(month)
    expect(monthSeconds("x")).toBe(month)
    expect(monthSeconds(28)).toBe(28 * DAY)
  })

  it("loses one point per lunar month, none before", () => {
    const e = newHunger({
      actorUuid: "A", actorName: "a", now: 0, month
    })
    expect(lossesDue(e, month - 1, month).count).toBe(0)
    expect(lossesDue(e, month, month)).toEqual({
      count: 1, nextLoss: 2 * month
    })
    expect(lossesDue(e, 3 * month + 5, month).count).toBe(3)
  })

  it("each non-automatic power brings the loss one week closer", () => {
    const e = hasten(newHunger({
      actorUuid: "A", actorName: "a", now: 0, month
    }), 2)
    expect(e.nextLoss).toBe(month - 2 * WEEK)
    expect(lossesDue(e, month - 2 * WEEK, month).count).toBe(1)
  })

  it("Essence never goes below 0", () => {
    expect(essenceAfter(2, 1)).toBe(1)
    expect(essenceAfter(1, 3)).toBe(0)
  })

  it("at 0 it dies in Body + Willpower days", () => {
    expect(deadlineFrom(100, 4, 3)).toBe(100 + 7 * DAY)
  })

  it("only a power that needs an action hastens the loss", () => {
    expect(powerHastens({
      type: "itemPower", system: {
        actionType: "complex"
      }
    })).toBe(true)
    expect(powerHastens({
      type: "itemPower", system: {
        actionType: "automatic"
      }
    })).toBe(false)
    expect(powerHastens({
      type: "itemPower", system: {
        actionType: "permanent"
      }
    })).toBe(false)
    expect(powerHastens({
      type: "itemSpell", system: {
        actionType: "complex"
      }
    })).toBe(false)
  })
})
