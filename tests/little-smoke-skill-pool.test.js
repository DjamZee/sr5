import {
  describe, it, expect
} from "vitest"

const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")

//Little Smoke, crash (Chrome Flesh p. 192): "la Perception de l'utilisateur et sa Volonté sont réduits à 1". The skill
//rating falls to 1; its test keeps the linked attribute and the other modifiers (lot 17c: the pool fell to 1 die)
describe("A capped skill rating passes its cut to the test, not its ceiling", () => {
  const smoke = {
    source: "Petite fumée", type: "itemDrug", value: 0, ceiling: 1
  }
  const pool = (rating) => {
    SR5_EntityHelpers.updateValue(rating, 0)
    const test = {
      base: 0, modifiers: [{
        source: "Intuition", type: "linkedAttribute", value: 4
      }, {
        source: "Perception", type: "skillRating", value: rating.base
      }]
    }
    test.modifiers = test.modifiers.concat(SR5_EntityHelpers.ratingModifiersForTest(rating))
    SR5_EntityHelpers.updateDicePool(test, 0)
    return test.dicePool
  }

  it("Perception 3 under Little Smoke: rating 1 + Intuition 4 = 5 dice", () => {
    expect(pool({
      base: 3, modifiers: [smoke]
    })).toBe(5)
  })

  it("a bonus on the rating is cut too: 3 + 2 capped at 1", () => {
    expect(pool({
      base: 3, modifiers: [{
        source: "Cyber", value: 2
      }, smoke]
    })).toBe(5)
  })

  it("a rating already at or below the cap is left alone", () => {
    expect(pool({
      base: 1, modifiers: [smoke]
    })).toBe(5)
  })

  it("without a cap, the rating modifiers go to the test unchanged", () => {
    const bonus = {
      source: "Cyber", value: 2
    }
    expect(SR5_EntityHelpers.ratingModifiersForTest({
      base: 3, modifiers: [bonus]
    })).toEqual([bonus])
  })
})
