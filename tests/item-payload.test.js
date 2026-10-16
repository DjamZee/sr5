import {
  describe, it, expect
} from "vitest"
import {
  sr5StackPayload, sr5LineLabel, STACKABLE_TYPES
} from "../modules/interface/item-payload.js"
import {
  SR5Shop
} from "../modules/interface/shop.js"

// The shop and the table card hand items over by the same rule.

describe("handing over a number of one item", () => {
  it("stacks what carries a quantity, and copies the rest one by one", () => {
    expect(sr5StackPayload({
      type: "itemAmmunition", system: {
        quantity: 10
      }
    }, 12)).toEqual([{
      type: "itemAmmunition", system: {
        quantity: 12
      }
    }])
    const swords = sr5StackPayload({
      type: "itemWeapon", system: {
      }
    }, 2)
    expect(swords).toHaveLength(2)
    expect(swords[0]).not.toBe(swords[1])
  })

  it("counts a stack by the entry when asked (the shop's boxes of 10 rounds)", () => {
    expect(sr5StackPayload({
      type: "itemAmmunition", system: {
        quantity: 10
      }
    }, 3, 10)[0].system.quantity).toBe(30)
  })

  it("is the shop's own rule", () => {
    expect(SR5Shop.STACKABLE_TYPES).toBe(STACKABLE_TYPES)
    expect(SR5Shop.lineLabel("Medkit", 3)).toBe(sr5LineLabel("Medkit", 3))
    expect(sr5LineLabel("Medkit", 1)).toBe("Medkit")
    expect(sr5LineLabel("Medkit", 3)).toBe("Medkit (x3)")
  })
})
