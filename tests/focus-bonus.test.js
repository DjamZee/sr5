import {
  describe, it, expect
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

function makeActor() {
  return {
    system: {
      skills: {
        spellcasting: {
          spellCategory: {
            combat: {
              modifiers: []
            },
            health: {
              modifiers: []
            },
          },
        },
      },
      specialAttributes: {
        magic: {
          augmented: {
            modifiers: []
          }
        },
      },
    },
  }
}

function makeFocus(name, type, subType, itemRating, customEffects = {
}) {
  return {
    name, type: "itemFocus", system: {
      type, subType, itemRating, isActive: true, customEffects
    }
  }
}

const combatPool = actor => actor.system.skills.spellcasting.spellCategory.combat.modifiers

// "Quel que soit le nombre de focus liés dont il dispose, un seul focus peut
// ajouter sa Puissance à la réserve de dés d'un test donné." — SR5 p. 321
describe("Focus — a single focus adds its Force to a given test", () => {

  it("keeps only the strongest of two spellcasting foci of the same category", () => {
    const actor = makeActor()
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Focus Combat 3", "spellcasting", "combat", 3), actor)
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Focus Combat 2", "spellcasting", "combat", 2), actor)
    expect(combatPool(actor)).toEqual([expect.objectContaining({
      source: "Focus Combat 3", type: "itemFocus", value: 3
    })])
  })

  it("does not depend on the order of the foci", () => {
    const actor = makeActor()
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Focus Combat 2", "spellcasting", "combat", 2), actor)
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Focus Combat 3", "spellcasting", "combat", 3), actor)
    expect(combatPool(actor)).toEqual([expect.objectContaining({
      source: "Focus Combat 3", value: 3
    })])
  })

  it("leaves foci of different categories on their own tests", () => {
    const actor = makeActor()
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Focus Combat 3", "spellcasting", "combat", 3), actor)
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Focus Santé 2", "spellcasting", "health", 2), actor)
    expect(combatPool(actor).map(m => m.value)).toEqual([3])
    expect(actor.system.skills.spellcasting.spellCategory.health.modifiers.map(m => m.value)).toEqual([2])
  })

  it("keeps only the strongest of two power foci on Magic", () => {
    const actor = makeActor()
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Pouvoir 1", "power", "", 1), actor)
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Pouvoir 2", "power", "", 2), actor)
    expect(actor.system.specialAttributes.magic.augmented.modifiers.map(m => m.value)).toEqual([2])
  })

  // A focus from an older world carries its bonus as a custom effect, applied
  // after the automatic bonus of the foci read before it.
  it("keeps the strongest when a custom-effect focus comes after", () => {
    const actor = makeActor()
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Focus Combat 3", "spellcasting", "combat", 3), actor)
    combatPool(actor).push({
      source: "Ancien focus 2", type: "itemFocus", value: 2
    })
    SR5_CharacterUtility.keepStrongestFocus(actor)
    expect(combatPool(actor).map(m => m.value)).toEqual([3])
  })
})
