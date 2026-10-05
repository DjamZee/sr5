import {
  describe, it, expect
} from "vitest"
import {
  greyManaOf, greyManaResistanceDice, greyManaSustainedPenalty, updateGreyMana, addGreyManaResistance
} from "../modules/system/grey-mana.js"

// Better Than Bad p. 140-141, GM ruling of 05/10 (Q7)
describe("grey mana", () => {
  const armor = (value) => ({
    source: "Veste", type: "itemArmor", value
  })
  const tattoo = (value) => ({
    source: "GreyMan", type: "itemAugmentation", value
  })
  const actor = (magic, modifiers) => ({
    system: {
      specialAttributes: {
        magic: {
          augmented: {
            value: magic
          }
        }
      },
      magic: {
        greyMana: {
          value: 0, modifiers, fromArmor: false
        }
      },
    },
    situationalEffects: [],
  })

  it("armor and tattoo do not add up: only the higher rating counts", () => {
    expect(greyManaOf([armor(2), tattoo(3)])).toEqual({
      rating: 3, fromArmor: false
    })
    expect(greyManaOf([armor(4), tattoo(3)])).toEqual({
      rating: 4, fromArmor: true
    })
    expect(greyManaOf([])).toEqual({
      rating: 0, fromArmor: false
    })
  })

  it("against a beneficial spell, only the armor counts", () => {
    expect(greyManaResistanceDice({
      value: 3, fromArmor: true
    }, true)).toBe(3)
    expect(greyManaResistanceDice({
      value: 3, fromArmor: false
    }, true)).toBe(0)
    expect(greyManaResistanceDice({
      value: 3, fromArmor: false
    })).toBe(3)
  })

  it("an Awakened wearer loses its rating on every test linked to Magic", () => {
    const a = actor(5, [armor(2)])
    updateGreyMana(a, "Mana gris")
    expect(a.system.magic.greyMana.value).toBe(2)
    expect(a.situationalEffects).toEqual([{
      source: "Mana gris", value: -2, when: "", situational: false, scope: "magic"
    }])
  })

  it("a mundane wearer keeps the resistance dice, without the Magic penalty", () => {
    const a = actor(0, [tattoo(1)])
    updateGreyMana(a, "Mana gris")
    expect(a.system.magic.greyMana.value).toBe(1)
    expect(a.situationalEffects).toEqual([])
    const rollData = addGreyManaResistance({
      dicePool: {
        modifiers: []
      }
    }, a, "Mana gris")
    expect(rollData.dicePool.modifiers).toEqual([{
      type: "greyMana", label: "Mana gris", value: 1
    }])
  })

  it("only a sustained spell of an Awakened wearer loses 1 Force and 1 hit", () => {
    const a = actor(5, [])
    a.system.magic.greyMana.value = 2
    expect(greyManaSustainedPenalty(a.system, "sustained")).toBe(1)
    expect(greyManaSustainedPenalty(a.system, "instantaneous")).toBe(0)
    a.system.magic.greyMana.value = 0
    expect(greyManaSustainedPenalty(a.system, "sustained")).toBe(0)
  })
})
