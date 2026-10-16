import {
  describe, it, expect
} from "vitest"
import {
  readdirSync, readFileSync, statSync
} from "node:fs"
import path from "node:path"

// Foundry V13 shows the tooltip of data-tooltip only: a data-title shows nothing, and 233 of them were dead in the
// templates (Mélisande, 08/10, after Adrore's feedback C7b). The system's own data-helpTitle (the help panel) is
// another attribute and stays.
const files = (dir, ext) => readdirSync(dir).flatMap(entry => {
  const full = path.join(dir, entry)
  return statSync(full).isDirectory() ? files(full, ext) : entry.endsWith(ext) ? [full] : []
})
const offenders = (list, pattern) => list.filter(file => pattern.test(readFileSync(file, "utf8")))

describe("tooltips are data-tooltip, never data-title", () => {
  it("no template carries data-title", () => {
    expect(offenders(files("templates", ".hbs"), /data-title=/)).toEqual([])
  })

  it("no script writes data-title or dataset.title", () => {
    expect(offenders(files("modules", ".js"), /data-title=|dataset\.title\b/)).toEqual([])
  })
})
