import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  drawbackAttributes
} from "../modules/entities/items/mentor-spirits.js"

// The test against a mentor's drawback: Charisma + Willpower (SR5 p. 325), Willpower + Intuition for Chaos and
// Oracle, Charisma + Intuition for Peacemaker (Street Grimoire p. 200-201)
describe("drawback resistance attributes", () => {
  it("defaults to Charisma + Willpower", () => {
    expect(drawbackAttributes(undefined)).toEqual(["charisma", "willpower"])
    expect(drawbackAttributes({
      first: "", second: ""
    })).toEqual(["charisma", "willpower"])
  })

  it("follows the mentor when the book says otherwise", () => {
    expect(drawbackAttributes({
      first: "willpower", second: "intuition"
    })).toEqual(["willpower", "intuition"])
  })

  it("is a field of the mentor, offered on its sheet and read by the roll", () => {
    expect(readFileSync("modules/datamodels/items/itemMentorSpirit.js", "utf8")).toMatch(/resistAttributes: new fields\.SchemaField/)
    expect(readFileSync("templates/items/_partial/editable/mentorSpirit/mentorSpirit-edit.hbs", "utf8")).toContain('name="system.resistAttributes.second"')
    const roll = readFileSync("modules/rolls/roll-prepare-case/rollData-MentorDrawback.js", "utf8")
    expect(roll).toContain("drawbackAttributes(item.system.resistAttributes)")
    expect(roll).not.toContain("attributes.charisma.augmented")
  })
})
