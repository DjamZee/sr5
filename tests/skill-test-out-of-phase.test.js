import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import skill from "../modules/rolls/roll-prepare-case/rollData-Skill.js"
import {
  SR5_PrepareRollHelper
} from "../modules/rolls/roll-prepare-helpers.js"

// SR5 p. 164: one acts in one's own phase, so a skill test outside it is a reaction the gamemaster calls for:
// it costs no action (and so neither warns nor blocks). In the character's phase, the test stays a complex action.

const actor = {
  id: "pc", type: "actorPc", system: {
    skills: {
      perception: {
        rating: {
          value: 3, modifiers: []
        },
        test: {
          modifiers: []
        },
        limit: {
          value: 4, modifiers: [], base: "mental"
        },
      }
    }
  }
}

const rollData = () => ({
  test: {
  }, dicePool: {
  }, limit: {
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

const fight = (current) => {
  const combatants = [{
    id: "c-pc", actorId: "pc", initiative: 8
  }, {
    id: "c-npc", actorId: "npc", initiative: 12
  }]
  globalThis.game.combat = {
    started: true, combatants, combatant: combatants.find(c => c.actorId === current)
  }
}

beforeEach(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = (k) => k
  vi.spyOn(SR5_PrepareRollHelper, "getDicepoolModifiers").mockReturnValue([])
  vi.spyOn(SR5_PrepareRollHelper, "getBaseLimit").mockReturnValue(4)
  vi.spyOn(SR5_PrepareRollHelper, "getLimitModifiers").mockReturnValue([])
})

describe("skill test and the action phase", () => {
  it("costs a complex action in the character's own phase", async () => {
    fight("pc")
    const data = await skill(rollData(), "skill", "perception", actor)
    expect(data.combat.actions).toEqual([{
      type: "complex", value: 1, source: "useSkill"
    }])
  })

  it("costs no action outside the character's phase", async () => {
    fight("npc")
    const data = await skill(rollData(), "skill", "perception", actor)
    expect(data.combat.actions).toEqual([])
  })

  it("keeps the complex action out of combat", async () => {
    globalThis.game.combat = null
    const data = await skill(rollData(), "skill", "perception", actor)
    expect(data.combat.actions).toHaveLength(1)
  })
})
