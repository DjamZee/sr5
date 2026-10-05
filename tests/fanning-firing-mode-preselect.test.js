import {
  describe, it, expect
} from "vitest"
import {
  SR5_ConverterHelpers
} from "../modules/rolls/roll-helpers/converter.js"

//Flamethrower fanning (Gun H(e)aven 3 p. 3): the sweep comes from the targets of each attack
const localize = key => key
describe("Fanning preselection", () => {
  const flamethrower = current => ({
    singleShot: true, semiAutomatic: false, burstFire: false, fullyAutomatic: false, current
  })
  it("gives the sweep to several targets whatever mode the weapon kept", () => {
    expect(SR5_ConverterHelpers.initialFiringMode(flamethrower("SS"), ["a", "b"])).toBe("FN")
  })
  it("does not carry the sweep over to a single target", () => {
    expect(SR5_ConverterHelpers.firingModeToCode(flamethrower("FN"), localize)).toBe("SS")
    expect(SR5_ConverterHelpers.initialFiringMode(flamethrower("FN"), undefined)).toBe("SS")
  })
})
