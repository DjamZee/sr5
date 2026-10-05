import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import skill from "../modules/rolls/roll-prepare-case/rollData-Skill.js"
import {
  extractSituational
} from "../modules/rolls/roll-helpers/situational.js"

// SR5 p. 462: a situational effect on a skill's test is offered as a box of the roll dialog. The button that
// lets the attribute be chosen (Intimidation, for instance) reads the skill's rating, not its test, and lost
// the box the skill + attribute button offered.

const actor = () => ({
  id: "pc", type: "actorPc", system: {
    attributes: {
      charisma: {
        augmented: {
          value: 4
        }
      }
    },
    skills: {
      intimidation: {
        linkedAttribute: "charisma",
        rating: {
          value: 3, modifiers: [{
            source: "SR5.SkillRating", type: "skillRating", value: 3
          }]
        },
        test: {
          modifiers: [{
            source: "SR5.Charisma", type: "linkedAttribute", value: 4
          }, {
            source: "SR5.SkillRating", type: "skillRating", value: 3
          }, {
            source: "Phéromones", type: "situational:0", value: 0
          }]
        },
        limit: {
          value: 4, modifiers: [], base: "socialLimit"
        },
      }
    }
  }
})

const effects = [{
  source: "Phéromones", value: 2, when: "", situational: true
}]

const rollData = () => ({
  test: {
  }, dicePool: {
  }, limit: {
    modifiers: {
    }
  }, dialogSwitch: {
  }, combat: {
    actions: []
  }, magic: {
  }, target: {
    hasTarget: false
  }, damage: {
  }, threshold: {
  }
})

beforeEach(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = (k) => k
  globalThis.game.combat = null
})

describe("situational boxes on a skill test", () => {
  for (const rollType of ["skill", "skillDicePool"]) {
    it(`are offered by the ${rollType} button`, async () => {
      const data = await skill(rollData(), rollType, "intimidation", actor())
      const {
        offers
      } = extractSituational(data, effects, ["charisma"], [])
      expect(offers.map(o => o.label)).toEqual(["Phéromones"])
      // The marker itself never reaches the pool
      expect((data.dicePool.modifiers || []).some(m => m.type?.startsWith("situational:"))).toBe(false)
    })
  }
})
