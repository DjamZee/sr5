import {
  describe, it, expect
} from "vitest"
import {
  RIGGER_QUALITY_EFFECTS, speedDemonBonus,
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
