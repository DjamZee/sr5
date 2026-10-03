import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// Jam Signals reaches every device "within 100 meters" (SR5 p. 239). The bound used to be compared
// three different ways; a radius includes its own boundary, so a device at exactly 100 m is jammed
// by every path, and one a hair further is not.
describe("SR5_EffectArea.checkAuraJamming, the 100 m bound", () => {
  let jammer, other, savedUser

  const makeActor = (id, items = []) => ({
    id, name: id, items, effects: [],
    deleteEmbeddedDocuments: vi.fn(),
  })

  beforeEach(() => {
    savedUser = globalThis.game.user
    globalThis.game.user = {
      isGM: true
    }
    jammer = makeActor("jammer", [{
      system: {
        type: "signalJam", value: 4
      }
    }])
    other = makeActor("other")
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation((id) => (id === "jammer" ? jammer : other))
    vi.spyOn(SR5_EffectArea, "createJammedEffect").mockResolvedValue()
  })

  afterEach(() => {
    globalThis.game.user = savedUser
    vi.restoreAllMocks()
  })

  it("jams a device that moves to exactly 100 m", async () => {
    await SR5_EffectArea.checkAuraJamming({
      id: "other"
    }, {
      id: "jammer"
    }, 100)
    expect(SR5_EffectArea.createJammedEffect).toHaveBeenCalledWith(jammer, other, 4)
  })

  it("jams a device at exactly 100 m from a jammer that moves", async () => {
    await SR5_EffectArea.checkAuraJamming({
      id: "jammer"
    }, {
      id: "other"
    }, 100)
    expect(SR5_EffectArea.createJammedEffect).toHaveBeenCalledWith(jammer, other, 4)
  })

  it("leaves alone a device just past 100 m", async () => {
    await SR5_EffectArea.checkAuraJamming({
      id: "other"
    }, {
      id: "jammer"
    }, 100.5)
    await SR5_EffectArea.checkAuraJamming({
      id: "jammer"
    }, {
      id: "other"
    }, 100.5)
    expect(SR5_EffectArea.createJammedEffect).not.toHaveBeenCalled()
  })
})
