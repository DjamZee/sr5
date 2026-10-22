import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// The help of the cybereyes setting said the book did not settle what becomes of the vision of
// the metatype. It does : cybereyes take it away, and it has to be bought again as an
// enhancement (SR5 p. 96). Ticked is the rule ; unticked is a choice of the table.
const lang = (code) => JSON.parse(readFileSync(new URL(`../lang/${code}.json`, import.meta.url), "utf-8"))
const keys = ["SR5.HELP_CyberEyesMsg", "SR5.SETTINGS_CyberEyesReplaceNaturalVision_D"]

describe("the help of the cybereyes setting", () => {
  for (const code of ["en", "fr"]) {
    it(`cites the rule of the book in ${code}`, () => {
      const strings = lang(code)
      for (const key of keys) {
        // Page of each edition's book: French p. 96, English p. 94 (tools/pages-vo).
        expect(strings[key]).toContain(code === "fr" ? "SR5 p. 96" : "SR5 p. 94")
        expect(strings[key]).not.toMatch(/does not settle|ne tranche pas|p\. 456/)
      }
    })
  }
})
