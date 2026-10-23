import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"

// The English addiction texts cite the English core rulebook: Addiction Tests are on p. 414 there (p. 416 in French)
const read = file => JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""))
const en = read("lang/en.json")
const fr = read("lang/fr.json")

describe("addiction page references", () => {
  it("cites p. 414 in English and p. 416 in French for an addiction worsened once per test", () => {
    expect(en["SR5.AddictionAlreadyWorsened"]).toContain("SR5 p. 414")
    expect(fr["SR5.AddictionAlreadyWorsened"]).toContain("SR5 p. 416")
  })
})
