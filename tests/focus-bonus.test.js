import {
  describe, it, expect
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import {
  SR5
} from "../modules/config.js"

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

// The whole chain the actor runs: foci, custom effects, comparison, then Magic
// and the skill pools. Magic 6, Spellcasting 5: a bare spell pool is 11.
function makeMagician() {
  const pools = keys => Object.fromEntries(Object.keys(keys).map(k => [k, {
    base: 0, modifiers: []
  }]))
  const skill = rating => ({
    skillGroup: "", linkedAttribute: "magic", canDefault: false, rating: {
      base: rating, modifiers: []
    }, test: {
      base: 0, modifiers: []
    }, limit: {
      base: "astral", modifiers: []
    },
    spellCategory: pools(SR5.spellCategories), spiritType: pools(SR5.spiritTypes), perceptionType: Object.fromEntries(Object.keys(SR5.perceptionTypes).map(k => [k, {
      test: {
        base: 0, modifiers: []
      }, limit: {
        base: 0, modifiers: []
      }
    }])),
  })
  return {
    type: "actorSpirit", system: {
      specialAttributes: {
        magic: {
          natural: {
            base: 6, modifiers: []
          }, augmented: {
            base: 0, modifiers: []
          }
        }
      },
      skills: Object.fromEntries(["spellcasting", "counterspelling", "ritualSpellcasting", "alchemy", "summoning", "binding", "banishing", "perception"].map(k => [k, skill(k === "spellcasting" ? 5 : 0)])),
      magic: {
        bgCount: {
          value: 0
        }
      },
      limits: {
      },
    },
  }
}

function prepare(actor, foci) {
  for (const focus of foci) {
    SR5_CharacterUtility.applyFocusBonus(focus, actor)
    SR5_CharacterUtility.applyCustomEffects(focus, actor)
  }
  SR5_CharacterUtility.keepStrongestFocus(actor)
  SR5_CharacterUtility.updateSpecialAttributes(actor)
  SR5_CharacterUtility.updateSkills(actor)
  return actor.system
}

const onTarget = target => ({
  0: {
    target, type: "rating", multiplier: 1
  }
})
const NATURAL_MAGIC = "system.specialAttributes.magic.natural"
const SPELLCASTING = "system.skills.spellcasting.test"
const COMBAT = "system.skills.spellcasting.spellCategory.combat"

describe("Focus — the strongest is kept on every path to the same test", () => {

  // DjamZ, 2026-09-26: a power focus never counts twice.
  it("counts a power focus on natural Magic once", () => {
    const data = prepare(makeMagician(), [makeFocus("Pouvoir 3", "power", "", 3, onTarget(NATURAL_MAGIC))])
    expect(data.specialAttributes.magic.augmented.value).toBe(9)
  })

  it("keeps the strongest of two power foci on natural Magic", () => {
    const data = prepare(makeMagician(), [makeFocus("Pouvoir 3", "power", "", 3, onTarget(NATURAL_MAGIC)), makeFocus("Pouvoir 2", "power", "", 2, onTarget(NATURAL_MAGIC))])
    expect(data.specialAttributes.magic.augmented.value).toBe(9)
  })

  it("compares a power focus on natural Magic with one on augmented Magic", () => {
    const data = prepare(makeMagician(), [makeFocus("Pouvoir 2", "power", "", 2), makeFocus("Pouvoir 3", "power", "", 3, onTarget(NATURAL_MAGIC))])
    expect(data.specialAttributes.magic.augmented.value).toBe(9)
  })

  it("compares a focus on the whole skill with a focus on the category", () => {
    const data = prepare(makeMagician(), [makeFocus("Ancien focus 3", "spellcasting", "", 3, onTarget(SPELLCASTING)), makeFocus("Focus Combat 2", "spellcasting", "combat", 2)])
    expect(data.skills.spellcasting.spellCategory.combat.dicePool).toBe(14)
  })

  it("lets a weaker focus on the whole skill keep the other categories", () => {
    const data = prepare(makeMagician(), [makeFocus("Ancien focus 2", "spellcasting", "", 2, onTarget(SPELLCASTING)), makeFocus("Focus Combat 3", "spellcasting", "combat", 3)])
    expect(data.skills.spellcasting.spellCategory.combat.dicePool).toBe(14)
    expect(data.skills.spellcasting.spellCategory.health.dicePool).toBe(13)
  })

  it("compares foci whose type was never chosen", () => {
    const data = prepare(makeMagician(), [makeFocus("Focus sans type 3", "", "", 3, onTarget(COMBAT)), makeFocus("Focus sans type 2", "", "", 2, onTarget(COMBAT))])
    expect(data.skills.spellcasting.spellCategory.combat.dicePool).toBe(14)
  })
})
