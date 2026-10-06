import {
  describe, it, expect
} from "vitest"
import {
  migrateTemplateNoise
} from "../modules/datamodels/common/templateNoiseMigration.js"

// T6 (DjamZ, 2026-10-06): a template effect created before N32 holds the noise as -rating (SR5 p. 232);
// it is turned back into the rating when the item is loaded, wherever it is.
const noiseEffect = (value, customEffects) => ({
  type: "itemEffect", system: {
    type: "areaEffect", value, customEffects: customEffects ?? [{
      category: "matrixAttributes", target: "system.matrix.noise", type: "value", value, forceAdd: true
    }]
  }
})

describe("old negative noise of a template effect", () => {
  it("turns -3 back into 3, on the custom effect and the shown value", () => {
    const source = migrateTemplateNoise(noiseEffect(-3))
    expect(source.system.customEffects[0].value).toBe(3)
    expect(source.system.value).toBe(3)
  })

  it("reads custom effects stored as an object", () => {
    const source = migrateTemplateNoise(noiseEffect(-2, {
      0: {
        target: "system.matrix.noise", value: -2
      }
    }))
    expect(source.system.customEffects[0].value).toBe(2)
  })

  it("leaves a noise already positive, and other effects, untouched", () => {
    expect(migrateTemplateNoise(noiseEffect(3)).system.customEffects[0].value).toBe(3)
    const light = noiseEffect(-2, [{
      target: "system.itemsProperties.environmentalMod.light", value: -2
    }])
    expect(migrateTemplateNoise(light).system.customEffects[0].value).toBe(-2)
    expect(migrateTemplateNoise(light).system.value).toBe(-2)
  })

  it("leaves a jammer's effect and other item types alone", () => {
    const jammed = noiseEffect(-4)
    jammed.system.type = "signalJammed"
    expect(migrateTemplateNoise(jammed).system.customEffects[0].value).toBe(-4)
    const gear = {
      type: "itemGear", system: {
        type: "areaEffect", customEffects: [{
          target: "system.matrix.noise", value: -1
        }]
      }
    }
    expect(migrateTemplateNoise(gear).system.customEffects[0].value).toBe(-1)
  })
})
