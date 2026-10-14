import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  mysticAptitudeChoice, mysticAptitudeKey, magicWithoutPowerFocus, mysticAptitudeValue, purityStateArmorPenetration
} from "../modules/entities/items/adept-powers-btb.js"
import {
  grantableSkills, isSkillPower, skillsFromPowers
} from "../modules/entities/items/spirit-skill-power.js"
import {
  SR5
} from "../modules/config.js"

const read = path => readFileSync(path, "utf8")

describe("Mystic Aptitude (Better Than Bad p. 143)", () => {
  it("stands in for the one attribute chosen, with the highest level", () => {
    expect(mysticAptitudeChoice({
    })).toBeNull()
    expect(mysticAptitudeChoice({
      agility: 2
    })).toEqual({
      attribute: "agility", level: 2
    })
    expect(mysticAptitudeChoice({
      body: 1, strength: 3
    })).toEqual({
      attribute: "strength", level: 3
    })
    expect(mysticAptitudeKey("reaction")).toBe("mysticAptitudeReaction")
  })

  it("adds the level to a Magic that power foci do not raise", () => {
    const magic = {
      value: 8, modifiers: [{
        type: "itemFocus", value: 2
      }, {
        type: "initiation", value: 1
      }]
    }
    expect(magicWithoutPowerFocus(magic)).toBe(6)
    expect(mysticAptitudeValue(magic, 2)).toBe(8)
  })

  it("lists its four special properties, labelled in French and English", () => {
    const fr = JSON.parse(read("lang/fr.json")), en = JSON.parse(read("lang/en.json"))
    for (const key of ["mysticAptitudeBody", "mysticAptitudeAgility", "mysticAptitudeReaction", "mysticAptitudeStrength", "purityState", "purityStateStun"]) {
      expect(SR5.specialPropertiesList[key]).toBeTruthy()
      expect(fr[SR5.specialPropertiesList[key]]).toBeTruthy()
      expect(en[SR5.specialPropertiesList[key]]).toBeTruthy()
    }
  })
})

describe("Purity State (Better Than Bad p. 143)", () => {
  it("gives AP -(Magic x 0.5), rounded up (SR5 p. 50)", () => {
    expect(purityStateArmorPenetration(6)).toBe(-3)
    expect(purityStateArmorPenetration(5)).toBe(-3)
    expect(purityStateArmorPenetration(0)).toBe(-0)
  })
})

describe("Skill power (Aetherology p. 39)", () => {
  it("never grants a Matrix skill nor one of the Conjuring, Enchanting or Resonance groups", () => {
    const skills = grantableSkills(SR5.skills, SR5.resonanceSkills)
    for (const key of ["hacking", "cybercombat", "summoning", "banishing", "alchemy", "disenchanting", ...Object.keys(SR5.resonanceSkills)]) expect(skills[key]).toBeUndefined()
    expect(skills.pistols).toBeTruthy()
    expect(skills.sneaking).toBeTruthy()
  })

  it("gives the skill chosen on each Skill power", () => {
    const power = (grantedSkill, value = "skill") => ({
      type: "itemPower", system: {
        grantedSkill, systemEffects: [{
          category: "spiritPower", value
        }]
      }
    })
    expect(isSkillPower(power("pistols"))).toBe(true)
    expect(isSkillPower(power("pistols", "fear"))).toBe(false)
    expect(skillsFromPowers([power("pistols"), power("sneaking"), power("hacking"), power(""), power("blades", "fear")])).toEqual(["pistols", "sneaking"])
  })
})
