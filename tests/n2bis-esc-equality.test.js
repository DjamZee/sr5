// Nettoyage N2 bis: the local copies named `esc` against the shared escape of card-helpers.js, by the method of
// tests/n2-escape-equality.test.js. Each local copy is kept here word for word, as it stood in local/storage
// a248b750e, and run on the same inputs as the shared one, with Foundry 13.351's foundry.utils.escapeHTML.
// A copy equal on every input is replaced by the import; a copy that differs stays in its file.
import {
  describe, it, expect, beforeAll, afterAll
} from "vitest"
import {
  readFileSync
} from "node:fs"

const {
  escape: shared
} = await import("../modules/system/card-helpers.js")

// foundry.utils.escapeHTML of Foundry 13.351 (common/utils/helpers.mjs)
const ESCAPE_HTML_TABLE = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#x27;"
}
const ESCAPE_HTML_REGEX = new RegExp(`[${Object.keys(ESCAPE_HTML_TABLE).join("")}]`, "g")
const escapeHTML = value => String(value).replace(ESCAPE_HTML_REGEX, c => ESCAPE_HTML_TABLE[c])

const INPUTS = [
  "plain", "", "'", "\"", "&", "<", ">", "<a href=\"x\">O'Neil & co</a>", "&amp;", null, undefined, 0, 42, -1.5, NaN,
  true, false, {
    toString: () => "<obj>"
  }
]

const COPIES = [
  ...["modules/system/combat-maneuvers.js", "modules/system/explosive-charge.js"].map(file => ({
    file, replaced: true,
    code: `const esc = text => foundry.utils.escapeHTML(String(text ?? ""))`
  })),
  {
    file: "modules/canvas/pan-crown/pan-crown.js", replaced: false,
    code: "const esc = s => foundry.utils.escapeHTML?.(String(s)) ?? String(s)"
  },
  // three copies in this file, and entityActor-helpers.js keeps its exports (read by path by Technologie prototype)
  ...["modules/canvas/pan-crown/pan-perception-card.js", "modules/entities/actors/entityActor-helpers.js"].map(file => ({
    file, replaced: false,
    code: "const esc = foundry.utils.escapeHTML"
  })),
]

const squash = text => text.replace(/\s+/g, " ").trim()
const outcome = (fn, input) => {
  try {
    return {
      value: fn(input)
    }
  } catch (e) {
    return {
      threw: e.constructor.name
    }
  }
}
const differences = fn => INPUTS.filter(input => {
  const mine = outcome(fn, input), theirs = outcome(shared, input)
  return !Object.is(mine.value, theirs.value) || mine.threw !== theirs.threw
})

describe("Nettoyage N2 bis: the local copies of esc", () => {
  let saved
  beforeAll(() => {
    saved = globalThis.foundry
    globalThis.foundry = {
      ...saved, utils: {
        ...saved?.utils, escapeHTML
      }
    }
  })
  afterAll(() => {
    globalThis.foundry = saved
  })

  for (const copy of COPIES){
    const local = new Function(`${copy.code}\nreturn esc`)()
    it(`${copy.file}: ${copy.replaced ? "equal" : "different"} on every input`, () => {
      if (copy.replaced) expect(differences(local)).toEqual([])
      else expect(differences(local)).toEqual(expect.arrayContaining([null, undefined]))
    })
    it(`${copy.file}: ${copy.replaced ? "imports the shared escape" : "keeps its own esc"}`, () => {
      const source = readFileSync(copy.file, "utf8")
      if (copy.replaced){
        expect(squash(source)).not.toContain(squash(copy.code))
        expect(source).toMatch(/import \{[^}]*\bescape as esc\b[^}]*\} from "\.\/card-helpers\.js"/)
      } else expect(squash(source)).toContain(squash(copy.code))
    })
  }
})
