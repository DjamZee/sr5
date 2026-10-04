import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// A token placed before the vision ranges were converted kept the setting's value in meters as scene units,
// until its vision was switched again. visionRangeUpdatesOfScene fixes those, and only those.
describe("SR5_EntityHelpers.visionRangeUpdatesOfScene", () => {
  let saved
  const settings = {
    sr5VisionRangeUltrasound: 50, sr5VisionRangeThermographic: 30, sr5VisionRangeAstral: 300, sr5VisionRangeLowLight: 0
  }
  const token = (id, visionMode, range, detectionModes = []) => ({
    id, sight: {
      visionMode, range
    }, detectionModes
  })
  const scene = (units, tokens) => ({
    grid: {
      units
    }, tokens
  })

  beforeEach(() => {
    saved = {
      get: globalThis.game.settings.get, isNumeric: Number.isNumeric
    }
    globalThis.game.settings.get = (_system, key) => settings[key] ?? 0
    Number.isNumeric ??= (n) => Number.isFinite(Number(n))
  })

  afterEach(() => {
    globalThis.game.settings.get = saved.get
    Number.isNumeric = saved.isNumeric
  })

  it("converts a range left in meters on a scene in feet, detection mode included", () => {
    const updates = SR5_EntityHelpers.visionRangeUpdatesOfScene(scene("ft", [
      token("u", "ultrasound", 50, [{
        id: "ultrasound", enabled: true, range: 50
      }, {
        id: "basicSight", enabled: true, range: 0
      }])
    ]))
    expect(updates).toHaveLength(1)
    expect(updates[0]._id).toBe("u")
    expect(updates[0]["sight.range"]).toBeCloseTo(164.04, 2)
    expect(updates[0].detectionModes[0].range).toBeCloseTo(164.04, 2)
    expect(updates[0].detectionModes[1]).toEqual({
      id: "basicSight", enabled: true, range: 0
    })
  })

  it("changes nothing on a scene in meters", () => {
    expect(SR5_EntityHelpers.visionRangeUpdatesOfScene(scene("m", [token("u", "ultrasound", 50)]))).toEqual([])
  })

  it("leaves alone a range the GM typed, one already converted, natural sight and low-light vision", () => {
    const updates = SR5_EntityHelpers.visionRangeUpdatesOfScene(scene("ft", [
      token("hand", "thermographic", 45),
      token("done", "astralvision", 300 / 0.3048),
      token("basic", "basic", 0),
      token("lowLight", "lowLight", 0),
    ]))
    expect(updates).toEqual([])
  })

  it("is idempotent: applied updates give no further update", () => {
    const t = token("t", "thermographic", 30)
    const first = SR5_EntityHelpers.visionRangeUpdatesOfScene(scene("ft", [t]))
    t.sight.range = first[0]["sight.range"]
    expect(SR5_EntityHelpers.visionRangeUpdatesOfScene(scene("ft", [t]))).toEqual([])
  })
})
