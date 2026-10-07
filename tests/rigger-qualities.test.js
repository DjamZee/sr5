import {
  describe, it, expect
} from "vitest"
import {
  RIGGER_QUALITY_EFFECTS, speedDemonBonus, informationOverloadPenalty, movingVehiclesOf,
  hasRiggerQuality
} from "../modules/system/rigger-qualities.js"

const quality = (value, isActive = true) => ({
  type: "itemQuality", system: {
    isActive, systemEffects: {
      0: {
        category: "specialCase", value
      }
    }
  }
})
const drone = (ownerId, currentSpeed, controlMode = "rigging", pilotSkill = "pilotGroundCraft") => ({
  vehicleOwner: {
    id: ownerId
  }, currentSpeed, controlMode, pilotSkill
})

describe("Rigger 5.0 qualities: a quality is read on its active system effect", () => {
  it("an inactive quality, or one with another effect, does nothing", () => {
    expect(hasRiggerQuality([quality(RIGGER_QUALITY_EFFECTS.speedDemon, false)], RIGGER_QUALITY_EFFECTS.speedDemon)).toBe(false)
    expect(hasRiggerQuality([quality("doubleEssenceCost")], RIGGER_QUALITY_EFFECTS.speedDemon)).toBe(false)
    expect(hasRiggerQuality([quality(RIGGER_QUALITY_EFFECTS.speedDemon)], RIGGER_QUALITY_EFFECTS.speedDemon)).toBe(true)
  })
})

describe("Démon de la vitesse (R5 p. 37): +1 at Speed 3 or more, 4 for aircraft, aboard or jumped in", () => {
  const owner = [quality(RIGGER_QUALITY_EFFECTS.speedDemon)]
  it("gives +1 at Speed 3 jumped in or aboard, nothing at 2", () => {
    expect(speedDemonBonus(drone("r", 3, "rigging"), owner)).toBe(1)
    expect(speedDemonBonus(drone("r", 3, "manual"), owner)).toBe(1)
    expect(speedDemonBonus(drone("r", 2, "rigging"), owner)).toBe(0)
  })
  it("asks Speed 4 of an aircraft", () => {
    expect(speedDemonBonus(drone("r", 3, "rigging", "pilotAircraft"), owner)).toBe(0)
    expect(speedDemonBonus(drone("r", 4, "rigging", "pilotAircraft"), owner)).toBe(1)
  })
  it("gives nothing by remote control, to the autopilot or without the quality", () => {
    expect(speedDemonBonus(drone("r", 5, "remote"), owner)).toBe(0)
    expect(speedDemonBonus(drone("r", 5, "autopilot"), owner)).toBe(0)
    expect(speedDemonBonus(drone("r", 5, "rigging"), [])).toBe(0)
  })
})

describe("Surcharge d'informations (R5 p. 38): −2 once four directed vehicles are moving", () => {
  const owner = [quality(RIGGER_QUALITY_EFFECTS.informationOverload)]
  const fleet = [drone("r", 2), drone("r", 1, "autopilot"), drone("r", 3, "remote"), drone("other", 4), drone("r", 0)]
  it("counts the moving vehicles of the rigger only, those on autopilot too", () => {
    expect(movingVehiclesOf("r", fleet)).toBe(3)
    expect(movingVehiclesOf("r", [...fleet, drone("r", 1)])).toBe(4)
  })
  it("the fourth moving drone piloted by the rigger takes −2, the third does not", () => {
    expect(informationOverloadPenalty(drone("r", 1, "remote"), owner, 4)).toBe(-2)
    expect(informationOverloadPenalty(drone("r", 1, "remote"), owner, 3)).toBe(0)
  })
  it("spares the autopilot's own test, a drone standing still and a rigger without the flaw", () => {
    expect(informationOverloadPenalty(drone("r", 1, "autopilot"), owner, 5)).toBe(0)
    expect(informationOverloadPenalty(drone("r", 0, "rigging"), owner, 5)).toBe(0)
    expect(informationOverloadPenalty(drone("r", 1, "rigging"), [], 5)).toBe(0)
  })
})

describe("Surcharge d'informations at the roll: the world's drones, the tested one as it is now", () => {
  it("counts the tested unlinked drone once, by its id, and adds −2 to the pool", async () => {
    const {
      applyInformationOverload
    } = await import("../modules/rolls/roll-helpers/rigger-overload.js")
    const items = [quality(RIGGER_QUALITY_EFFECTS.informationOverload)]
    const world = ["a", "b", "c", "d"].map(id => ({
      id, type: "actorDrone", system: drone("r", 0)
    }))
    world[0].system.currentSpeed = world[1].system.currentSpeed = world[2].system.currentSpeed = 2
    globalThis.game = {
      actors: {
        contents: world
      }, i18n: {
        localize: k => k
      }
    }
    const tested = {
      id: "d", system: {
        ...drone("r", 1, "remote"), vehicleOwner: {
          id: "r", items
        }
      }
    }
    const rollData = applyInformationOverload({
      dicePool: {
        modifiers: []
      }
    }, tested)
    expect(rollData.dicePool.modifiers).toEqual([{
      type: "itemQuality", label: "SR5.RiggerInformationOverload", value: -2
    }])
    tested.system.currentSpeed = 0
    expect(applyInformationOverload({
      dicePool: {
        modifiers: []
      }
    }, tested).dicePool.modifiers).toEqual([])
    delete globalThis.game
  })
})
