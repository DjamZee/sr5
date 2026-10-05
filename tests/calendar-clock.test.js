import {
  describe, it, expect
} from "vitest"
import {
  formatClock, parseDateTimeInput, dateTimeInputValue, CLOCK_STEPS, createClockAdvancer
} from "../modules/interface/calendar-clock.js"
import {
  worldTimeToComponents
} from "../modules/system/calendar.js"

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

describe("Sixth World clock", () => {
  it("shows the weekday, the date and the time", () => {
    const text = formatClock(worldTimeToComponents(9, 2070), MONTHS, DAYS)
    expect(text).toEqual({
      date: "mercredi 1 janvier 2070", time: "00:00:09"
    })
  })

  it("keeps every quick click: three clicks of one minute before the server answers give three minutes", async () => {
    //A server that answers late: worldTime moves only once each write has come back
    const time = {
      worldTime: 0,
      set(t){
        return new Promise(resolve => setTimeout(() => {
          this.worldTime = t
          resolve(t)
        }, 10))
      },
    }
    const advance = createClockAdvancer(time)
    await Promise.all([advance(60), advance(60), advance(60)])
    expect(time.worldTime).toBe(180)
    //Once everything has landed, the next click starts from the clock again (a combat may have moved it)
    time.worldTime = 1000
    await advance(60)
    expect(time.worldTime).toBe(1060)
  })

  it("offers the GM one minute, ten minutes, one hour, one day and one week", () => {
    expect(CLOCK_STEPS.map(s => s.seconds)).toEqual([60, 600, 3600, 86400, 604800])
  })

  it("reads the date typed in \"go to\", leap day included", () => {
    const t = parseDateTimeInput("2080-02-29T22:15:30", 2070)
    expect(worldTimeToComponents(t, 2070)).toMatchObject({
      year: 2080, month: 1, dayOfMonth: 28, hour: 22, minute: 15, second: 30
    })
    //Without seconds, as some browsers send it
    expect(parseDateTimeInput("2070-01-02T00:00", 2070)).toBe(86400)
    expect(parseDateTimeInput("", 2070)).toBe(null)
  })

  it("fills \"go to\" with the current date, and reads it back unchanged", () => {
    const c = worldTimeToComponents(123456789, 2070)
    expect(parseDateTimeInput(dateTimeInputValue(c), 2070)).toBe(123456789)
  })
})
