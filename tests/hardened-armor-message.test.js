import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "fs"

const lang = (l) => JSON.parse(readFileSync(new URL(`../lang/${l}.json`, import.meta.url), "utf8"))["SR5.INFO_ImmunityToNormalWeapons"]
const source = (f) => readFileSync(new URL(`../modules/rolls/${f}`, import.meta.url), "utf8")

// N60 — SR5 p. 397: a modified DV lower than OR EQUAL to the Hardened Armor rating does nothing; the message
// shown when the attack bounces off must say so, or a DV equal to the armor reads as a contradiction
describe("message d'Armure renforcée", () => {
  it("dit « supérieure ou égale » en français", () => expect(lang("fr")).toContain("supérieure ou égale à la VD"))
  it("dit « greater than or equal » en anglais", () => expect(lang("en")).toContain("greater than or equal to modified DV"))
  it("chaque appel remplit {hardenedArmor}", () => {
    for (let f of ["roll-test-case/test-Defense.js", "roll-prepare-case/rollData-Resistance.js"]){
      let calls = source(f).split('"SR5.INFO_ImmunityToNormalWeapons"').slice(1)
      expect(calls.length).toBeGreaterThan(0)
      for (let c of calls) expect(c.slice(0, 200)).toContain("hardenedArmor:")
    }
  })
})
