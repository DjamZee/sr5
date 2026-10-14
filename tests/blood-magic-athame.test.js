import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  athameBatchPoints, athameStored, athameRoom, spendAthame, cannibalizeCost, cannibalizeDuration, DAY_SECONDS
} from "../modules/system/blood-magic-rules.js"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

describe("Athame (Street Grimoire p. 90)", () => {
  it("halves the points stored after 1 week, 1 month and 3 months", () => {
    const batch = {
      points: 8, time: 0
    }
    expect(athameBatchPoints(batch, 6 * DAY_SECONDS)).toBe(8)
    expect(athameBatchPoints(batch, 7 * DAY_SECONDS)).toBe(4)
    expect(athameBatchPoints(batch, 30 * DAY_SECONDS)).toBe(2)
    expect(athameBatchPoints(batch, 90 * DAY_SECONDS)).toBe(1)
    //The lower half is kept
    expect(athameBatchPoints({
      points: 5, time: 0
    }, 7 * DAY_SECONDS)).toBe(2)
  })

  it("stores at most its Force", () => {
    expect(athameRoom([{
      points: 4, time: 0
    }], 6, 0)).toBe(2)
    expect(athameRoom([{
      points: 8, time: 0
    }], 6, 0)).toBe(0)
  })

  it("spends the oldest points first, without halving them twice", () => {
    const later = 7 * DAY_SECONDS
    const left = spendAthame([{
      points: 8, time: 0
    }, {
      points: 2, time: later
    }], 1, later)
    expect(athameStored(left, later)).toBe(5)
    //At one month: 3 left from the first batch halve to 1, the second (a week old: 2) to 1
    expect(athameStored(left, 30 * DAY_SECONDS)).toBe(2)
  })
})

describe("Cannibalize (Street Grimoire p. 90)", () => {
  it("costs 3 points per attribute point, for Magic x initiate grade", () => {
    expect(cannibalizeCost({
      strength: 2, agility: 1
    })).toBe(9)
    expect(cannibalizeDuration(6, 2)).toBe(12)
  })

  it("is offered on the sheet, and the athame is a focus type", () => {
    expect(read("modules/config.js")).toMatch(/athame\s*: "SR5\.FocusAthame"/)
    expect(read("templates/actors/_partials/right-tabs/magic/metamagics.hbs")).toMatch(/data-sr5-blood="cannibalize"/)
    expect(read("modules/rolls/roll-test.js")).toMatch(/spendAthamePoints\(actor, spent\.fromAthame\)/)
  })
})
