import {
  describe, it, expect
} from "vitest"
import {
  RG_SETTINGS, sizeFromStrengthBody, targetSizeModifier, movementModifiers, phaseMeters, nextPhase, armorPenalty,
  defenselessDamageBonus, nextAlternativeTurn
} from "../modules/system/rg-combat-options.js"
import {
  SETTINGS_CATALOG
} from "../modules/system/settings-catalog.js"

const body = (strength, bodyValue) => ({
  type: "actorPc", system: {
    attributes: {
      strength: {
        augmented: {
          value: strength
        }
      }, body: {
        augmented: {
          value: bodyValue
        }
      }
    }
  }
})

describe("Run & Gun optional rules (RG p. 121-125)", () => {
  it("are six world settings of the Combat tab, tagged as an option of a book", () => {
    expect(Object.keys(RG_SETTINGS)).toHaveLength(6)
    for (const key of Object.values(RG_SETTINGS)) expect(SETTINGS_CATALOG[key]).toEqual(["combat", "book"])
  })

  it("RG2: size by Strength + Body, 2-4 small, 5-10 medium, 11-15 large, above huge (RG p. 122)", () => {
    expect(sizeFromStrengthBody(2)).toBe(-1)
    expect(sizeFromStrengthBody(4)).toBe(-1)
    expect(sizeFromStrengthBody(5)).toBe(0)
    expect(sizeFromStrengthBody(10)).toBe(0)
    expect(sizeFromStrengthBody(11)).toBe(1)
    expect(sizeFromStrengthBody(15)).toBe(1)
    expect(sizeFromStrengthBody(16)).toBe(2)
    expect(targetSizeModifier(body(6, 7))).toBe(1)
    expect(targetSizeModifier(body(8, 9))).toBe(2)
  })

  it("RG2: drones by their category, vehicles +1, nothing known 0", () => {
    const drone = {
      type: "actorDrone", system: {
        type: "drone"
      }
    }
    expect(targetSizeModifier(drone, "microdrone")).toBe(-3)
    expect(targetSizeModifier(drone, "minidrone")).toBe(-2)
    expect(targetSizeModifier(drone, "smallDrone")).toBe(-1)
    expect(targetSizeModifier(drone, "mediumDrone")).toBe(0)
    expect(targetSizeModifier(drone, "largeDrone")).toBe(1)
    expect(targetSizeModifier(drone, null)).toBe(0)
    expect(targetSizeModifier({
      type: "actorDrone", system: {
        type: "vehicle"
      }
    })).toBe(1)
    expect(targetSizeModifier({
      type: "actorAgent", system: {
      }
    })).toBe(0)
  })

  it("RG3: the speed table, a distance between two rows in the higher one (RG p. 122)", () => {
    expect(movementModifiers(0)).toEqual({
      attack: 0, defense: 0
    })
    expect(movementModifiers(6)).toEqual({
      attack: 0, defense: 0
    })
    expect(movementModifiers(6.5)).toEqual({
      attack: -1, defense: 0
    })
    expect(movementModifiers(20)).toEqual({
      attack: -2, defense: -1
    })
    expect(movementModifiers(45)).toEqual({
      attack: -4, defense: -3
    })
    expect(movementModifiers(71)).toEqual({
      attack: -6, defense: -5
    })
  })

  it("RG3: the meters of the last Action Phase, started again in a new phase, none in another round", () => {
    let phase = nextPhase(null, "1:12", 4)
    phase = nextPhase(phase, "1:12", 5)
    expect(phase).toEqual({
      pass: "1:12", meters: 9
    })
    expect(nextPhase(phase, "2:2", 3)).toEqual({
      pass: "2:2", meters: 3
    })
    const flag = {
      combatId: "c", round: 2, meters: 30, phase
    }
    expect(phaseMeters(flag, "c", 2)).toBe(9)
    expect(phaseMeters(flag, "c", 3)).toBe(0)
    expect(phaseMeters(undefined, "c", 2)).toBe(0)
  })

  it("RG5: the armor after AP becomes a penalty, never a bonus (RG p. 124-125)", () => {
    expect(armorPenalty(12, -2)).toBe(-10)
    expect(armorPenalty(4, -6)).toBe(0)
    expect(armorPenalty(0, 0)).toBe(0)
  })

  it("RG6: one DV per full 2 dice below 0 (RG p. 125)", () => {
    expect(defenselessDamageBonus(0)).toBe(0)
    expect(defenselessDamageBonus(-1)).toBe(0)
    expect(defenselessDamageBonus(-2)).toBe(1)
    expect(defenselessDamageBonus(-5)).toBe(2)
    expect(defenselessDamageBonus(undefined)).toBe(0)
  })

  it("RG4: the highest score left above 0 acts next, the turn ends when none is (RG p. 123)", () => {
    // Order once re-sorted: 25 (the one who just acted at 35), 20, 0
    expect(nextAlternativeTurn([{
      initiative: 25
    }, {
      initiative: 20
    }, {
      initiative: 0, hasPlayed: true
    }])).toBe(0)
    expect(nextAlternativeTurn([{
      initiative: 0, hasPlayed: true
    }, {
      initiative: 0
    }])).toBe(-1)
    expect(nextAlternativeTurn([{
      initiative: 12, defeated: true
    }, {
      initiative: 8
    }], true)).toBe(1)
  })
})
