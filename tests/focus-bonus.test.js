import {
  describe, it, expect
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

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

  // DjamZ, 2026-10-02: with two power foci, only the strongest counts (p. 321).
  it("keeps only the strongest of two power foci on Magic", () => {
    const actor = makeActor()
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Pouvoir 1", "power", "", 1), actor)
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Pouvoir 2", "power", "", 2), actor)
    expect(actor.system.specialAttributes.magic.augmented.modifiers.map(m => m.value)).toEqual([2])
  })

  // DjamZ, 2026-09-26: a power focus works through Magic (SR5 p. 322), so it stacks
  // with a spell focus, but its Force never counts twice in the same pool.
  it("lets a power focus stack with a spell focus, through Magic only", () => {
    const actor = makeActor()
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Pouvoir 2", "power", "", 2), actor)
    SR5_CharacterUtility.applyFocusBonus(makeFocus("Focus Combat 3", "spellcasting", "combat", 3), actor)
    SR5_CharacterUtility.keepStrongestFocus(actor)
    expect(actor.system.specialAttributes.magic.augmented.modifiers.map(m => m.source)).toEqual(["Pouvoir 2"])
    expect(combatPool(actor).map(m => m.source)).toEqual(["Focus Combat 3"])
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

  // An older focus without a category carries its bonus only as a custom effect
  // (the foci of the provided archetypes, once the GM adds the effect by hand).
  // The pool is computed as the actor prepares it: automatic bonus, custom
  // effects, then the comparison, then the dice pool.
  it("keeps only the strongest of two custom-effect foci without a category", () => {
    const actor = makeActor()
    const combat = actor.system.skills.spellcasting.spellCategory.combat
    combat.base = 15
    const effect = () => ({
      0: {
        target: "system.skills.spellcasting.spellCategory.combat", type: "rating", multiplier: 1
      }
    })
    for (const focus of [makeFocus("Ancien focus 3", "spellcasting", "", 3, effect()), makeFocus("Ancien focus 2", "spellcasting", "", 2, effect())]) {
      SR5_CharacterUtility.applyFocusBonus(focus, actor)
      SR5_CharacterUtility.applyCustomEffects(focus, actor)
    }
    SR5_CharacterUtility.keepStrongestFocus(actor)
    SR5_EntityHelpers.updateDicePool(combat, 0)
    expect(combat.dicePool).toBe(18)
    expect(combatPool(actor).map(m => m.source)).toEqual(["Ancien focus 3"])
  })
})
