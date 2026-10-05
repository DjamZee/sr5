import {
  describe, it, expect
} from "vitest"
import {
  BACKGROUND_COUNT_PHENOMENA, phenomenonNoise, phenomenonOptions
} from "../modules/interface/background-count-phenomena.js"
import fr from "../lang/fr.json"
import en from "../lang/en.json"

// Aetherologie p. 33-35: each phenomenon's preset sits inside the book's range
describe("background count phenomena", () => {
  it.each([
    ["theMist", 3, 10], ["daoineannDraoidheil", 8, 12], ["fovea", -12, -7],
    ["mayaCloud", 14, 16], ["theVeil", 12, 14], ["theVoid", -20, -13],
  ])("%s stays within the book's range", (key, min, max) => {
    const v = BACKGROUND_COUNT_PHENOMENA[key].value
    expect(v).toBeGreaterThanOrEqual(min)
    expect(v).toBeLessThanOrEqual(max)
  })

  it("the Daoineann Draoidheil is aligned with the druidic tradition", () => {
    expect(BACKGROUND_COUNT_PHENOMENA.daoineannDraoidheil.alignment).toBe("druid")
  })

  it("only the Mist and the Maya Cloud add their Force to the noise", () => {
    expect(phenomenonNoise("theMist", 7)).toBe(7)
    expect(phenomenonNoise("mayaCloud", "15")).toBe(15)
    expect(phenomenonNoise("theVoid", -16)).toBe(0)
    expect(phenomenonNoise("", 5)).toBe(0)
  })

  it("every phenomenon has a label and a hint in both languages", () => {
    for (const key of Object.keys(phenomenonOptions())) {
      for (const lang of [fr, en]) {
        expect(lang[`SR5.BGPhenomenon_${key}`]).toBeTruthy()
        expect(lang[`SR5.BGPhenomenonHint_${key}`]).toBeTruthy()
      }
    }
  })
})
