import {
  describe, it, expect
} from "vitest"
import {
  backgroundCountFor, manaShiftKind, manaShiftPossible, effectiveSceneBackgroundCount, activeManaShifts
} from "../modules/system/background-count.js"

// Shadow Spells p. 25 (Mana Flux / Mana Ebb) and the GM rulings of 05/10 (Q4: Ebb fails on a neutral or
// negative count; Q5: rituals add up but never take the count past 0)
describe("Mana Flux and Mana Ebb", () => {
  const flux = (expires) => ({
    kind: "flux", expires
  })
  const ebb = (expires) => ({
    kind: "ebb", expires
  })

  it("recognises both rituals in French and in English", () => {
    expect(manaShiftKind("Flux mana")).toBe("flux")
    expect(manaShiftKind("Mana Flux (ancré)")).toBe("flux")
    expect(manaShiftKind("Creux mana")).toBe("ebb")
    expect(manaShiftKind("Mana Ebb")).toBe("ebb")
    expect(manaShiftKind("Transformation sylvestre")).toBe("")
  })

  it("Flux only succeeds on a negative count, Ebb on a positive one", () => {
    expect(manaShiftPossible("flux", -3)).toBe(true)
    expect(manaShiftPossible("flux", 0)).toBe(false)
    expect(manaShiftPossible("flux", 4)).toBe(false)
    expect(manaShiftPossible("ebb", 4)).toBe(true)
    expect(manaShiftPossible("ebb", 0)).toBe(false)
    expect(manaShiftPossible("ebb", -3)).toBe(false)
  })

  it("each running ritual moves the count by 1 toward 0", () => {
    expect(effectiveSceneBackgroundCount({
      backgroundCountValue: -5, backgroundCountSources: [flux(100), flux(100)]
    }, 10)).toBe(-3)
    expect(effectiveSceneBackgroundCount({
      backgroundCountValue: 4, backgroundCountSources: [ebb(100)]
    }, 10)).toBe(3)
  })

  it("never takes the count past 0", () => {
    expect(effectiveSceneBackgroundCount({
      backgroundCountValue: -2, backgroundCountSources: [flux(100), flux(100), flux(100)]
    }, 10)).toBe(0)
    expect(effectiveSceneBackgroundCount({
      backgroundCountValue: 1, backgroundCountSources: [ebb(100), ebb(100)]
    }, 10)).toBe(0)
  })

  it("ignores a ritual of the wrong sign and one that has run out", () => {
    expect(effectiveSceneBackgroundCount({
      backgroundCountValue: 4, backgroundCountSources: [flux(100)]
    }, 10)).toBe(4)
    expect(effectiveSceneBackgroundCount({
      backgroundCountValue: -4, backgroundCountSources: [flux(5)]
    }, 10)).toBe(-4)
    expect(activeManaShifts({
      backgroundCountSources: [flux(5), flux(50)]
    }, 10)).toHaveLength(1)
  })

  it("a negative count is a penalty for the aligned tradition too (area templates)", () => {
    expect(backgroundCountFor(-6, "hermetic", "hermetic")).toBe(-6)
    expect(backgroundCountFor(-6, "", "shamanic")).toBe(-6)
    expect(backgroundCountFor(5, "hermetic", "hermetic")).toBe(5)
    expect(backgroundCountFor(5, "hermetic", "shamanic")).toBe(-5)
  })
})
