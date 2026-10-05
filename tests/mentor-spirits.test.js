import {
  describe, it, expect
} from "vitest"
import {
  mentorPathFor, mentorEffectApplies, drainFloor, maskedDrain, extraMentors
} from "../modules/entities/items/mentor-spirits.js"

describe("mentor spirit blocks (SR5 p. 324)", () => {
  it("gives magicians the Magician block and adepts the Adept block", () => {
    expect(mentorPathFor("magician")).toBe("magician")
    expect(mentorPathFor("aspectedMagician")).toBe("magician")
    expect(mentorPathFor("adept")).toBe("adept")
  })

  it("lets a mystic adept draw only on the block picked", () => {
    expect(mentorPathFor("mysticalAdept", "adept")).toBe("adept")
    expect(mentorPathFor("mysticalAdept", "magician")).toBe("magician")
    expect(mentorPathFor("mysticalAdept", "")).toBe(null)
  })

  it("applies the All block and the drawback to everyone, the other blocks to their own", () => {
    expect(mentorEffectApplies("all", "adept", 4)).toBe(true)
    expect(mentorEffectApplies("drawback", null, 4)).toBe(true)
    expect(mentorEffectApplies(undefined, null, 4)).toBe(true)
    expect(mentorEffectApplies("magician", "magician", 4)).toBe(true)
    expect(mentorEffectApplies("magician", "adept", 4)).toBe(false)
    expect(mentorEffectApplies("adept", null, 4)).toBe(false)
  })

  it("lies dormant with a Magic of 0, drawback included", () => {
    expect(mentorEffectApplies("all", "magician", 0)).toBe(false)
    expect(mentorEffectApplies("drawback", "magician", 0)).toBe(false)
  })
})

describe("mask of the mentor (Forbidden Arcana p. 176) and Drain floors (SR5 p. 284, 299, 303, 304)", () => {
  it("knows which Drains never go under 2", () => {
    expect(drainFloor({
      type: "spell" 
    })).toBe(2)
    expect(drainFloor({
      type: "summoningResistance" 
    })).toBe(2)
    expect(drainFloor({
      type: "ritualResistance" 
    })).toBe(2)
    expect(drainFloor({
      type: "skillDicePool", typeSub: "binding" 
    })).toBe(2)
    expect(drainFloor({
      type: "skillDicePool", typeSub: "banishing" 
    })).toBe(2)
    expect(drainFloor({
      type: "enchantmentResistance" 
    })).toBe(0)
  })

  it("takes 1 off the Drain, never under its floor", () => {
    expect(maskedDrain(5, 2)).toBe(4)
    expect(maskedDrain(3, 2)).toBe(2)
    expect(maskedDrain(2, 2)).toBe(2)
    expect(maskedDrain(1, 0)).toBe(0)
  })
})

describe("a single mentor (SR5 p. 76)", () => {
  it("lists the mentors beyond the first", () => {
    const items = [{
      type: "itemQuality" 
    }, {
      type: "itemMentorSpirit", name: "Loup" 
    }, {
      type: "itemMentorSpirit", name: "Rat" 
    }]
    expect(extraMentors(items).map(i => i.name)).toEqual(["Rat"])
  })
})
