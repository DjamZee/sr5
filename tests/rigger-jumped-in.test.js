import {
  describe, it, expect
} from "vitest"
import {
  hasRiggerInterface
} from "../modules/system/rigging-rules.js"

// SR5 p. 267, Rigger 5.0 p. 173: every drone has a rigger interface; a vehicle only with the module
describe("hasRiggerInterface", () => {
  it("a drone without the checkbox still has the interface", () => {
    expect(hasRiggerInterface({
      type: "drone", riggerInterface: false
    })).toBe(true)
  })
  it("a vehicle without the checkbox has none", () => {
    expect(hasRiggerInterface({
      type: "vehicle", riggerInterface: false
    })).toBe(false)
  })
  it("a vehicle with the checkbox has one", () => {
    expect(hasRiggerInterface({
      type: "vehicle", riggerInterface: true
    })).toBe(true)
  })
  it("an actor without a vehicle type reads the checkbox", () => {
    expect(hasRiggerInterface({
      type: "", riggerInterface: false
    })).toBe(false)
    expect(hasRiggerInterface(undefined)).toBe(false)
  })
})
