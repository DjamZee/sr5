// Nettoyage N2: the local copies of `escape` against the shared one of card-helpers.js. Each local copy is kept here
// word for word, as it stood in local/storage be5a10e56, and run on the same inputs as the shared one, in the world
// the system runs in (Foundry V13, whose foundry.utils.escapeHTML is copied below from 13.351). A copy equal on every
// input is replaced by the import; a copy that differs stays in its file, and this test keeps it there.
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
  {
    file: "modules/interface/calendar-clock.js", replaced: true,
    code: `function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\"": "&quot;", "'": "&#39;"
  })[ch])
}`
  },
  {
    file: "modules/system/calendar-events.js", replaced: true,
    code: `function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\"": "&quot;", "'": "&#39;"
  })[ch])
}`
  },
  {
    file: "modules/interface/commcode-request.js", replaced: true,
    code: `const escape = text => foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")`
  },
  {
    file: "modules/interface/drug-designer.js", replaced: true,
    code: `const escape = s => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "")`
  },
  {
    file: "modules/interface/table-from-compendium.js", replaced: true,
    code: `const escape = text => foundry.utils.escapeHTML(String(text ?? ""))`
  },
  {
    file: "modules/system/implant-essence.js", replaced: true,
    code: `const escape = text => foundry.utils.escapeHTML?.(text ?? "") ?? text`
  },
  // Equal, but in the code against cheating, which the cleaning plan leaves alone (point 8)
  {
    file: "modules/system/overwatch-guard.js", replaced: false, equal: true,
    code: `const escape = text => foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")`
  },
  ...["conceal", "pickpocket", "shared-vision", "scene-indicators"].map(name => ({
    file: `modules/interface/${name}.js`, replaced: false, equal: false,
    code: "const escape = foundry.utils.escapeHTML"
  })),
  {
    file: "modules/system/cyberlimb-notice.js", replaced: false, equal: false,
    code: "const escape = text => foundry.utils.escapeHTML?.(String(text)) ?? String(text)"
  },
  {
    file: "modules/system/mana-shift.js", replaced: false, equal: false,
    code: "const escape = text => foundry.utils.escapeHTML?.(text) ?? text"
  },
  {
    file: "modules/system/matrix-owner-actions.js", replaced: false, equal: false,
    code: "const escape = text => foundry.utils?.escapeHTML?.(String(text)) ?? String(text).replace(/[&<>\"']/g, ch => `&#${ch.charCodeAt(0)};`)"
  }
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

describe("Nettoyage N2: the local copies of escape", () => {
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

  it("shared escape escapes as the core does, and shows nothing for null and undefined", () => {
    expect(shared("<a href=\"x\">O'Neil & co</a>")).toBe("&lt;a href=&quot;x&quot;&gt;O&#x27;Neil &amp; co&lt;/a&gt;")
    expect(shared(null)).toBe("")
    expect(shared(undefined)).toBe("")
    expect(shared(42)).toBe("42")
  })

  for (const copy of COPIES){
    const local = new Function(`${copy.code}\nreturn escape`)()
    const equal = copy.replaced || copy.equal
    it(`${copy.file}: ${equal ? "equal" : "different"} on every input`, () => {
      if (equal) expect(differences(local)).toEqual([])
      else expect(differences(local)).toContain(null)
    })
    it(`${copy.file}: ${copy.replaced ? "imports the shared escape" : "keeps its own escape"}`, () => {
      const source = readFileSync(copy.file, "utf8")
      if (copy.replaced){
        expect(squash(source)).not.toContain(squash(copy.code))
        expect(source).toMatch(/import \{[^}]*\bescape\b[^}]*\} from "[./]*(system\/)?card-helpers\.js"/)
      } else expect(squash(source)).toContain(squash(copy.code))
    })
  }
})
