import {
  describe, it, expect, vi, beforeEach
} from "vitest"
import ritual from "../modules/rolls/roll-prepare-case/rollData-Ritual.js"

// `!reagents > 0` reads as `(!reagents) > 0`: a negative or text stock slipped past the guard.
// The guard must refuse any stock that is not a positive number.
describe("ritual reagents guard", () => {
  beforeEach(() => {
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
  })

  it.each([0, -2, undefined, "abc"])("refuses the ritual with %s reagents", (reagents) => {
    const result = ritual({
    }, {
      system: {
        magic: {
          reagents
        }
      }
    }, {
    })
    expect(result).toBeUndefined()
    expect(globalThis.ui.notifications.warn).toHaveBeenCalledOnce()
  })
})
