import {
  describe, it, expect, afterEach, vi
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"

// Foundry V13 makes a token document's x follow the move animation in the updateToken hook, while
// _source.x already holds the destination: the aura was measured one move late (N87).
describe("SR5_EffectArea.tokenAura measures from the destination of a move", () => {
  afterEach(() => vi.restoreAllMocks())

  it("reads _source, not the animated x", async () => {
    const scene = {
      grid: {
        units: "m", measurePath: ([a, b]) => ({
          distance: Math.hypot(a.x - b.x, a.y - b.y)
        })
      },
    }
    // Moved from 0 to 4000, the animation still draws it at 1500
    const mover = {
      id: "m", parent: scene, x: 1500, y: 0, _source: {
        x: 4000, y: 0
      }
    }
    const other = {
      id: "o", x: 4050, y: 0, _source: {
        x: 4050, y: 0
      }
    }
    scene.tokens = [mover, other]
    const check = vi.spyOn(SR5_EffectArea, "checkAuraJamming").mockResolvedValue()
    await SR5_EffectArea.tokenAura(mover)
    expect(check).toHaveBeenCalledWith(mover, other, 50)
  })
})
