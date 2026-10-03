import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/entities/helpers.js", () => ({
  SR5_EntityHelpers: {
  }
}))
vi.mock("../modules/system/effectArea.js", () => ({
  SR5_EffectArea: {
    tokenAura: vi.fn(), checkIfTokenIsInTemplate: vi.fn()
  }
}))

const {
  sr5HookUpdateToken
} = await import("../modules/hooks/token.js")
const {
  SR5_EffectArea
} = await import("../modules/system/effectArea.js")

// A token moved onto the left or top edge of the scene gets x = 0 or y = 0: still a move.
describe("sr5HookUpdateToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.game = {
      user: {
        isGM: true
      }
    }
  })

  it("checks templates and auras on a move to x = 0", () => {
    sr5HookUpdateToken({
    }, {
      x: 0
    })
    expect(SR5_EffectArea.tokenAura).toHaveBeenCalledTimes(1)
    expect(SR5_EffectArea.checkIfTokenIsInTemplate).toHaveBeenCalledTimes(1)
  })

  it("checks them on a move to y = 0", () => {
    sr5HookUpdateToken({
    }, {
      y: 0
    })
    expect(SR5_EffectArea.checkIfTokenIsInTemplate).toHaveBeenCalledTimes(1)
  })

  it("does nothing on an update that is not a move", () => {
    sr5HookUpdateToken({
    }, {
      name: "x"
    })
    expect(SR5_EffectArea.tokenAura).not.toHaveBeenCalled()
  })
})
