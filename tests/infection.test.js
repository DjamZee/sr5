import {
  describe, it, expect
} from "vitest"
import {
  infectorPool, victimPool, infectionWins, canBeInfected, canInfect, isInfectionPower, victimLabel, newComa, comasDue, essenceBaseForOne, COMA,
  IN_COMA, RESISTED, WOKEN
} from "../modules/system/infection.js"

const val = (v) => ({
  augmented: {
    value: v
  }
})

describe("Infection (SR5 p. 401)", () => {
  it("the creature rolls Magic + Charisma", () => {
    expect(infectorPool({
      system: {
        specialAttributes: {
          magic: val(5)
        }, attributes: {
          charisma: val(4)
        }
      }
    })).toBe(9)
  })

  it("the victim rolls Body + Willpower", () => {
    expect(victimPool({
      system: {
        attributes: {
          body: val(3), willpower: val(4)
        }
      }
    })).toBe(7)
  })

  it("a tie goes to the victim (SR5 p. 174)", () => {
    expect(infectionWins(3, 3)).toBe(false)
    expect(infectionWins(4, 3)).toBe(true)
    expect(infectionWins(0, 0)).toBe(false)
  })

  it("is tried on a character or a grunt drained to 0 only", () => {
    const at = (type, value) => ({
      type, system: {
        essence: {
          value
        }
      }
    })
    expect(canBeInfected(at("actorPc", 0))).toBe(true)
    expect(canBeInfected(at("actorGrunt", 0))).toBe(true)
    expect(canBeInfected(at("actorPc", 0.5))).toBe(false)
    expect(canBeInfected(at("actorSpirit", 0))).toBe(false)
  })

  it("is carried by a creature with the Infection power and Essence Drain, not by a mere drainer", () => {
    const creature = (drain, names) => ({
      system: {
        specialProperties: {
          essenceDrain: drain
        }
      },
      items: names.map(name => ({
        type: "itemPower", name
      }))
    })
    expect(canInfect(creature(true, ["Drain d'Essence", "Infection"]))).toBe(true)
    expect(canInfect(creature(true, ["Infection (VVHMH)"]))).toBe(true)
    // A chupacabra drains Essence but has no Infection power (SR5 p. 401: "a creature with this power")
    expect(canInfect(creature(true, ["Drain d'Essence", "Arme naturelle"]))).toBe(false)
    expect(canInfect(creature(false, ["Infection"]))).toBe(false)
    expect(isInfectionPower({
      type: "itemQuality", name: "Infection"
    })).toBe(false)
    expect(isInfectionPower({
      type: "itemPower", name: "Infectieux"
    })).toBe(false)
  })

  it("names an unlinked token with its scene, apart from its character", () => {
    expect(victimLabel({
      name: "Rita", isToken: false
    })).toBe("Rita")
    expect(victimLabel({
      name: "Rita", isToken: true, token: {
        parent: {
          name: "Docks"
        }
      }
    })).toBe("Rita [Docks]")
  })

  it("wakes the victim 24 hours later", () => {
    const coma = newComa({
      victimName: "V", creatureName: "C", now: 1000
    })
    expect(coma.wakeAt).toBe(1000 + COMA)
    expect(COMA).toBe(24 * 3600)
    const victims = {
      a: coma, b: {
        state: RESISTED
      }, c: {
        ...coma, state: WOKEN
      }
    }
    expect(comasDue(victims, 1000 + COMA - 1)).toEqual([])
    expect(comasDue(victims, 1000 + COMA)).toEqual(["a"])
    expect(coma.state).toBe(IN_COMA)
  })

  it("brings the Essence to 1 whatever its modifiers", () => {
    expect(essenceBaseForOne({
      base: 6, value: 0
    })).toBe(7)
    expect(essenceBaseForOne({
      base: 2, value: -0.5
    })).toBe(3.5)
  })
})
