import {
  describe, it, expect, vi
} from "vitest"
import {
  hasRiggerInterface, controlRigThresholdModifier, VR_PILOTING_LIMIT_BONUS
} from "../modules/system/rigging-rules.js"
import {
  thresholdModifierOf, applyThresholdModifier
} from "../modules/rolls/roll-helpers/threshold.js"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import("../modules/entities/actors/utilityActor.js")

const stat = value => ({
  base: value, value, modifiers: []
})
const pool = () => ({
  base: 0, dicePool: 0, modifiers: []
})
const rated = value => ({
  augmented: {
    value
  }
})

/** A drone (Handling 4, Sensor 3) controlled by a rigger with the given control rig, in the given mode */
function drone({
  controlMode = "rigging", controlRig = 0, userMode = "coldsim"
} = {
}) {
  return {
    type: "actorDrone",
    items: [],
    system: {
      type: "drone",
      controlMode,
      pilotSkill: "pilotGroundCraft",
      offRoadMode: false,
      isSecondaryPropulsionActivate: false,
      attributes: {
        handling: rated(4), handlingOffRoad: rated(3), pilot: rated(3), sensor: rated(3),
      },
      vehicleOwner: {
        id: "rigger", name: "Rigger", items: [],
        system: {
          specialProperties: {
            controlRig: {
              value: controlRig
            }
          },
          matrix: {
            userMode, attributes: {
              dataProcessing: {
                value: 6
              }
            }
          },
          skills: {
            pilotGroundCraft: {
              test: {
                dicePool: 8
              }
            },
            perception: {
              test: {
                dicePool: 7
              }
            },
            sneaking: {
              rating: {
                value: 4
              }
            },
          },
          attributes: {
            agility: rated(5), intuition: rated(3)
          },
        },
      },
      penalties: {
        special: {
          actual: {
            modifiers: []
          }
        }
      },
      vehicleTest: {
        test: pool(), limit: stat(0)
      },
      rammingTest: {
        test: pool(), limit: stat(0)
      },
      skills: {
        sneaking: {
          rating: stat(0), test: pool(), limit: stat(0)
        },
        perception: {
          rating: stat(0), test: pool(), limit: stat(0)
        },
      },
    },
  }
}

function prepared(options) {
  const actor = drone(options)
  SR5_CharacterUtility.generateVehicleSkills(actor)
  SR5_CharacterUtility.generateVehicleTest(actor)
  SR5_CharacterUtility.generateRammingTest(actor)
  return actor.system
}

// SR5 p. 267, Rigger 5.0 p. 173: every drone has a rigger interface; a vehicle only with the module
describe("hasRiggerInterface", () => {
  it("a drone without the checkbox still has the interface", () => {
    expect(hasRiggerInterface({
      type: "drone", riggerInterface: false
    })).toBe(true)
  })
  it("a vehicle without the checkbox has none", () => {
    expect(hasRiggerInterface({
      type: "vehicle", riggerInterface: false
    })).toBe(false)
  })
  it("a vehicle with the checkbox has one", () => {
    expect(hasRiggerInterface({
      type: "vehicle", riggerInterface: true
    })).toBe(true)
  })
  it("an actor without a vehicle type reads the checkbox", () => {
    expect(hasRiggerInterface({
      type: "", riggerInterface: false
    })).toBe(false)
    expect(hasRiggerInterface(undefined)).toBe(false)
  })
})

// SR5 p. 201 (VR +2) and p. 268 (control rig, errata: Sensor, Speed and Handling limits)
describe("jumped in limits", () => {
  it("the vehicle test limit is Handling + VR 2 + control rig", () => {
    expect(VR_PILOTING_LIMIT_BONUS).toBe(2)
    expect(prepared({
      controlRig: 2
    }).vehicleTest.limit.value).toBe(4 + 2 + 2)
    expect(prepared({
      controlRig: 0
    }).vehicleTest.limit.value).toBe(4 + 2)
  })
  it("the ramming test limit follows the same rule", () => {
    expect(prepared({
      controlRig: 2
    }).rammingTest.limit.value).toBe(4 + 2 + 2)
  })
  it("the perception limit is Sensor + control rig", () => {
    expect(prepared({
      controlRig: 2
    }).skills.perception.limit.value).toBe(3 + 2)
  })
  it("the sneaking limit is Handling + control rig, without the old unsourced +1", () => {
    expect(prepared({
      controlRig: 2
    }).skills.sneaking.limit.value).toBe(4 + 2)
    expect(prepared({
      controlRig: 0
    }).skills.sneaking.limit.value).toBe(4)
  })
  it("remote control in VR keeps its +2 without the control rig", () => {
    expect(prepared({
      controlMode: "remote", controlRig: 2
    }).vehicleTest.limit.value).toBe(4 + 2)
  })
})

// SR5 p. 268: the Accuracy of a mounted weapon gains the control rig, and nothing else
describe("jumped in accuracy", () => {
  it("Accuracy 5 with a control rig 2 becomes 7", async () => {
    const {
      SR5_UtilityItem
    } = await import("../modules/entities/items/utilityItem.js")
    const actor = drone({
      controlRig: 2
    })
    actor.system.vehicleOwner.system.skills.gunnery = {
      test: {
        dicePool: 6
      }
    }
    const item = {
      name: "Ares Alpha", system: {
        weaponSkill: pool(), accuracy: stat(5)
      }
    }
    SR5_UtilityItem._generateWeaponDicepool(item, actor)
    expect(item.system.accuracy.value).toBe(5 + 2)
  })
})

// SR5 p. 268: thresholds of the piloting tests lowered by the control rig, never under 1
describe("jumped in threshold", () => {
  it("a control rig 2 turns a threshold of 3 into 1", () => {
    const system = prepared({
      controlRig: 2
    })
    const modifier = thresholdModifierOf(system, {
      type: "vehicleTest"
    })
    expect(modifier.value).toBe(-2)
    expect(applyThresholdModifier({
      value: 3
    }, modifier).value).toBe(1)
  })
  it("never under 1", () => {
    expect(applyThresholdModifier({
      value: 2
    }, controlRigThresholdModifier(3, "rig")).value).toBe(1)
  })
  it("a test without threshold keeps none", () => {
    expect(applyThresholdModifier({
      value: 0
    }, controlRigThresholdModifier(2, "rig")).value).toBe(0)
  })
  it("only the vehicle test, and only jumped in", () => {
    const system = prepared({
      controlRig: 2
    })
    expect(thresholdModifierOf(system, {
      type: "skill"
    }).value).toBe(0)
    expect(thresholdModifierOf(prepared({
      controlMode: "remote", controlRig: 2
    }), {
      type: "vehicleTest"
    }).value).toBe(0)
  })
})
