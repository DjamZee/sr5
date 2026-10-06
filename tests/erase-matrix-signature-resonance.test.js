import {
  describe, it, expect, beforeAll, vi
} from "vitest"
import fs from "node:fs"
import matrixAction, {
  canTryMatrixAction
} from "../modules/rolls/roll-prepare-case/rollData-MatrixAction.js"

// SR5 p. 240: Erase Matrix Signature is Computer + Resonance [Attack]. DjamZ's ruling T8 (2026-10-06):
// it is no longer offered to whoever has no Resonance (decker, AI), nor emulated by an AI without device.
const SHEET = fs.readFileSync("templates/actors/_partials/right-tabs/matrix/matrixActions.hbs", "utf8")

const withResonance = (value) => ({
  type: "actorPc", system: {
    specialAttributes: {
      resonance: {
        augmented: {
          value
        }
      }
    }
  }
})

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.ui ??= {
  }
  globalThis.ui.notifications = {
    warn: vi.fn()
  }
})

describe("Erase Matrix Signature needs Resonance", () => {
  it("is refused without Resonance, allowed with it", () => {
    expect(canTryMatrixAction("eraseMatrixSignature", withResonance(0))).toBe(false)
    expect(canTryMatrixAction("eraseMatrixSignature", {
      system: {
      }
    })).toBe(false)
    expect(canTryMatrixAction("eraseMatrixSignature", withResonance(5))).toBe(true)
  })

  it("leaves the other actions alone", () => {
    expect(canTryMatrixAction("eraseMark", withResonance(0))).toBe(true)
  })

  it("opens no roll for a decker or an AI", async () => {
    const data = await matrixAction({
    }, "eraseMatrixSignature", withResonance(0))
    expect(data).toBeUndefined()
    expect(ui.notifications.warn).toHaveBeenCalledWith("SR5.WARN_NeedResonance")
  })

  it("hides the row from the sheet without Resonance", () => {
    expect(SHEET).toContain("{{#unless (and (eq @key 'eraseMatrixSignature') (not (gt ../system.specialAttributes.resonance.augmented.value 0)))}}")
  })
})
