import {
  describe, it, expect
} from "vitest"
import {
  WITHDRAWAL_INTERVALS, addMonths, addInterval, monthsLeft, withdrawalDue, rentCounts
} from "../modules/system/deadlines.js"
import {
  componentsToWorldTime
} from "../modules/system/calendar.js"

const DAY = 86400
const at = (year, month, dayOfMonth) => componentsToWorldTime({
  year, month, dayOfMonth
}, 2070)

describe("withdrawal tests (SR5 p. 79-80)", () => {
  it("fall once a month, every two weeks, every week, every day", () => {
    expect(WITHDRAWAL_INTERVALS.mild).toEqual({
      months: 1
    })
    expect(WITHDRAWAL_INTERVALS.moderate).toEqual({
      days: 14
    })
    expect(WITHDRAWAL_INTERVALS.severe).toEqual({
      days: 7
    })
    expect(WITHDRAWAL_INTERVALS.burnout).toEqual({
      days: 1
    })
  })

  it("only for an addiction that has a level", () => {
    expect(withdrawalDue({
      level: "moderate"
    })).toBe(true)
    expect(withdrawalDue({
      level: ""
    })).toBe(false)
    expect(withdrawalDue({
    })).toBe(false)
  })

  it("a mild one comes back on the same day of the next month", () => {
    expect(addInterval(at(2070, 0, 20), WITHDRAWAL_INTERVALS.mild, 2070)).toBe(at(2070, 1, 20))
    expect(addInterval(at(2070, 0, 20), WITHDRAWAL_INTERVALS.severe, 2070)).toBe(at(2070, 0, 20) + 7 * DAY)
  })
})

describe("months of rent paid in advance (SR5 p. 377)", () => {
  it("run out on the same day, n months later, across the year", () => {
    expect(addMonths(at(2070, 10, 5), 3, 2070)).toBe(at(2071, 1, 5))
  })

  it("fall on the last day of a shorter month: 31 January + 1 month = 28 or 29 February (Ursula)", () => {
    expect(addMonths(at(2070, 0, 30), 1, 2070)).toBe(at(2070, 1, 27))
    expect(addMonths(at(2072, 0, 30), 1, 2070)).toBe(at(2072, 1, 28))
    expect(addMonths(at(2070, 4, 30), 1, 2070)).toBe(at(2070, 5, 29))
  })

  it("count down as the clock moves", () => {
    const start = at(2070, 0, 1)
    const end = addMonths(start, 3, 2070)
    expect(monthsLeft(start, end, 2070)).toBe(3)
    expect(monthsLeft(start + DAY, end, 2070)).toBe(3)
    expect(monthsLeft(at(2070, 1, 1), end, 2070)).toBe(2)
    expect(monthsLeft(at(2070, 2, 15), end, 2070)).toBe(1)
    expect(monthsLeft(end, end, 2070)).toBe(0)
  })

  it("count only for a rented lifestyle with an end", () => {
    expect(rentCounts({
      rent: {
        bought: false, paidUntil: 100
      }
    })).toBe(true)
    expect(rentCounts({
      rent: {
        bought: true, paidUntil: 100
      }
    })).toBe(false)
    expect(rentCounts({
      rent: {
        bought: false, paidUntil: null
      }
    })).toBe(false)
  })
})
