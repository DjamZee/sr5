import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  SR5_EffectArea
} from "../modules/system/effectArea.js"

// A linked actor is the same on every scene: the matrix noise or the background count of a template it stood
// in on scene A followed it to scene B. Only the environment rows were filtered by scene (at roll time); these
// two are added when the actor is prepared, so they are left out there.
describe("SR5_EffectArea.isPreparedAreaEffectOffScene", () => {
  let saved
  beforeEach(() => {
    saved = globalThis.canvas
  })
  afterEach(() => {
    globalThis.canvas = saved
  })

  const effect = (target, scene = "A") => ({
    type: "itemEffect", system: {
      type: "areaEffect", ownerItem: `Scene.${scene}.MeasuredTemplate.t1`, customEffects: [{
        target, value: 2
      }]
    }
  })
  const linked = {
    isToken: false
  }
  const look = scene => {
    globalThis.canvas = {
      scene: {
        id: scene
      }
    }
  }

  it("counts the template's noise on its own scene", () => {
    look("A")
    expect(SR5_EffectArea.isPreparedAreaEffectOffScene(effect("system.matrix.noise"), linked)).toBe(false)
  })

  it("leaves the noise and the background count out on another scene", () => {
    look("B")
    expect(SR5_EffectArea.isPreparedAreaEffectOffScene(effect("system.matrix.noise"), linked)).toBe(true)
    expect(SR5_EffectArea.isPreparedAreaEffectOffScene(effect("system.magic.bgCount"), linked)).toBe(true)
  })

  it("leaves the environment rows to their roll-time filter", () => {
    look("B")
    expect(SR5_EffectArea.isPreparedAreaEffectOffScene(effect("system.itemsProperties.environmentalMod.light"), linked)).toBe(false)
  })

  it("reads an unlinked actor's own token scene", () => {
    look("B")
    const unlinked = {
      isToken: true, token: {
        parent: {
          id: "A"
        }
      }
    }
    expect(SR5_EffectArea.isPreparedAreaEffectOffScene(effect("system.matrix.noise"), unlinked)).toBe(false)
  })

  // N65: an orphan (ownerItem empty) counts for 0 in the roll: the sheet must not show it either
  it("leaves an orphan environment row out, on any scene or none", () => {
    const orphan = effect("system.itemsProperties.environmentalMod.light")
    orphan.system.ownerItem = ""
    look("A")
    expect(SR5_EffectArea.isPreparedAreaEffectOffScene(orphan, linked)).toBe(true)
    globalThis.canvas = undefined
    expect(SR5_EffectArea.isPreparedAreaEffectOffScene(orphan, linked)).toBe(true)
  })

  it("applies everything when no scene is known yet", () => {
    globalThis.canvas = undefined
    expect(SR5_EffectArea.isPreparedAreaEffectOffScene(effect("system.matrix.noise"), linked)).toBe(false)
  })
})
