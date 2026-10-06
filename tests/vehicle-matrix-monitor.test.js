import {
  describe, it, expect, vi, beforeAll
} from "vitest"

// A vehicle's matrix monitor is 8 + half its device rating, rounded up (SR5 p. 229), and the
// device rating of a vehicle is its Pilot. The rating is set by generateVehicleMatrix
// on the second pass over the items, after the monitors are prepared: a Roadmaster (Pilot 3)
// had 8 boxes instead of 10.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
})

function monitor() {
  return {
    value: 0, base: 0, modifiers: [], actual: {
      value: 0, base: 0, modifiers: []
    }, boxes: []
  }
}

function drone(pilot, deviceRating = 0) {
  return {
    type: "actorDrone", name: "Roadmaster",
    system: {
      type: "vehicle",
      attributes: {
        body: {
          augmented: {
            value: 18
          }
        },
        pilot: {
          augmented: {
            value: pilot
          }
        },
      },
      specialAttributes: {
      },
      matrix: {
        deviceRating
      },
      conditionMonitors: {
        condition: monitor(), matrix: monitor()
      },
      statusBars: {
        condition: {
          value: 0, max: 0
        }, matrix: {
          value: 0, max: 0
        }
      },
    },
  }
}

describe("vehicle matrix monitor (SR5 p. 229)", () => {
  it("a Roadmaster with Pilot 3 has 10 boxes, before its device rating is set", () => {
    const a = drone(3)
    SR5_CharacterUtility.updateConditionMonitors(a)
    expect(a.system.conditionMonitors.matrix.value).toBe(10)
  })

  it("a drone with Pilot 4 has 10 boxes, Pilot 6 has 11", () => {
    let a = drone(4)
    SR5_CharacterUtility.updateConditionMonitors(a)
    expect(a.system.conditionMonitors.matrix.value).toBe(10)
    a = drone(6)
    SR5_CharacterUtility.updateConditionMonitors(a)
    expect(a.system.conditionMonitors.matrix.value).toBe(11)
  })
})
