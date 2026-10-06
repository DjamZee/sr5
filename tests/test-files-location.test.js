import {
  describe, it, expect
} from "vitest"
import fs from "node:fs"
import path from "node:path"

// vitest.config.js only runs tests/**/*.test.js (worktrees under .claude/ ran another branch's tests otherwise).
// A test file written anywhere else would never run, and nothing would say so: this guard says so.
const ROOT = path.resolve(import.meta.dirname, "..")
const SKIPPED = new Set(["node_modules", ".git", ".claude", "tests", "coverage", "packs"])

function testFilesOutsideTests(dir){
  let found = []
  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true
  })){
    if (entry.isDirectory()){
      if (!SKIPPED.has(entry.name)) found = found.concat(testFilesOutsideTests(path.join(dir, entry.name)))
    } else if (/\.(test|spec)\.m?js$/.test(entry.name)){
      found.push(path.relative(ROOT, path.join(dir, entry.name)))
    }
  }
  return found
}

describe("test files", () => {
  it("all live under tests/, the only folder vitest runs", () => {
    expect(testFilesOutsideTests(ROOT)).toEqual([])
  })
})
