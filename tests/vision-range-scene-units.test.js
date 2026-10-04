import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// The vision ranges are world settings in meters (SR5 p. 176: ultrasound reaches 50 meters), and
// getVisionData wrote them as is into the token, which draws in its scene's units: on a map in feet,
// 50 m of ultrasound became 50 ft, about 15 m.
describe("SR5_EntityHelpers.getVisionData: vision range in the scene's units", () => {
  let saved
  const actor = {
    system: {
      visions: {
        ultrasound: {
          isActive: true
        }
      }
    }
  }
  const token = (units) => ({
    parent: {
      grid: {
        units
      }
    },
    sight: {
    },
    detectionModes: []
  })

  beforeEach(() => {
    saved = {
      get: globalThis.game.settings.get, isNumeric: Number.isNumeric
    }
    globalThis.game.settings.get = (_system, key) => (key === "sr5VisionRangeUltrasound" ? 50 : 0)
    Number.isNumeric ??= (n) => Number.isFinite(Number(n))
  })

  afterEach(() => {
    globalThis.game.settings.get = saved.get
    Number.isNumeric = saved.isNumeric
  })

  it("keeps 50 on a scene in meters", async () => {
    const data = await SR5_EntityHelpers.getVisionData(token("m"), actor)
    expect(data.sight.range).toBe(50)
    expect(data.detectionModes.find(d => d.id === "ultrasound").range).toBe(50)
  })

  it("draws 50 meters as about 164 feet on a scene in feet", async () => {
    const data = await SR5_EntityHelpers.getVisionData(token("ft"), actor)
    expect(data.sight.range).toBeCloseTo(164.04, 2)
    expect(data.detectionModes.find(d => d.id === "ultrasound").range).toBeCloseTo(164.04, 2)
  })

  it("reads the scene it is given, for a copy that lost its parent", async () => {
    const copy = token("m")
    delete copy.parent
    const data = await SR5_EntityHelpers.getVisionData(copy, actor, {
      grid: {
        units: "ft"
      }
    })
    expect(data.sight.range).toBeCloseTo(164.04, 2)
  })
})
