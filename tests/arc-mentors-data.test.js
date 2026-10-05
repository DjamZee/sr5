import {
  describe, it, expect
} from "vitest"
import {
  SR5
} from "../modules/config.js"
import {
  situationalReadable
} from "../modules/rolls/roll-helpers/situational.js"
import {
  mentorEffectApplies, MENTOR_PATHS
} from "../modules/entities/items/mentor-spirits.js"
import {
  ARC_MENTORS
} from "./fixtures/arc-mentors.js"

// The 18 mentors of Forbidden Arcana p. 90-95 as data: every effect aims at a target the system knows
describe("Forbidden Arcana mentors as data (p. 90-95)", () => {
  it("covers the 18 mentors of the book, each with its page", () => {
    expect(ARC_MENTORS).toHaveLength(18)
    for (const m of ARC_MENTORS) expect(m.page).toBeGreaterThanOrEqual(90)
  })

  it("aims every effect at a known skill, spell category, spirit type or resistance", () => {
    const known = {
      skills: Object.keys(SR5.skills), categories: Object.keys(SR5.spellCategories), spirits: Object.keys(SR5.spiritTypes),
      resistances: Object.keys(SR5.characterResistances), attributes: Object.keys(SR5.allAttributes),
    }
    for (const mentor of ARC_MENTORS){
      for (const e of mentor.effects){
        expect(MENTOR_PATHS, `${mentor.name}: ${e.mentorPath}`).toContain(e.mentorPath)
        const parts = e.target.split(".")
        if (parts[1] === "skills"){
          expect(known.skills, `${mentor.name}: ${e.target}`).toContain(parts[2])
          if (parts[3] === "spellCategory") expect(known.categories, e.target).toContain(parts[4])
          if (parts[3] === "spiritType") expect(known.spirits, e.target).toContain(parts[4])
        } else if (parts[1] === "resistances") expect(known.resistances, e.target).toContain(parts[2])
        else if (parts[1] === "rollTests") expect(known.attributes, e.target).toContain(parts[2])
        else throw new Error(`${mentor.name}: unexpected target ${e.target}`)
        // A situational effect is only offered where a roll reads it
        if (e.situational) expect(situationalReadable(e.target), `${mentor.name}: ${e.target}`).toBe(true)
      }
    }
  })

  it("gives a magician and an adept different blocks of the same mentor", () => {
    const wolf = ARC_MENTORS.find(m => m.name === "Loup (alt)")
    const applied = path => wolf.effects.filter(e => mentorEffectApplies(e.mentorPath, path, 5)).length
    expect(applied("magician")).toBe(7)
    expect(applied("adept")).toBe(4)
  })
})
