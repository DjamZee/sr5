import {
  describe, it, expect, beforeAll
} from "vitest"

// SR5 p. 323: a counterspelling focus adds its Force to counterspelling tests of its category
// and to the spell defense pool the magician shares with allies.

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
})

const value = () => ({
  base: 0, value: 0, modifiers: []
})

function magician(rating) {
  return {
    system: {
      skills: {
        counterspelling: {
          rating: {
            ...value(), value: rating
          },
          spellCategory: {
            combat: value()
          }
        }
      },
      magic: {
        counterSpellPool: value(), metamagics: {
        }, initiationGrade: 0
      }
    }
  }
}

const focus = (type, force) => ({
  name: "Focus", system: {
    type, subType: "combat", itemRating: force, customEffects: {
    }
  }
})

describe("counterspelling focus and the spell defense pool", () => {
  it("adds the focus Force to the pool", () => {
    const actor = magician(4)
    SR5_CharacterUtility.applyFocusBonus(focus("counterspelling", 3), actor)
    SR5_CharacterUtility.updateCounterSpellPool(actor)
    expect(actor.system.magic.counterSpellPool.value).toBe(7)
  })

  it("counts only the most powerful focus, in any order", () => {
    for (const forces of [[3, 5], [5, 3]]) {
      const actor = magician(4)
      for (const f of forces) SR5_CharacterUtility.applyFocusBonus(focus("counterspelling", f), actor)
      SR5_CharacterUtility.updateCounterSpellPool(actor)
      expect(actor.system.magic.counterSpellPool.value).toBe(9)
    }
  })

  it("leaves the pool alone for a spellcasting focus", () => {
    const actor = magician(4)
    SR5_CharacterUtility.applyFocusBonus(focus("spellcasting", 3), actor)
    SR5_CharacterUtility.updateCounterSpellPool(actor)
    expect(actor.system.magic.counterSpellPool.value).toBe(4)
  })
})
