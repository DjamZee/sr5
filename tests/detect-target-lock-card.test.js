import {
  describe, it, expect, beforeAll, vi
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")
const {
  default: matrixActionInfo
} = await import("../modules/rolls/roll-test-case/test-MatrixAction.js")

// Rigger 5 p. 34: Detect Target Lock, Computer + Logic [Data Processing] (2), is a simple test:
// its card ends on a success or a failure, it never offers a defense.
beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})

const card = (hits, typeSub = "detectTargetLock") => ({
  test: {
    typeSub
  }, roll: {
    hits
  }, threshold: {
    value: 2
  }, matrix: {
  }, previousMessage: {
  }, chatCard: {
    buttons: {
    }
  }, edge: {
  },
})

describe("Detect Target Lock card", () => {
  beforeAll(() => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue({
      system: {
        matrix: {
        }
      }
    })
  })

  it("offers no defense on a success", async () => {
    const data = card(3)
    await matrixActionInfo(data, "a1")
    expect(data.chatCard.buttons.matrixAction).toBeUndefined()
    expect(data.chatCard.buttons.actionEnd.label).toBe("SR5.SuccessfulTest")
  })

  it("fails under the threshold, even with hits", async () => {
    const data = card(1)
    await matrixActionInfo(data, "a1")
    expect(data.chatCard.buttons.matrixAction).toBeUndefined()
    expect(data.chatCard.buttons.actionEnd.label).toBe("SR5.ActionFailure")
  })

  it("still offers the defense on an opposed matrix action", async () => {
    const data = card(2, "spoofCommand")
    await matrixActionInfo(data, "a1")
    expect(data.chatCard.buttons.matrixAction).toBeDefined()
  })
})
