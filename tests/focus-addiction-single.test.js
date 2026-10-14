import {
  describe, it, expect
} from "vitest"

const {
  focusAddictionEntries
} = await import("../modules/rolls/roll-helpers/addiction.js")

// SR5 p. 416, table of addictions: "Focus — Puissance totale de tous les focus actifs", threshold 2. Measured in game
// (lot 17c): two foci activated one after the other gave two entries, rated 2 and 5, so two tests for one addiction
describe("One addiction for all foci", () => {
  it("the second focus updates the shared entry instead of adding one", () => {
    let list = focusAddictionEntries([], ["Focus A", "Focus B"], "Focus", 2)
    list = focusAddictionEntries(list, ["Focus A", "Focus B"], "Focus", 5)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      name: "Focus", kind: "focus", addiction: {
        type: "psychological", rating: 5, threshold: 2
      }, weekAddiction: {
        value: 6
      }, shot: {
        value: 2
      }
    })
  })

  it("leaves the drug entries alone", () => {
    const drug = {
      name: "Bliss", shot: {
        value: 1
      }, addiction: {
        type: "both", rating: 5, threshold: 3
      }
    }
    const list = focusAddictionEntries([drug], ["Focus A"], "Focus", 2)
    expect(list).toHaveLength(2)
    expect(list[0]).toBe(drug)
  })

  it("merges the older entries named after each focus, keeping the furthest level", () => {
    const older = [{
      name: "Focus A", level: "mild", shot: {
        value: 3
      }
    }, {
      name: "Focus B", level: "moderate", shot: {
        value: 1
      }
    }]
    const list = focusAddictionEntries(older, ["Focus A", "Focus B"], "Focus", 5)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      name: "Focus", kind: "focus", level: "moderate", addiction: {
        rating: 5
      }
    })
  })
})
