import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Pack 5 (§ 5, version anglaise): fr.json and en.json carry the same keys, the same {placeholders}, and en.json
// holds no French left untranslated. scripts/check-lang-keys.js checks the keys at commit time; this test keeps
// the check in the suite.
const read = file => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""))

// "SR5.X": "..." at the root, "TYPES": { ... } nested: every leaf by its full dotted path
const flatten = (object, prefix = "") => Object.entries(object).flatMap(([key, value]) =>
  value !== null && typeof value === "object" ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]])

const fr = Object.fromEntries(flatten(read("lang/fr.json")))
const en = Object.fromEntries(flatten(read("lang/en.json")))

const placeholders = text => [...new Set(String(text).match(/\{\w+\}/g) ?? [])].sort()

// The English text names the item's type too; the code passes it to both languages
const PLACEHOLDER_EXCEPTIONS = ["SR5.DIALOG_WarningPermanentDelete"]

// Proper names with an accent in the English books too (Laés), or a cipher's name (Vigenère)
const ACCENT_EXCEPTIONS = ["SR5.DrugLaes", "SR5.SETTINGS_CommcodeCipher_D", "SR5.CIPHERTOOL_Hint"]
const FRENCH_LETTERS = /[àâçéèêëîïôûùœ«»]/i

describe("lang/fr.json and lang/en.json", () => {
  it("has every French key in English", () => {
    expect(Object.keys(fr).filter(key => !(key in en))).toEqual([])
  })

  it("has every English key in French", () => {
    expect(Object.keys(en).filter(key => !(key in fr))).toEqual([])
  })

  it("gives the same {placeholders} to both languages", () => {
    const differing = Object.keys(fr).filter(key => key in en && !PLACEHOLDER_EXCEPTIONS.includes(key) &&
      placeholders(fr[key]).join() !== placeholders(en[key]).join())
    expect(differing).toEqual([])
  })

  it("leaves no French accent or guillemet in the English texts", () => {
    const french = Object.keys(en).filter(key => !ACCENT_EXCEPTIONS.includes(key) && FRENCH_LETTERS.test(en[key]))
    expect(french).toEqual([])
  })

  it("flattens nested keys by their full path", () => {
    expect(flatten({
      A: "a", TYPES: {
        Item: {
          x: "y"
        }
      }
    })).toEqual([["A", "a"], ["TYPES.Item.x", "y"]])
  })
})
