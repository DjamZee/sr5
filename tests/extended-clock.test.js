import {
  describe, it, expect
} from "vitest"
import {
  pendingIntervals, timeAfter
} from "../modules/system/extended-clock.js"
import {
  componentsToWorldTime
} from "../modules/system/calendar.js"

describe("extended tests move the clock (SR5 p. 50, 207-208)", () => {
  it("offers the intervals spent and not yet put on the clock", () => {
    expect(pendingIntervals({
      interval: "hour", intervalValue: 3, clockAdvanced: 0
    })).toBe(3)
    expect(pendingIntervals({
      interval: "hour", intervalValue: 3, clockAdvanced: 2
    })).toBe(1)
    expect(pendingIntervals({
      interval: "hour", intervalValue: 3, clockAdvanced: 3
    })).toBe(0)
  })

  it("offers nothing on a card rolled before the calendar, whose time is long spent", () => {
    expect(pendingIntervals({
      interval: "hour", intervalValue: 5
    })).toBe(0)
  })

  it("offers nothing without an interval of time", () => {
    expect(pendingIntervals({
      interval: "", intervalValue: 2
    })).toBe(0)
    expect(pendingIntervals({
      interval: "special", intervalValue: 2
    })).toBe(0)
  })

  it("moves the clock by hours, days, Combat Turns of 3 s", () => {
    expect(timeAfter(100, 2, "hour", 2070)).toBe(100 + 7200)
    expect(timeAfter(0, 3, "day", 2070)).toBe(3 * 86400)
    expect(timeAfter(0, 4, "combatTurn", 2070)).toBe(12)
  })

  it("moves the clock by calendar months", () => {
    const start = componentsToWorldTime({
      year: 2070, month: 11, dayOfMonth: 10
    }, 2070)
    expect(timeAfter(start, 2, "month", 2070)).toBe(componentsToWorldTime({
      year: 2071, month: 1, dayOfMonth: 10
    }, 2070))
  })
})
