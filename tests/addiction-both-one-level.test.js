import {
  describe, it, expect
} from "vitest"
import {
  addictionPools, worsenAfterTest
} from "../modules/rolls/roll-helpers/addiction.js"

describe("an addiction both physiological and psychological (SR5 p. 415-416)", () => {
  it("is tested with both pools", () => {
    expect(addictionPools("both")).toEqual(["physiological", "psychological"])
  })
  it("gains one level when both tests of the same test fail, not two", () => {
    // Both cards rolled with no addiction yet: the first failure gives Mild, the second finds it taken
    const first = worsenAfterTest("", "")
    expect(first).toEqual({
      level: "mild", attributeLoss: false, already: false
    })
    expect(worsenAfterTest("", first.level).already).toBe(true)
    expect(worsenAfterTest("", first.level).level).toBe("mild")
  })
  it("a later test, rolled at the new level, worsens it again", () => {
    expect(worsenAfterTest("mild", "mild").level).toBe("moderate")
  })
  it("an old card never lowers the addiction", () => {
    expect(worsenAfterTest("", "severe")).toEqual({
      level: "severe", attributeLoss: false, already: true
    })
  })
  it("at Burnout a failure still costs the attribute point", () => {
    expect(worsenAfterTest("burnout", "burnout").attributeLoss).toBe(true)
  })
  it("a card without its level falls back on the level now", () => {
    expect(worsenAfterTest(undefined, "mild").level).toBe("moderate")
  })
})
