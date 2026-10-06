import {
  describe, it, expect, vi
} from "vitest"

// The sheet checkbox "secondary propulsion activated" wrote the source, but the preparation reset the
// prepared value to false and nothing read it again: Ramming stayed "Ground", speed and handling stayed
// those of the main propulsion (Rigger 5 p. 158: the mode's values replace the usual ones).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

const attribute = () => ({
  natural: {
    base: 0
  }
})
const drone = (activated) => ({
  type: "actorDrone",
  _source: {
    system: {
      isSecondaryPropulsionActivate: activated
    }
  },
  system: {
    isSecondaryPropulsion: false,
    secondaryPropulsionType: "",
    isSecondaryPropulsionActivate: false,
    attributes: {
      secondaryPropulsionHandling: attribute(),
      secondaryPropulsionHandlingOffRoad: attribute(),
      secondaryPropulsionSpeed: attribute(),
      secondaryPropulsionAcceleration: attribute()
    }
  }
})
const rotorMod = {
  secondaryPropulsion: {
    isSecondaryPropulsion: true, type: "rotor"
  }
}

describe("secondary propulsion activated from the sheet", () => {
  it("is active when the sheet checkbox is checked and the mod is active", () => {
    const actor = drone(true)
    SR5_CharacterUtility.handleSecondaryAttributes(actor, rotorMod)
    expect(actor.system.isSecondaryPropulsionActivate).toBe(true)
    expect(actor.system.secondaryPropulsionType).toBe("rotor")
    expect(actor.system.attributes.secondaryPropulsionSpeed.natural.base).toBe(3)
  })

  it("stays off when the sheet checkbox is not checked", () => {
    const actor = drone(false)
    SR5_CharacterUtility.handleSecondaryAttributes(actor, rotorMod)
    expect(actor.system.isSecondaryPropulsionActivate).toBe(false)
  })
})
