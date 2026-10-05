import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Review H3: a structured caster cannot cast recklessly, so the Drain detail has no reckless line either
describe("Structured Spellcasting, Drain detail (Forbidden Arcana p. 43)", () => {
  it("hides the reckless spellcasting line", () => {
    expect(readFileSync("templates/rolls/rollDialogPartial/drain.hbs", "utf8"))
      .toContain('{{#if (and (eq test.type "spell") (not magic.structured))}}')
  })
})
