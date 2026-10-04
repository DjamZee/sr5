import {
  describe, it, expect, beforeAll, vi
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"
import rammingDefense from "../modules/rolls/roll-prepare-case/rollData-RammingDefense.js"

// SR5 p. 191-192: block needs Unarmed Combat, parry the weapon's skill, dodge is open to anyone;
// all three add a skill, so the Physical limit applies.

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
  globalThis.ui ??= {
  }
  globalThis.ui.notifications = {
    warn: vi.fn()
  }
})

const fighter = (skills) => ({
  name: "Essai", system: {
    skills: Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, {
      rating: {
        value: v
      }
    }]))
  }
})

describe("active defense needs its skill", () => {
  it("refuses block and parry without the skill", () => {
    const actor = fighter({
      unarmedCombat: 0, blades: 0, clubs: 0, gymnastics: 0
    })
    expect(SR5_RollDialog.hasActiveDefenseSkill(actor, "block")).toBe(false)
    expect(SR5_RollDialog.hasActiveDefenseSkill(actor, "parryBlades")).toBe(false)
    expect(SR5_RollDialog.hasActiveDefenseSkill(actor, "parryClubs")).toBe(false)
  })

  it("lets anyone dodge and allows a trained block", () => {
    const actor = fighter({
      unarmedCombat: 3, gymnastics: 0
    })
    expect(SR5_RollDialog.hasActiveDefenseSkill(actor, "dodge")).toBe(true)
    expect(SR5_RollDialog.hasActiveDefenseSkill(actor, "block")).toBe(true)
    expect(SR5_RollDialog.hasActiveDefenseSkill(actor, "none")).toBe(true)
  })
})

describe("ramming defense", () => {
  it("carries the Physical limit for a dodge", async () => {
    const actor = {
      system: {
        skills: {
          gymnastics: {
            rating: {
              value: 2
            }
          }
        },
        limits: {
          physicalLimit: {
            value: 5, modifiers: []
          }
        },
        defenses: {
          defend: {
            modifiers: []
          }
        },
        specialProperties: {
          fullDefenseValue: 0
        }
      }
    }
    const rollData = {
      dicePool: {
      }, limit: {
        modifiers: {
        }
      },
      test: {
      }, damage: {
      }, combat: {
        activeDefenses: {
        }
      }, previousMessage: {
      }, owner: {
      }, target: {
      }
    }
    const chatData = {
      damage: {
      }, combat: {
      }, roll: {
      }, owner: {
      }, target: {
      }
    }
    await rammingDefense(rollData, actor, chatData)
    expect(rollData.combat.activeDefenses.limit).toBe(5)
  })
})
