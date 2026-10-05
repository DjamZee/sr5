import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  commonPath, planMentorConversion, mentorLinkWarnings
} from "../modules/entities/items/mentor-link.js"

const quality = (id, name) => ({
  id, type: "itemQuality", name, system: {
    customEffects: [{
      category: "skills", target: "system.skills.tracking.test", type: "value", value: 2
    }]
  }, flags: {
  }
})

// Review D1: a mystic adept converted from old qualities lost the bonuses in silence, its path left empty
describe("mystic adept path after conversion (SR5 p. 324)", () => {
  it("takes the path from the variant when every quality of the mentor shares it", () => {
    expect(commonPath([quality("a", "Esprit mentor (Loup) [Adepte]")])).toBe("adept")
    expect(planMentorConversion([quality("a", "Esprit mentor (Loup) [Magicien]")], "Esprit mentor").create[0].mysticPath).toBe("magician")
  })

  it("leaves the path empty when the variants differ, or there is none", () => {
    expect(commonPath([quality("a", "Esprit mentor (Loup) [Adepte]"), quality("b", "Esprit mentor (Loup) [Magicien]")])).toBe("")
    expect(commonPath([quality("a", "Esprit mentor (Chien)")])).toBe("")
  })

  it("warns a mystic adept whose mentor has no path, and nobody else", () => {
    const mentor = {
      id: "m", type: "itemMentorSpirit", name: "Loup", system: {
        mysticPath: ""
      }
    }
    expect(mentorLinkWarnings([mentor], "mysticalAdept")).toContainEqual({
      kind: "mysticPath", mentor: "Loup"
    })
    expect(mentorLinkWarnings([mentor], "magician").some(w => w.kind === "mysticPath")).toBe(false)
    expect(mentorLinkWarnings([{
      ...mentor, system: {
        mysticPath: "adept"
      }
    }], "mysticalAdept").some(w => w.kind === "mysticPath")).toBe(false)
  })

  it("gives the created mentor its path, and the sheet the magic type", () => {
    const code = readFileSync("modules/entities/items/mentor-conversion.js", "utf8")
    expect(code).toContain("mysticPath: c.mysticPath")
    expect(code).toContain("mentorLinkWarnings(plainItems(actor), actor.system?.magic?.magicType)")
    expect(JSON.parse(readFileSync("lang/fr.json", "utf8"))["SR5.MentorWarning_mysticPath"]).toBeTruthy()
  })
})
