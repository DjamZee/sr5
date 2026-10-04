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

// prepared: the row the prepared data holds (an orphan is left out of it since N65)
function acteur(visibility, ownerItem, prepared = visibility) {
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
          value: prepared
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

  // Only a template creates an areaEffect (effectArea.js): one with no template scene is an orphan, left by a
  // preview before b685ff03, and counts nowhere, as in the prepared data (areaEffectScene.js)
  it("does not count an orphan area effect", () => {
    const orphelin = acteur(2, "Actor.x.Item.y", 0)
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene("sceneB"), orphelin, true)).toBe(0)
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(scene("sceneA"), orphelin, true)).toBe(0)
  })
})
