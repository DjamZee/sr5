import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// A template's effect is an itemEffect on the actor. A linked actor is one document for all its tokens, so
// smoke laid on scene A followed it to scene B. It only counts on the scene where the template stands.
const scene = id => ({
  id, getFlag: () => undefined
})

function acteur(visibility, ownerItem) {
  const parent = {
    items: [{
      type: "itemEffect",
      system: {
        type: "areaEffect",
        ownerItem,
        customEffects: [{
          target: "system.itemsProperties.environmentalMod.visibility", value: visibility
        }]
      }
    }]
  }
  return {
    parent,
    itemsProperties: {
      environmentalMod: {
        visibility: {
          value: visibility
        }, light: {
          value: 0
        }, glare: {
          value: 0
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
  }
}

describe("a template's effect on a linked actor", () => {
  const fumee = acteur(3, "Scene.sceneA.MeasuredTemplate.tpl1")

  it("counts on the scene where the template stands", () => {
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene("sceneA"), fumee, true)).toBe(-6)
  })

  it("does not count on another scene", () => {
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene("sceneB"), fumee, true)).toBe(0)
  })

  it("leaves an effect that comes from no template alone", () => {
    const sort = acteur(2, "Actor.x.Item.y")
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene("sceneB"), sort, true)).toBe(-3)
  })
})
