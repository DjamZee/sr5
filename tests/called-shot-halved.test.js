import {
  describe, it, expect
} from 'vitest'
import {
  halveCalledShot
} from '../modules/entities/items/weaponTraits.js'
import {
  SR5
} from '../modules/config.js'

//Aim for Perfection (Assassin's Primer p. 15): "-2 dice instead of -4"
describe("Aim for Perfection", () => {
  it("halves Called Shot penalties toward zero", () => {
    expect(halveCalledShot(-4)).toBe(-2)
    expect(halveCalledShot(-8)).toBe(-4)
    expect(halveCalledShot(-10)).toBe(-5)
    expect(halveCalledShot(-5)).toBe(-2)
  })
  it("leaves a bonus or no modifier alone", () => {
    expect(halveCalledShot(0)).toBe(0)
    expect(halveCalledShot(2)).toBe(2)
  })
  it("is offered to quality effects", () => {
    expect(SR5.specialPropertiesList.calledShotHalved).toBe("SR5.CalledShotHalved")
    expect(SR5.specialPropertiesList.streetCredDivisor).toBe("SR5.StreetCredDivisor")
  })
})
