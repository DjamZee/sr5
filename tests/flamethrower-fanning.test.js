import {
  describe, it, expect
} from 'vitest'
import {
  fanningTargetsLinked
} from '../modules/entities/items/weaponTraits.js'
import {
  SR5_ConverterHelpers
} from '../modules/rolls/roll-helpers/converter.js'

//Gun H(e)aven 3 p. 3: fanning strikes up to three targets, each within four meters of the others, for two units of ammo
describe("Flamethrower fanning", () => {
  it("accepts a chain of targets 3 m apart", () => {
    expect(fanningTargetsLinked([
      [0, 3, 6],
      [3, 0, 3],
      [6, 3, 0],
    ])).toBe(true)
  })
  it("refuses a target 4.5 m from both others", () => {
    expect(fanningTargetsLinked([
      [0, 3, 4.5],
      [3, 0, 4.5],
      [4.5, 4.5, 0],
    ])).toBe(false)
  })
  it("costs a Complex Action and two units of ammo", () => {
    expect(SR5_ConverterHelpers.firingModeToBullet("FN")).toBe(2)
    expect(SR5_ConverterHelpers.firingModeToAction("FN")).toEqual({
      type: "complex", value: 1, source: "attack"
    })
  })
})
