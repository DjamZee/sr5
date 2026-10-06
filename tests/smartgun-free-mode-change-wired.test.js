import {
  describe, it, expect
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"

// SR5 p. 165: changing the firing mode or the choke of a weapon with a smartgun system, linked by DNI
// "wired or wireless", is a free action. The wireless was required.

const weapon = (isWireless, accessory = "smartgunSystemInternal") => ({
  system: {
    isWireless, accessory: [{
      name: accessory
    }]
  }
})
const shooter = (smartlink) => ({
  system: {
    specialProperties: {
      smartlink: {
        value: smartlink
      }
    }
  }
})

describe("free firing mode change with a smartgun", () => {
  it("is free with a wired smartgun and a smartlink", () => {
    expect(SR5_RollDialog.changeIsFree(weapon(false), shooter(1))).toBe(true)
  })

  it("is free with a wireless smartgun and a smartlink", () => {
    expect(SR5_RollDialog.changeIsFree(weapon(true, "smartgunSystemExternal"), shooter(1))).toBe(true)
  })

  it("is not free without a smartlink, nor without a smartgun", () => {
    expect(SR5_RollDialog.changeIsFree(weapon(false), shooter(0))).toBe(false)
    expect(SR5_RollDialog.changeIsFree(weapon(true, "laserSight"), shooter(1))).toBe(false)
  })
})
