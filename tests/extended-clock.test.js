import {
  describe, it, expect, vi
} from "vitest"
import {
  pendingIntervals, timeAfter, ledgerAfter, addExtendedClockButton
} from "../modules/system/extended-clock.js"
import {
  componentsToWorldTime
} from "../modules/system/calendar.js"

describe("extended tests move the clock (SR5 p. 50, 207-208)", () => {
  it("offers the intervals spent and not yet put on the clock, counted in the GM's ledger", () => {
    const card = {
      interval: "hour", intervalValue: 3, clockAdvanced: 0
    }
    expect(pendingIntervals(card, 0)).toBe(3)
    expect(pendingIntervals(card, 2)).toBe(1)
    expect(pendingIntervals(card, 3)).toBe(0)
  })

  it("ignores what the card says it advanced: a player can write her card (Yara)", () => {
    //Two hours are on the clock in the ledger; the player puts clockAdvanced back to 0 on her card
    const tampered = {
      interval: "hour", intervalValue: 2, clockAdvanced: 0
    }
    expect(pendingIntervals(tampered, 2)).toBe(0)
    //She writes she advanced everything: the GM's ledger still says what is left
    expect(pendingIntervals({
      interval: "hour", intervalValue: 3, clockAdvanced: 99
    }, 1)).toBe(2)
  })

  it("offers nothing on a card rolled before the calendar, whose time is long spent", () => {
    expect(pendingIntervals({
      interval: "hour", intervalValue: 5
    }, 0)).toBe(0)
  })

  it("offers nothing without an interval of time", () => {
    expect(pendingIntervals({
      interval: "", intervalValue: 2, clockAdvanced: 0
    })).toBe(0)
    expect(pendingIntervals({
      interval: "special", intervalValue: 2, clockAdvanced: 0
    })).toBe(0)
  })

  it("keeps the ledger by message, and drops the messages that are gone", () => {
    expect(ledgerAfter({
      a: 1, gone: 4
    }, "a", 2, new Set(["a"]))).toEqual({
      a: 3
    })
    expect(ledgerAfter({
    }, "b", 1, new Set(["b"]))).toEqual({
      b: 1
    })
  })

  it("shows the button to the active GM only, not to every GM connected (Yara)", () => {
    const html = {
      querySelector: vi.fn(() => ({
        after: vi.fn()
      }))
    }
    const message = {
      id: "m1", flags: {
        sr5data: {
          test: {
            extended: {
              interval: "hour", intervalValue: 1, clockAdvanced: 0, roll: 1
            }
          }
        }
      }
    }
    globalThis.document = {
      createElement: () => ({
        classList: {
          add(){}
        }, addEventListener(){}
      })
    }
    globalThis.game = {
      ...globalThis.game,
      user: {
        id: "gm2", isGM: true
      },
      users: {
        activeGM: {
          id: "gm1"
        }
      },
      settings: {
        get: () => ({
        })
      },
      i18n: {
        localize: (k) => k, format: (k) => k
      },
    }
    addExtendedClockButton(message, html)
    expect(html.querySelector).not.toHaveBeenCalled()
    game.users.activeGM.id = "gm2"
    addExtendedClockButton(message, html)
    expect(html.querySelector).toHaveBeenCalled()
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
