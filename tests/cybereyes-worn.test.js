import {
  describe, it, expect
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// In this system the pin of an implant says it is worn : its effects only apply once pinned.
// Cybereyes left unpinned still took the vision of the metatype away, while giving nothing.
const cyberEyes = (isActive) => ({
  type: "itemAugmentation",
  system: {
    isActive, category: "eyeware", isAccessory: false, capacity: {
      base: 4
    }
  },
})

describe("SR5_CharacterUtility.getCyberEyes", () => {
  it("finds the cybereyes the character wears", () => {
    const eyes = cyberEyes(true)
    expect(SR5_CharacterUtility.getCyberEyes({
      items: [eyes]
    })).toBe(eyes)
  })

  it("ignores cybereyes that are not pinned", () => {
    expect(SR5_CharacterUtility.getCyberEyes({
      items: [cyberEyes(false)]
    })).toBeNull()
  })
})
