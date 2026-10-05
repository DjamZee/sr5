import {
  describe, it, expect
} from "vitest"
import {
  SR5_Toxins
} from "../modules/entities/items/toxins.js"

const {
  radiationReduction, effectiveLevel, nextTestAt, testPower, testOutcome, radiationPool, newExposure, dueExposures, RADIATION_SCHEDULE
} = await import("../modules/system/radiation.js")

const mods = (...values) => ({
  modifiers: values.map(([source, value, type = "itemGear"]) => ({
    source, value, type 
  }))
})

describe("toxin immunity by vector (SR5 p. 409-410 and 439)", () => {
  const withMask = {
    specialProperties: {
      toxinImmunityInhalation: mods(["Masque à gaz", 1]), toxinImmunityContact: mods() 
    } 
  }
  const withSeal = {
    specialProperties: {
      toxinImmunityInhalation: mods(["Isolation chimique", 1]), toxinImmunityContact: mods(["Isolation chimique", 1]) 
    } 
  }

  it("a gas mask stops inhalation only", () => {
    expect(SR5_Toxins.immunitySources(withMask, "inhalation")).toEqual(["Masque à gaz"])
    expect(SR5_Toxins.immunitySources(withMask, "contact")).toEqual([])
    expect(SR5_Toxins.openVectors(withMask, ["contact", "inhalation"])).toEqual(["contact"])
  })
  it("a chemical seal stops contact and inhalation, never injection or ingestion", () => {
    expect(SR5_Toxins.openVectors(withSeal, ["contact", "inhalation"])).toEqual([])
    expect(SR5_Toxins.openVectors(withSeal, ["injection", "ingestion"])).toEqual(["injection", "ingestion"])
  })
  it("nothing worn, nothing stopped", () => {
    expect(SR5_Toxins.openVectors({
    }, ["inhalation"])).toEqual(["inhalation"])
  })
})

describe("radiation zones (Run & Gun p. 164-165, Chrome Flesh p. 151 and 170)", () => {
  it("Antirad and Radiation tolerance add up, below Light nothing", () => {
    const actor = {
      specialProperties: {
        antirad: mods(["Antirad", 2], ["Tolérance aux radiations", 1]) 
      } 
    }
    expect(radiationReduction(actor)).toBe(3)
    expect(effectiveLevel("extreme", 3)).toBe("light")
    expect(effectiveLevel("severe", 3)).toBe(null)
    expect(effectiveLevel("moderate", 0)).toBe("moderate")
  })
  it("Light: first test after 20 h at Power 2, then +1 every 12 h", () => {
    const e = newExposure({
      id: "a", actorUuid: "A", actorName: "A", sceneLevel: "light", reduction: 0, now: 1000 
    })
    expect(nextTestAt(e)).toBe(1000 + 20 * 3600)
    expect(testPower(e)).toBe(2)
    const after = {
      ...e, testsDone: 2 
    }
    expect(nextTestAt(after)).toBe(1000 + 44 * 3600)
    expect(testPower(after)).toBe(4)
  })
  it("Moderate: 18 h at Power 3, then every 6 h", () => {
    expect(RADIATION_SCHEDULE.moderate).toMatchObject({
      first: 18 * 3600, every: 6 * 3600, power: 3, fatigue: false 
    })
  })
  it("Severe and above follow SR5 p. 174: 1, 2, 3… every hour, minute or two turns", () => {
    expect(RADIATION_SCHEDULE.severe.every).toBe(3600)
    expect(RADIATION_SCHEDULE.extreme.every).toBe(60)
    expect(RADIATION_SCHEDULE.deadly.every).toBe(6)
    expect(testOutcome("severe", 3, 1)).toEqual({
      remaining: 2, nausea: true, stun: 2 
    })
    expect(testOutcome("light", 3, 1)).toEqual({
      remaining: 2, nausea: true, stun: 0 
    })
    expect(testOutcome("deadly", 2, 5)).toEqual({
      remaining: 0, nausea: false, stun: 0 
    })
  })
  it("a fully shielded character gets no exposure", () => {
    expect(newExposure({
      id: "a", sceneLevel: "light", reduction: 1, now: 0 
    })).toBe(null)
  })
  it("the pool is Body + Willpower + shielding, never the armor", () => {
    const actor = {
      attributes: {
        body: {
          augmented: {
            value: 4 
          } 
        }, willpower: {
          augmented: {
            value: 3 
          } 
        } 
      },
      resistances: {
        specialDamage: {
          radiation: {
            modifiers: [
              {
                source: "Constitution", type: "linkedAttribute", value: 4 
              },
              {
                source: "Veste", type: "armor", value: 12 
              },
              {
                source: "Protection antiradiations", type: "itemArmor", value: 6 
              },
              {
                source: "Tolérance aux radiations", type: "itemAugmentation", value: 2 
              },
            ] 
          } 
        } 
      },
    }
    expect(radiationPool(actor)).toBe(15)
  })
  it("a due test is listed once, open exposures only", () => {
    const e = newExposure({
      id: "a", sceneLevel: "deadly", reduction: 0, now: 0 
    })
    const ledger = {
      exposures: {
        a: e, b: {
          ...e, id: "b", state: "ended" 
        }, c: {
          ...e, id: "c", notified: true 
        } 
      } 
    }
    expect(dueExposures(ledger, 5).map(x => x.id)).toEqual([])
    expect(dueExposures(ledger, 6).map(x => x.id)).toEqual(["a"])
  })
})
