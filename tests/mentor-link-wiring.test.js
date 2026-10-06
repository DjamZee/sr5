import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

describe("Mentor Spirit quality linked to its mentor (SR5 p. 76): wiring", () => {
  it("the quality model has a blank linkedMentor field", () => {
    expect(read("modules/datamodels/items/itemQuality.js")).toMatch(/linkedMentor:\s*new fields\.StringField\(\{\s*initial:\s*"",\s*blank:\s*true/)
  })

  it("the quality sheet shows the linked mentor select", () => {
    expect(read("templates/items/itemQuality-sheet.hbs")).toContain("quality/linkedMentor-edit.hbs")
    expect(read("templates/items/_partial/editable/quality/linkedMentor-edit.hbs")).toContain('name="system.linkedMentor"')
    expect(read("modules/templates.js")).toContain("quality/linkedMentor-edit.hbs")
    expect(read("modules/entities/items/itemSheet.js")).toContain("context.linkedMentorChoices")
  })

  it("both actor sheets compute the warnings, and the tradition block shows them", () => {
    for (const sheet of ["characterSheet", "gruntSheet"])
      expect(read(`modules/entities/actors/${sheet}.js`)).toContain("actor.mentorWarnings = mentorWarningLines(this.actor)")
    expect(read("templates/actors/_partials/left-tabs/magicUser/tradition.hbs")).toContain("{{#each actor.mentorWarnings}}")
  })

  it("game.sr5 exposes the conversion macro and its undo", () => {
    const init = read("modules/hooks/init.js")
    expect(init).toMatch(/^\s+convertMentorQualities,$/m)
    expect(init).toMatch(/^\s+revertMentorConversion,$/m)
  })

  it("every key exists in French and English", () => {
    const fr = JSON.parse(read("lang/fr.json")), en = JSON.parse(read("lang/en.json"))
    const keys = ["SR5.MentorQualityName", "SR5.LinkedMentor", "SR5.LinkedMentorHint", "SR5.WARN_NotOwnMentor",
      "SR5.MentorWarning_missingQuality", "SR5.MentorWarning_missingMentor", "SR5.MentorWarning_double",
      "SR5.MentorConversionTitle", "SR5.MentorRevertTitle", "SR5.MentorConversionScope", "SR5.MentorConversionSelected",
      "SR5.MentorConversionAll", "SR5.MentorConversionNoActor", "SR5.MentorConversionGMOnly", "SR5.MentorConversionNothing",
      "SR5.MentorConversionLine", "SR5.MentorRevertLine"]
    for (const key of keys){
      expect(fr[key], key).toBeTruthy()
      expect(en[key], key).toBeTruthy()
    }
    expect(fr["SR5.MentorQualityName"]).toBe("Esprit mentor")
  })
})
