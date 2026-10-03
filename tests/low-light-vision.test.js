import {
  describe, it, expect
} from "vitest"
import {
  getLowLightVisionData
} from "../modules/system/vision.js"

// Constants of foundry.canvas.perception.VisionMode, as Foundry 13 defines them
const VisionMode = {
  LIGHTING_LEVELS: {
    DARKNESS: -2, HALFDARK: -1, UNLIT: 0, DIM: 1, BRIGHT: 2, BRIGHTEST: 3
  },
  LIGHTING_VISIBILITY: {
    DISABLED: 0, ENABLED: 1, REQUIRED: 2
  },
}
const shaders = {
  AmplificationSamplerShader: "AmplificationSamplerShader",
  AmplificationBackgroundVisionShader: "AmplificationBackgroundVisionShader",
}

// Low-light vision used to push an exposure of 1.2 and a desaturation onto the lighting layers :
// on a scene lit by its global light, the token saw brighter than daylight and washed out, and
// the green tint never reached the lit areas.
describe("getLowLightVisionData", () => {
  for (const greenTint of [false, true]) {
    describe(greenTint ? "with the green tint" : "in natural colours", () => {
      const data = getLowLightVisionData(greenTint, VisionMode, shaders)

      it("treats dim light as full light, and nothing more (SR5 p. 177)", () => {
        expect(data.lighting.levels).toEqual({
          [VisionMode.LIGHTING_LEVELS.DIM]: VisionMode.LIGHTING_LEVELS.BRIGHT
        })
      })

      it("neither brightens nor desaturates the lit areas", () => {
        for (const layer of ["background", "illumination", "coloration"]) {
          expect(data.lighting[layer]?.postProcessingModes ?? []).toEqual([])
        }
      })

      it("leaves the token's own sight settings neutral", () => {
        expect(data.vision.defaults).toEqual({
          attenuation: 0, contrast: 0, saturation: 0, brightness: 0
        })
      })
    })
  }

  it("keeps natural colours when the setting is off", () => {
    const data = getLowLightVisionData(false, VisionMode, shaders)
    expect(data.canvas).toBeUndefined()
    expect(data.vision.background).toBeUndefined()
  })

  it("tints the picture green, lit areas included, when the setting is on", () => {
    const data = getLowLightVisionData(true, VisionMode, shaders)
    expect(data.canvas.shader).toBe(shaders.AmplificationSamplerShader)
    // Otherwise the lit areas are drawn from the untinted picture
    expect(data.lighting.background.visibility).toBe(VisionMode.LIGHTING_VISIBILITY.DISABLED)
    expect(data.vision.background.shader).toBe(shaders.AmplificationBackgroundVisionShader)
  })
})
