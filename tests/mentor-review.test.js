import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  mentorMaskOn, MYSTIC_ADEPT_MASK_DRAIN
} from "../modules/entities/items/mentor-spirits.js"

// Review of 2a (Lena): the small points
describe("mentor spirits, review points", () => {
  it("applies the mentor once every item is parsed, so that the Essence lost is known (R1)", () => {
    const code = readFileSync("modules/entities/actors/entityActor.js", "utf8")
    expect(code).toContain("mentorSpirits.push(i)")
    expect(code).toMatch(/for \(const mentor of mentorSpirits\) SR5_CharacterUtility\.applyMentorSpirit\(mentor, actor\)/)
  })

  it("gives the disadvantage card a verdict against the threshold", () => {
    const code = readFileSync("modules/rolls/roll-test-case/test-MentorDrawback.js", "utf8")
    expect(code).toContain(">= (Number(threshold) || 0)")
    expect(readFileSync("modules/rolls/roll-test.js", "utf8")).toContain("SR5_AddRollInfo.mentorDrawbackInfo(cardData)")
    const fr = JSON.parse(readFileSync("lang/fr.json", "utf8"))
    expect(fr["SR5.MentorDrawbackResisted"]).toBeTruthy()
    expect(fr["SR5.MentorDrawbackFailed"]).toBeTruthy()
  })

  it("has no double parenthesis on a dormant mentor", () => {
    expect(JSON.parse(readFileSync("lang/fr.json", "utf8"))["SR5.MentorDormant"]).not.toContain("(")
  })

  it("shows on every Resist Drain button the Drain after the Mask", () => {
    for (const f of ["test-ActionHit.js", "test-DefenseResult.js", "test-ResistanceResult.js", "test-Skill.js", "test-Spell.js"]){
      const code = readFileSync(`modules/rolls/roll-test-case/${f}`, "utf8")
      expect(code, f).not.toContain("(${cardData.magic.drain.value})`")
      expect(code, f).toContain("drainShown(cardData, ")
    }
  })

  it("keeps the mystic adept on the Adept path out of the Mask's Drain unless the switch says so", () => {
    const system = {
      mask: true
    }
    expect(mentorMaskOn("magician", system, true, 5, "mysticalAdept")).toBe(true)
    expect(mentorMaskOn("adept", system, true, 5, "mysticalAdept")).toBe(MYSTIC_ADEPT_MASK_DRAIN)
    expect(mentorMaskOn("adept", system, true, 5, "adept")).toBe(false)
    expect(mentorMaskOn("magician", system, false, 5, "magician")).toBe(false)
  })
})
