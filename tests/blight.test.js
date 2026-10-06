import {
  describe, it, expect
} from "vitest"
import {
  SR5_Toxins
} from "../modules/entities/items/toxins.js"

// Better Than Bad p. 141
describe("blight", () => {
  it("cuts for 12 - (Body or Magic, the higher) hours, at least 1", () => {
    expect(SR5_Toxins.blightHours(3, 6)).toBe(6)
    expect(SR5_Toxins.blightHours(5, 2)).toBe(7)
    expect(SR5_Toxins.blightHours(9, 12)).toBe(1)
    expect(SR5_Toxins.blightHours(0, 0)).toBe(12)
  })

  it("is a book toxin of Power 12 by injection, and with DMSO also by contact", () => {
    expect(SR5_Toxins.BOOK.blight).toMatchObject({
      vector: ["injection"], power: 12, effect: ["manasphereCut"]
    })
    expect(SR5_Toxins.BOOK.blightDmso.vector).toEqual(["contact", "injection"])
  })

  it("recognises a dual-natured being by its power", () => {
    const power = (value) => ({
      type: "itemPower", system: {
        systemEffects: {
          0: {
            category: "spiritPower", value
          }
        }
      }
    })
    expect(SR5_Toxins.isDualNatured({
      items: [power("dualNatured")]
    })).toBe(true)
    expect(SR5_Toxins.isDualNatured({
      items: [power("fear")]
    })).toBe(false)
  })
})
