import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

const read = path => readFileSync(path, "utf8")
const fr = JSON.parse(read("lang/fr.json"))
const en = JSON.parse(read("lang/en.json"))

// Hybrid traditions (Forbidden Arcana p. 98): nothing to automate, the drain and the spirits stay those of the
// paradigm's tradition; the tradition sheet says so, and how to make one
describe("Hybrid tradition help (Forbidden Arcana p. 98)", () => {
  it("is shown on the tradition sheet, in French and in English", () => {
    expect(read("templates/items/blocks/tradition/tradition-stat.hbs")).toContain("SR5.TraditionHybridHint")
    expect(fr["SR5.TraditionHybridHint"]).toMatch(/Arcanes Interdites p\. 98/)
    expect(fr["SR5.TraditionHybridHint"]).toMatch(/drain/)
    expect(en["SR5.TraditionHybridHint"]).toMatch(/Forbidden Arcana p\. 101/) // English book page (tools/pages-vo)
  })
})

// Augmentation bundles (Chrome Flesh p. 96): Essence × 0.9 and no price discount, the book's sum of standard prices
describe("Augmentation bundle help (Chrome Flesh p. 96)", () => {
  it("says there is no price discount", () => {
    expect(fr["SR5.AugmentationBundleHint"]).toMatch(/0,9/)
    expect(fr["SR5.AugmentationBundleHint"]).toMatch(/Aucun rabais de prix/)
    expect(en["SR5.AugmentationBundleHint"]).toMatch(/No price discount/)
  })
})
