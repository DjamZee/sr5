import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"
import {
  weaponLightKinds, flashlightDazzles, WEAK_GLARE
} from "../modules/rolls/roll-helpers/flashlight-glare.js"

const scene = flags => ({
  id: "s", getFlag: (_module, key) => flags[key] ?? 0
})
const acteur = (glare = 0) => ({
  itemsProperties: {
    environmentalMod: {
      visibility: {
        value: 0
      }, light: {
        value: 0
      }, glare: {
        value: glare
      }, wind: {
        value: 0
      }
    }
  },
  visions: {
    lowLight: {
      isActive: false
    }
  },
})
const beam = {
  visibility: 0, light: 0, glare: 0, wind: 0, glareAtLeast: WEAK_GLARE
}
const visions = (lowLight, thermographic) => ({
  lowLight: {
    isActive: lowLight
  }, thermographic: {
    isActive: thermographic
  }
})

describe("Weapon flashlight glare (Run & Gun p. 69)", () => {
  it("lists the flashlights lit on the weapon, once each", () => {
    const effectOf = a => a.kind
    expect(weaponLightKinds({
      isActive: true, accessory: [{
        isActive: true, kind: "flashLight"
      }, {
        isActive: true, kind: "flashLight"
      }, {
        isActive: false, kind: "flashLightInfrared"
      }, {
        isActive: true, kind: "laserSight"
      }]
    }, effectOf)).toEqual(["flashLight"])
    expect(weaponLightKinds({
      isActive: false, accessory: [{
        isActive: true, kind: "flashLight"
      }]
    }, effectOf)).toEqual([])
  })

  it("dazzles whoever sees its light", () => {
    expect(flashlightDazzles(["flashLight"], visions(false, false))).toBe(true)
    expect(flashlightDazzles(["flashLightLowLight"], visions(false, false))).toBe(false)
    expect(flashlightDazzles(["flashLightLowLight"], visions(true, false))).toBe(true)
    expect(flashlightDazzles(["flashLightInfrared"], visions(true, false))).toBe(false)
    expect(flashlightDazzles(["flashLightInfrared"], visions(false, true))).toBe(true)
    expect(flashlightDazzles(undefined, visions(true, true))).toBe(false)
  })

  it("weak glare: the -1 row in normal conditions, nothing more where the scene is already worse", () => {
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene({
    }), acteur(), true, beam)).toBe(-1)
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene({
      environModGlare: 2
    }), acteur(), true, beam)).toBe(SR5_CombatHelpers.handleEnvironmentalModifiers(scene({
      environModGlare: 2
    }), acteur(), true))
  })

  it("flare compensation takes it off", () => {
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene({
    }), acteur(-1), true, beam)).toBe(0)
  })
})
