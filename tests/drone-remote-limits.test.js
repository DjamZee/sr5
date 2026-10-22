import {
  describe, it, expect, vi
} from "vitest"
import {
  dataProcessingCapModifier
} from "../modules/system/rigging-rules.js"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import("../modules/entities/actors/utilityActor.js")
const {
  SR5_UtilityItem
} = await import("../modules/entities/items/utilityItem.js")

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

/** A drone (Handling 5, Sensor 4, Pilot 3) controlled through a device of Data Processing 3, in the given mode.
 * The controller: Sneaking 4, Agility 5, Intuition 3, Reaction 2, Gunnery 4, Logic 4, control rig 0 */
function drone({
  controlMode = "remote", dataProcessing = 3, userMode = "ar"
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
      passiveTargeting: false,
      attributes: {
        handling: rated(5), handlingOffRoad: rated(4), pilot: rated(3), sensor: rated(4),
      },
      vehicleOwner: {
        id: "rigger", name: "Rigger", items: [],
        system: {
          specialProperties: {
            controlRig: {
              value: 0
            }
          },
          attributes: {
            agility: rated(5), intuition: rated(3), reaction: rated(2), logic: rated(4)
          },
          matrix: {
            userMode, attributes: {
              dataProcessing: {
                value: dataProcessing
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
              }, test: {
                dicePool: 12
              }
            },
            gunnery: {
              rating: {
                value: 4
              }, test: {
                dicePool: 9
              }
            },
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

function weaponAccuracy(options, accuracy = 5) {
  const actor = drone(options)
  const item = {
    name: "Ares Alpha", system: {
      weaponSkill: pool(), accuracy: stat(accuracy), damageValue: stat(8), armorPenetration: stat(0),
      recoilCompensation: stat(0), firingMode: {
      }, choke: {
      },
    }
  }
  SR5_UtilityItem._generateWeaponDicepool(item, actor)
  SR5_UtilityItem._generateWeaponDamage(item.system, actor)
  return item.system.accuracy.value
}

describe("dataProcessingCapModifier (SR5 p. 239-240)", () => {
  it("brings a limit down to the Data Processing", () => {
    expect(dataProcessingCapModifier(6, 3)).toBe(-3)
  })
  it("leaves a limit already under alone", () => {
    expect(dataProcessingCapModifier(2, 3)).toBe(0)
    expect(dataProcessingCapModifier(3, 3)).toBe(0)
  })
  it("does nothing without a Data Processing", () => {
    expect(dataProcessingCapModifier(6, undefined)).toBe(0)
  })
})

describe("remote control: every limit capped by the controller's Data Processing", () => {
  it("vehicle test: Handling 5 + AR 1 = 6, capped at 3", () => {
    expect(prepared().vehicleTest.limit.value).toBe(3)
  })
  it("ramming test: capped at 3", () => {
    expect(prepared().rammingTest.limit.value).toBe(3)
  })
  it("perception and sneaking: capped at 3", () => {
    const system = prepared()
    expect(system.skills.perception.limit.value).toBe(3)
    expect(system.skills.sneaking.limit.value).toBe(3)
  })
  it("mounted weapon Accuracy 5: capped at 3", () => {
    expect(weaponAccuracy()).toBe(3)
  })
  it("a high Data Processing changes nothing", () => {
    expect(prepared({
      dataProcessing: 8
    }).vehicleTest.limit.value).toBe(6)
    expect(weaponAccuracy({
      dataProcessing: 8
    })).toBe(5)
  })
  it("no cap when jumped in or in manual control", () => {
    expect(prepared({
      controlMode: "manual"
    }).vehicleTest.limit.value).toBe(6)
    expect(weaponAccuracy({
      controlMode: "rigging"
    })).toBe(5)
  })
})

describe("drone sneaking by control mode (DjamZ 07/10, SR5 p. 239 and 272)", () => {
  it("remote: the controller's Sneaking + Agility", () => {
    expect(prepared().skills.sneaking.test.dicePool).toBe(4 + 5)
  })
  it("jumped in: the rigger's Sneaking + Intuition [Handling]", () => {
    const system = prepared({
      controlMode: "rigging", userMode: "coldsim"
    })
    expect(system.skills.sneaking.test.dicePool).toBe(4 + 3)
    expect(system.skills.sneaking.limit.value).toBe(5)
  })
  it("jumped in hot sim: +1 die", () => {
    expect(prepared({
      controlMode: "rigging", userMode: "hotsim"
    }).skills.sneaking.test.dicePool).toBe(4 + 3 + 1)
  })
  it("manual control: the driver's Sneaking + Reaction [Handling] (Rigger 5.0 p. 180)", () => {
    const system = prepared({
      controlMode: "manual"
    })
    expect(system.skills.sneaking.test.dicePool).toBe(4 + 2)
    expect(system.skills.sneaking.limit.value).toBe(5)
  })
})
