import {
  describe, it, expect
} from "vitest"
import {
  firearmCommandIsFree
} from "../modules/entities/items/weaponTraits.js"

// SR5 p. 427: every wireless firearm, for a character with a DNI, ejects the clip and changes the firing mode as a free
// action, smartgun or not; p. 435: wired, the smartgun only gives its Accuracy (decision H21). The DNI follows the
// wireless ruling of 2026-10-03: assumed unless the world setting asks for the character's "linked by DNI" box.

const weapon = (isWireless, wirelessTurnedOn = isWireless) => ({
  isWireless, wirelessTurnedOn, accessory: []
})
const shooter = (hasDNI) => ({
  system: {
    hasDNI
  }
})

describe("free firearm commands through the wireless", () => {
  it("a wireless firearm with its wireless on is free, without any smartgun, when the DNI is assumed", () => {
    expect(firearmCommandIsFree(weapon(true), shooter(false), false)).toBe(true)
  })

  it("a wired weapon, or a wireless one switched off, is not free", () => {
    expect(firearmCommandIsFree(weapon(false), shooter(true), false)).toBe(false)
    expect(firearmCommandIsFree(weapon(true, false), shooter(true), false)).toBe(false)
  })

  it("when the world setting asks for it, the character's DNI box decides", () => {
    expect(firearmCommandIsFree(weapon(true), shooter(false), true)).toBe(false)
    expect(firearmCommandIsFree(weapon(true), shooter(true), true)).toBe(true)
  })
})
