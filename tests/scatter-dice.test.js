import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// Scatter table, SR5 p. 183: (1D6 / 2D6 / 3D6 / 4D6 / 5D6 - hits) meters.
describe("scatterDice", () => {
  it("rolls 1D6 for a standard grenade", () => {
    expect(SR5_CombatHelpers.scatterDice({
      category: "grenade", aerodynamic: false, ammunition: {
      }
    })).toBe(1)
  })

  it("rolls 2D6 for an aerodynamic grenade", () => {
    expect(SR5_CombatHelpers.scatterDice({
      category: "grenade", aerodynamic: true, ammunition: {
      }
    })).toBe(2)
  })

  it("rolls 3D6 for a grenade launcher", () => {
    expect(SR5_CombatHelpers.scatterDice({
      type: "grenadeLauncher", ammunition: {
        type: "regular"
      }
    })).toBe(3)
  })

  it("rolls 4D6 for a missile and 5D6 for a rocket", () => {
    expect(SR5_CombatHelpers.scatterDice({
      type: "missileLauncher", ammunition: {
        type: "highlyExplosiveMissile"
      }
    })).toBe(4)
    expect(SR5_CombatHelpers.scatterDice({
      type: "missileLauncher", ammunition: {
        type: "antivehicleRocket"
      }
    })).toBe(5)
  })

  it("lets an ammunition that sets its own scatter dice win", () => {
    expect(SR5_CombatHelpers.scatterDice({
      type: "grenadeLauncher", ammunition: {
      }
    }, {
      scatterDice: 2
    })).toBe(2)
  })
})
