import {
  describe, it, expect
} from "vitest"
import {
  linkedAttributeKey, offerTestAttribute, offerVehicleAttribute
} from "../modules/rolls/roll-helpers/skillAttribute.js"

// A15 (arbitrage of Élise, 08/10; SR5 p. 130): the attribute menu, kept per character, on the skill tests the system
// builds itself (attack, vehicle, palming, sensors, grapple, movement); the default is the test's own pair
const labels = {
  agility: "Agilité", strength: "Force", reaction: "Réaction", logic: "Logique"
}
const localize = k => k
const attr = v => ({
  augmented: {
    value: v
  }
})
const actor = (flags = {
}, type = "actorPc") => ({
  type,
  system: {
    attributes: {
      agility: attr(4), strength: attr(6), reaction: attr(3), logic: attr(2)
    },
    specialAttributes: {
    }
  },
  getFlag: (scope, key) => scope === "sr5" && key === "skillAttributes" ? flags : undefined,
})
const rollData = () => ({
  test: {
    title: "Attaque avec Katana"
  },
  dicePool: {
    base: 9, composition: [{
      source: "Lames", type: "skillRating", value: 5
    }, {
      source: "Agilité", type: "linkedAttribute", value: 4
    }]
  },
})

describe("A15: the attribute of a test the system builds", () => {
  it("reads the linked attribute from the pool", () => {
    expect(linkedAttributeKey(rollData().dicePool.composition, labels, localize)).toBe("agility")
    expect(linkedAttributeKey([], labels, localize)).toBeNull()
  })

  it("offers the menu with the test's pair by default, title unchanged", () => {
    const data = offerTestAttribute(rollData(), actor(), {
      flagKey: "test-weapon-blade", labels, localize
    })
    expect(data.skillAttribute.linked).toBe("agility")
    expect(data.skillAttribute.selected).toBe("agility")
    expect(data.skillAttribute.keepLabel).toBe("SR5.TestAttributeKeep")
    expect(data.dicePool.base).toBe(9)
    expect(data.test.title).toBe("Attaque avec Katana")
  })

  it("applies the attribute kept for that test", () => {
    const data = offerTestAttribute(rollData(), actor({
      "test-weapon-blade": "strength"
    }), {
      flagKey: "test-weapon-blade", labels, localize
    })
    expect(data.skillAttribute.selected).toBe("strength")
    expect(data.dicePool.base).toBe(11)
    expect(data.test.title).toBe("Attaque avec Katana + Force")
  })

  it("a driven vehicle: the driver's share split into skill and attribute, the choice read on the driver", () => {
    const driver = {
      ...actor({
        "test-vehicleTest": "intuition"
      }), uuid: "Actor.pc", system: {
        ...actor().system, skills: {
          pilotGroundCraft: {
            linkedAttribute: "reaction"
          }
        }
      }
    }
    driver.system.attributes.intuition = attr(5)
    const vehicle = {
      type: "actorDrone", system: {
        controlMode: "manual", pilotSkill: "pilotGroundCraft"
      }
    }
    const data = offerVehicleAttribute({
      test: {
        title: "Test de véhicule"
      }, dicePool: {
        base: 8, modifiers: [], composition: [{
          source: "Contrôleur : Clo", type: "manual", value: 8
        }]
      }
    }, vehicle, {
      flagKey: "test-vehicleTest", labels: {
        ...labels, intuition: "Intuition"
      }, localize, driver
    })
    expect(data.skillAttribute.linked).toBe("reaction")
    expect(data.skillAttribute.selected).toBe("intuition")
    expect(data.skillAttribute.holderUuid).toBe("Actor.pc")
    // 8 = skill 5 + Reaction 3; with Intuition 5: 10
    expect(data.dicePool.base).toBe(10)
    expect(data.test.title).toBe("Test de véhicule + Intuition")
  })

  it("the autopilot keeps its pool", () => {
    const data = offerVehicleAttribute({
      test: {
        title: "T"
      }, dicePool: {
        base: 3, modifiers: [], composition: [{
          source: "Autopilote", type: "linkedAttribute", value: 3
        }]
      }
    }, {
      type: "actorDrone", system: {
        controlMode: "autopilot", pilotSkill: "pilotGroundCraft"
      }
    }, {
      flagKey: "x", labels, localize, driver: actor()
    })
    expect(data.skillAttribute).toBeUndefined()
    expect(data.dicePool.base).toBe(3)
  })

  it("leaves a drone's test as it is", () => {
    const data = offerTestAttribute(rollData(), actor({
    }, "actorDrone"), {
      flagKey: "test-vehicleTest", labels, localize
    })
    expect(data.skillAttribute).toBeUndefined()
  })
})
