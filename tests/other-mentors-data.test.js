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
  OTHER_MENTORS
} from "./fixtures/other-mentors.js"

// The 36 mentors outside Forbidden Arcana as data: every effect aims at a target the system knows
describe("Mentors outside Forbidden Arcana as data", () => {
  it("covers the 36 mentors, each with its book and page", () => {
    expect(OTHER_MENTORS).toHaveLength(36)
    const count = book => OTHER_MENTORS.filter(m => m.book === book).length
    expect([count("SR5"), count("GRI"), count("HT"), count("HS"), count("BTB")]).toEqual([16, 8, 4, 7, 1])
    for (const m of OTHER_MENTORS){
      expect(m.book, m.name).toBeTruthy()
      expect(m.page, m.name).toBeGreaterThan(0)
    }
    expect(OTHER_MENTORS.filter(m => m.name === "Alligator")).toHaveLength(1)
  })

  it("resists its drawback with two known attributes", () => {
    const attributes = Object.keys(SR5.allAttributes)
    for (const m of OTHER_MENTORS){
      expect(m.resistAttributes, m.name).toHaveLength(2)
      for (const a of m.resistAttributes) expect(attributes, `${m.name}: ${a}`).toContain(a)
    }
  })

  it("aims every effect at a known skill, spell category, spirit type or resistance", () => {
    const known = {
      skills: Object.keys(SR5.skills), categories: Object.keys(SR5.spellCategories), spirits: Object.keys(SR5.spiritTypes),
      resistances: Object.keys(SR5.characterResistances), attributes: Object.keys(SR5.allAttributes),
    }
    for (const mentor of OTHER_MENTORS){
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

  it("gives a magician the Magician block that an adept does not get", () => {
    const wolf = OTHER_MENTORS.find(m => m.name === "Loup")
    const applied = path => wolf.effects.filter(e => mentorEffectApplies(e.mentorPath, path, 5)).length
    expect(applied("magician")).toBe(4)
    expect(applied("adept")).toBe(1)
  })
})
