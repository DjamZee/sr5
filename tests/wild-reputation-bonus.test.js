import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  wildReputationBonus, WILD_REPUTATION_SKILLS
} from "../modules/entities/items/spirit-bonds.js"
import {
  SR5
} from "../modules/config.js"

const wild = {
  type: "actorSpirit", system: {
    isWild: true
  }
}

describe("Wild Reputation dice (Forbidden Arcana p. 170)", () => {
  it("adds the reputation to a call or a social skill aimed at a wild spirit", () => {
    expect(wildReputationBonus("summoning", 2, wild)).toBe(2)
    expect(wildReputationBonus("negotiation", 3, wild)).toBe(3)
  })

  it("adds nothing for another skill, another target or no reputation", () => {
    expect(wildReputationBonus("pistols", 2, wild)).toBe(0)
    expect(wildReputationBonus("negotiation", 2, {
      type: "actorSpirit", system: {
        isWild: false
      }
    })).toBe(0)
    expect(wildReputationBonus("negotiation", 2, {
      type: "actorPc", system: {
      }
    })).toBe(0)
    expect(wildReputationBonus("negotiation", 0, wild)).toBe(0)
    expect(wildReputationBonus("negotiation", 2, null)).toBe(0)
  })

  it("covers every social skill of the system", () => {
    for (const key of Object.keys(SR5.socialSkills)) expect(WILD_REPUTATION_SKILLS).toContain(key)
  })

  it("is added when the test is prepared and kept when the spirit type changes", () => {
    expect(readFileSync("modules/rolls/roll-prepare-case/rollData-Skill.js", "utf8")).toContain("wildReputationBonus(")
    expect(readFileSync("modules/rolls/roll-dialog.js", "utf8")).toContain('m.type === "wildReputation"')
  })
})
