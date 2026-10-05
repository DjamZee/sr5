import {
  describe, it, expect
} from "vitest"
import {
  worldTimeToComponents, componentsToWorldTime, durationToSeconds, isLeapYear, thirdPartyCalendarModule,
  combatRoundSeconds, roundTimeFor,sr5CalendarConfig, DEFAULT_START_YEAR, COMBAT_ROUND_SECONDS
} from "../modules/system/calendar.js"

const DAY = 86400

describe("Sixth World calendar", () => {
  it("starts at midnight, 1 January 2070 by default", () => {
    expect(DEFAULT_START_YEAR).toBe(2070)
    const c = worldTimeToComponents(0, 2070)
    expect(c).toMatchObject({
      year: 2070, month: 0, dayOfMonth: 0, hour: 0, minute: 0, second: 0
    })
  })

  it("knows the real leap years: 2072 and 2080 are, 2100 is not", () => {
    expect(isLeapYear(2072)).toBe(true)
    expect(isLeapYear(2080)).toBe(true)
    expect(isLeapYear(2100)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    //Day 59 of 2072 is 29 February
    expect(worldTimeToComponents(59 * DAY, 2072)).toMatchObject({
      year: 2072, month: 1, dayOfMonth: 28, leapYear: true
    })
    //Same day in 2070 is 1 March
    expect(worldTimeToComponents(59 * DAY, 2070)).toMatchObject({
      month: 2, dayOfMonth: 0, leapYear: false
    })
  })

  it("crosses the year after 365 days, or 366 in a leap year", () => {
    expect(worldTimeToComponents(365 * DAY, 2070).year).toBe(2071)
    expect(worldTimeToComponents(365 * DAY, 2072)).toMatchObject({
      year: 2072, month: 11, dayOfMonth: 30
    })
    expect(worldTimeToComponents(366 * DAY, 2072).year).toBe(2073)
  })

  it("gives the weekday from Monday: 1 January 2080 is a Monday", () => {
    expect(worldTimeToComponents(0, 2080).dayOfWeek).toBe(0)
    //1 January 2070 is a Wednesday
    expect(worldTimeToComponents(0, 2070).dayOfWeek).toBe(2)
  })

  it("converts a date back to world time, round trip", () => {
    const t = componentsToWorldTime({
      year: 2075, month: 6, dayOfMonth: 13, hour: 22, minute: 5, second: 9
    }, 2070)
    expect(worldTimeToComponents(t, 2070)).toMatchObject({
      year: 2075, month: 6, dayOfMonth: 13, hour: 22, minute: 5, second: 9
    })
    expect(componentsToWorldTime({
      year: 2070, day: 1
    }, 2070)).toBe(DAY)
  })

  it("reads a duration without a year as seconds", () => {
    expect(durationToSeconds({
      hour: 1, minute: 10
    })).toBe(4200)
    expect(durationToSeconds({
      day: 7
    })).toBe(7 * DAY)
  })

  it("advances 3 seconds per Combat Turn (SR5 p. 51), none when the setting is off", () => {
    expect(COMBAT_ROUND_SECONDS).toBe(3)
    expect(combatRoundSeconds(true)).toBe(3)
    expect(combatRoundSeconds(false)).toBe(0)
  })

  it("leaves the combat time to a third-party calendar module, so no turn counts twice", () => {
    expect(roundTimeFor(true, "seasons-and-stars", 6)).toBe(6)
    expect(roundTimeFor(false, "seasons-and-stars", 0)).toBe(0)
    expect(roundTimeFor(true, null, 0)).toBe(3)
  })

  it("steps aside when a third-party calendar module is active", () => {
    const modules = new Map([["seasons-and-stars", {
      active: true
    }], ["dice-so-nice", {
      active: true
    }]])
    expect(thirdPartyCalendarModule(modules)).toBe("seasons-and-stars")
    expect(thirdPartyCalendarModule(new Map([["seasons-and-stars", {
      active: false
    }]]))).toBe(null)
  })

  it("builds a Foundry calendar config with twelve months and seven days", () => {
    const cfg = sr5CalendarConfig()
    expect(cfg.months.values).toHaveLength(12)
    expect(cfg.days.values).toHaveLength(7)
    expect(cfg.months.values[1]).toMatchObject({
      days: 28, leapDays: 29
    })
  })
})
