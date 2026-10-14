import {
  describe, it, expect
} from "vitest"
import {
  WITHDRAWAL_INTERVALS, addMonths, addInterval, monthsLeft, withdrawalDue, rentCounts, rentStart, rentDebitState
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

  it("with no month paid in advance and no date chosen, nothing is claimed at the first minute of play (lot 10)", () => {
    const now = at(2070, 3, 10)
    expect(rentStart(0, now, 2070, true)).toBe(null)
    expect(rentStart(undefined, now, 2070, true)).toBe(null)
    expect(rentStart(2, now, 2070, true)).toBe(at(2070, 5, 10))
    // A lifestyle on a GM's NPC is not claimed
    expect(rentStart(0, now, 2070, false)).toBe(null)
    expect(rentStart(2, now, 2070, false)).toBe(at(2070, 5, 10))
  })

  it("run from the first debit the player chose, before or after the months paid (lot 10)", () => {
    const now = at(2070, 3, 10)
    expect(rentStart(0, now, 2070, true, at(2070, 4, 1))).toBe(at(2070, 4, 1))
    expect(rentStart(2, now, 2070, true, at(2070, 4, 1))).toBe(at(2070, 4, 1))
    // A date already past is due at once
    expect(rentStart(0, now, 2070, true, at(2070, 2, 1))).toBe(at(2070, 2, 1))
    expect(rentStart(0, now, 2070, true, null)).toBe(null)
  })

  it("the first debit: the player chooses it before the rent starts, the GM corrects it at any time (lot 10)", () => {
    const waiting = {
      bought: false, paidUntil: null, firstDebit: null, duration: 0
    }
    expect(rentDebitState(waiting, {
      isOwner: true
    })).toEqual({
      time: null, started: false, editable: true
    })
    const chosen = {
      ...waiting, firstDebit: at(2070, 4, 1)
    }
    expect(rentDebitState(chosen, {
      isOwner: true
    }).time).toBe(at(2070, 4, 1))
    const running = {
      ...chosen, paidUntil: at(2070, 5, 1)
    }
    expect(rentDebitState(running, {
      isOwner: true
    })).toEqual({
      time: at(2070, 5, 1), started: true, editable: false
    })
    expect(rentDebitState(running, {
      isGM: true
    }).editable).toBe(true)
    // Another player sees it without changing it; a bought lifestyle has no rent
    expect(rentDebitState(waiting).editable).toBe(false)
    expect(rentDebitState({
      ...waiting, bought: true
    }, {
      isGM: true
    })).toBe(null)
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
