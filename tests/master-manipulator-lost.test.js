import {
  describe, it, expect
} from "vitest"
import {
  masteryFreeSustainedSpells, MANIPULATOR_LOST_ABOVE_MAGIC
} from "../modules/entities/items/magic-masteries.js"

// Review M3, arbitrage de DjamZ: Master Manipulator (Forbidden Arcana p. 38) is lost as a whole as soon as one
// sustained spell has a Force above Magic
describe("Master Manipulator lost above Magic", () => {
  const control = {
    id: "c", category: "manipulation", subCategory: "mental", force: 3
  }

  it("frees a mental Manipulation while nothing sustained exceeds Magic", () => {
    expect([...masteryFreeSustainedSpells([control], 5, {
      masterManipulator: 1
    })]).toEqual(["c"])
  })

  it("frees nothing once any sustained spell, of any kind, exceeds Magic", () => {
    expect(MANIPULATOR_LOST_ABOVE_MAGIC).toBe(true)
    const armor = {
      id: "a", category: "manipulation", subCategory: "physical", force: 6
    }
    expect([...masteryFreeSustainedSpells([control, armor], 5, {
      masterManipulator: 1
    })]).toEqual([])
  })

  it("leaves the Illusionist to its own per-spell rule", () => {
    const mirage = {
      id: "m", category: "illusion", type: "mana", force: 3
    }
    const big = {
      id: "b", category: "illusion", type: "mana", force: 7
    }
    expect([...masteryFreeSustainedSpells([mirage, big], 5, {
      illusionist: 1
    })]).toEqual(["m"])
  })
})
