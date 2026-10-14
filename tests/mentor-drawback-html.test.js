import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Lot 34: a mentor spirit's drawback is an HTMLField (Megapack data with <p style=…>):
// the summary shows it enriched, never as raw tags, and the editor is a rich-text one.
describe("mentor spirit drawback", () => {
  it("is enriched by the item sheet", () => {
    const sheet = readFileSync("modules/entities/items/itemSheet.js", "utf8")
    expect(sheet).toMatch(/context\.enrichedDrawback = await enrich\(item\.system\.drawback\)/)
  })

  it("is shown as HTML in the summary and edited in a prose-mirror", () => {
    const summary = readFileSync("templates/items/_partial/summary/mentorSpirit-summary.hbs", "utf8")
    expect(summary).toContain("{{{enrichedDrawback}}}")
    expect(summary).not.toContain("{{system.drawback}}</span>")
    const edit = readFileSync("templates/items/_partial/editable/mentorSpirit/mentorSpirit-edit.hbs", "utf8")
    expect(edit).toContain('<prose-mirror name="system.drawback"')
  })
})
