import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"
import {
  isAreaEffectOffScene
} from "../modules/system/areaEffectScene.js"

// The "area effect off this scene" rule had two copies: the prepared data left out an effect with no
// template scene, the environment rows at roll time kept it. Both now read areaEffectScene.js.
const effect = (ownerItem, value = 4) => ({
  type: "itemEffect",
  system: {
    type: "areaEffect", ownerItem, customEffects: [{
      target: "system.itemsProperties.environmentalMod.visibility", value
    }]
  },
})

describe("one rule for area effects off the scene", () => {
  const here = effect("Scene.A.MeasuredTemplate.t1", 1)
  const there = effect("Scene.B.MeasuredTemplate.t2", 2)
  const orphan = effect("", 4)

  it("the shared rule leaves out another scene and an orphan", () => {
    expect(isAreaEffectOffScene(here, "A")).toBe(false)
    expect(isAreaEffectOffScene(there, "A")).toBe(true)
    expect(isAreaEffectOffScene(orphan, "A")).toBe(true)
  })

  // N65: the orphan is now left out of the prepared rows (the sheet), so the roll must not subtract it again
  it("the environment rows subtract another scene, not the orphan already left out", () => {
    const offScene = SR5_CombatHelpers.areaEffectsOffScene({
      items: [here, there, orphan]
    }, "A")
    expect(offScene).toEqual({
      visibility: 2
    })
  })
})
