import {
  describe, it, expect
} from "vitest"
import {
  isTimedEffect, expiryTime, sortExpiries, stampEffectStart, onPreCreateItem
} from "../modules/system/effect-expiry.js"
import {
  componentsToWorldTime
} from "../modules/system/calendar.js"

const fx = (system, flags = {
}) => ({
  system, flags
})

describe("effects counted on the world clock", () => {
  it("counts minutes, hours, days, weeks and months, not combat durations", () => {
    for (const t of ["minute", "hour", "day", "week", "month"]) expect(isTimedEffect({
      durationType: t, duration: 1
    })).toBe(true)
    for (const t of ["round", "action", "initiativePass", "permanent", "sustained", "reboot", "special"]) expect(isTimedEffect({
      durationType: t, duration: 1
    })).toBe(false)
    expect(isTimedEffect({
      durationType: "hour", duration: 0
    })).toBe(false)
  })

  it("ends an effect at its start plus its duration", () => {
    expect(expiryTime({
      durationType: "minute", duration: 10, startTime: 100
    }, 2070)).toBe(700)
    expect(expiryTime({
      durationType: "hour", duration: 3, startTime: 0
    }, 2070)).toBe(10800)
    expect(expiryTime({
      durationType: "week", duration: 1, startTime: 0
    }, 2070)).toBe(604800)
  })

  it("counts a month as a calendar month, across the year", () => {
    const start = componentsToWorldTime({
      year: 2070, month: 10, dayOfMonth: 14
    }, 2070)
    expect(expiryTime({
      durationType: "month", duration: 3, startTime: start
    }, 2070)).toBe(componentsToWorldTime({
      year: 2071, month: 1, dayOfMonth: 14
    }, 2070))
  })

  it("ends a month effect on the last day of a shorter month (Ursula)", () => {
    const start = componentsToWorldTime({
      year: 2070, month: 0, dayOfMonth: 30
    }, 2070)
    expect(expiryTime({
      durationType: "month", duration: 1, startTime: start
    }, 2070)).toBe(componentsToWorldTime({
      year: 2070, month: 1, dayOfMonth: 27
    }, 2070))
  })

  it("never ends an effect that has no start", () => {
    expect(expiryTime({
      durationType: "hour", duration: 1, startTime: null
    }, 2070)).toBe(null)
  })

  it("reports an effect once when the clock passes its end, and again after a rewind", () => {
    const due = fx({
      durationType: "minute", duration: 1, startTime: 0
    })
    const later = fx({
      durationType: "hour", duration: 1, startTime: 0
    })
    const told = fx({
      durationType: "minute", duration: 1, startTime: 0
    }, {
      sr5: {
        expiryNotified: true
      }
    })
    const {
      expired, rewound
    } = sortExpiries([due, later, told], 60, 2070)
    expect(expired.map(e => e.effect)).toEqual([due])
    expect(rewound).toEqual([])
    expect(sortExpiries([told], 30, 2070).rewound).toEqual([told])
  })

  it("stamps a new timed effect with the world time, and leaves the others alone", () => {
    const make = (system, parent = {
      name: "actor"
    }) => ({
      type: "itemEffect", parent, system: {
        ...system
      }, updateSource(d){
        this.system.startTime = d["system.startTime"]
      }
    })
    const timed = make({
      durationType: "hour", duration: 2, startTime: null
    })
    expect(stampEffectStart(timed, 5000)).toBe(true)
    expect(timed.system.startTime).toBe(5000)
    const round = make({
      durationType: "round", duration: 2, startTime: null
    })
    expect(stampEffectStart(round, 5000)).toBe(false)
    //Copied from an effect that carried a date: it starts again, now
    const copied = make({
      durationType: "hour", duration: 2, startTime: 10
    })
    expect(stampEffectStart(copied, 5000)).toBe(true)
    expect(copied.system.startTime).toBe(5000)
  })

  it("never dates an effect of the world, which would be born expired once put on an actor (Ursula)", () => {
    const worldEffect = {
      type: "itemEffect", parent: null, system: {
        durationType: "hour", duration: 2, startTime: null
      }, updateSource(d){
        this.system.startTime = d["system.startTime"]
      }
    }
    expect(stampEffectStart(worldEffect, 5000)).toBe(false)
    expect(worldEffect.system.startTime).toBe(null)
  })

  it("never cancels the creation of another item (a false from a pre-hook would)", () => {
    expect(onPreCreateItem({
      type: "itemLifestyle", system: {
      }
    }, 0)).not.toBe(false)
    expect(onPreCreateItem({
      type: "itemEffect", system: {
        durationType: "round", duration: 1
      }
    }, 0)).not.toBe(false)
  })
})
