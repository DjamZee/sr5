import {
  describe, it, expect
} from "vitest"
import {
  situationalMovement, situationalReadable, movementEffectKey, movementEffectOn, movementBoxes, toggleMovementBox
} from "../modules/rolls/roll-helpers/situational.js"

describe("situational effects on a movement rate (Dark Terrors p. 180)", () => {
  it("are recognised on the rates, the multipliers and the sprint bonus, not on the movement tests", () => {
    expect(situationalMovement("system.movements.walk.multiplier")).toBe(true)
    expect(situationalMovement("system.movements.run.multiplier")).toBe(true)
    expect(situationalMovement("system.movements.run.movement")).toBe(true)
    expect(situationalMovement("system.movements.run.extraMovement")).toBe(true)
    expect(situationalMovement("system.movements.swim.maximum")).toBe(true)
    // The movement tests are read by the roll dialogs, as before
    expect(situationalMovement("system.movements.run.test")).toBe(false)
    expect(situationalReadable("system.movements.run.test")).toBe(true)
    expect(situationalMovement("system.attributes.agility.augmented")).toBe(false)
    expect(situationalMovement(undefined)).toBe(false)
  })

  it("count only while their box is ticked", () => {
    const key = movementEffectKey("item1", 0)
    expect(key).toBe("item1.0")
    expect(movementEffectOn([], key)).toBe(false)
    expect(movementEffectOn(undefined, key)).toBe(false)
    expect(movementEffectOn(["item1.0"], key)).toBe(true)
  })

  it("show one box for Feral Run, which raises both walking and running", () => {
    const boxes = movementBoxes([
      {
        key: "f.0", source: "Course Férale", when: "à quatre pattes", on: false
      },
      {
        key: "f.1", source: "Course Férale", when: "à quatre pattes", on: false
      },
      {
        key: "g.0", source: "Autre", when: "", on: true
      },
    ])
    expect(boxes).toEqual([
      {
        source: "Course Férale", when: "à quatre pattes", keys: ["f.0", "f.1"], on: false
      },
      {
        source: "Autre", when: "", keys: ["g.0"], on: true
      },
    ])
  })

  it("tick and untick all the effects of a box", () => {
    expect(toggleMovementBox(["x"], ["f.0", "f.1"], true)).toEqual(["x", "f.0", "f.1"])
    expect(toggleMovementBox(["x", "f.0", "f.1"], ["f.0", "f.1"], false)).toEqual(["x"])
    expect(toggleMovementBox(undefined, ["f.0"], true)).toEqual(["f.0"])
    // Ticking twice does not double a key
    expect(toggleMovementBox(["f.0"], ["f.0"], true)).toEqual(["f.0"])
  })
})
