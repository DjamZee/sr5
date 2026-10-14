import {
  describe, it, expect
} from "vitest"

const {
  isCyberpsychosis, cyberpsychosisReminder
} = await import("../modules/system/cyberpsychosis.js")

const quality = (name, isActive = true) => ({
  type: "itemQuality", name, system: {
    isActive
  }
})
const actor = (...items) => ({
  items
})

describe("Cyberpsychosis reminder (Chrome Flesh p. 59)", () => {
  it("knows the quality by its French or English name, active only", () => {
    expect(isCyberpsychosis(quality("Cyberpsychose"))).toBe(true)
    expect(isCyberpsychosis(quality("Cyberpsychosis"))).toBe(true)
    expect(isCyberpsychosis(quality("Cyberpsychose", false))).toBe(false)
    expect(isCyberpsychosis({
      type: "itemPower", name: "Cyberpsychose animale", system: {
      }
    })).toBe(false)
  })
  it("a glitch at a social skill test gives the reminder, a critical glitch the break", () => {
    const pc = actor(quality("Antipathie"), quality("Cyberpsychose"))
    expect(cyberpsychosisReminder(pc, "negotiation", {
      glitchRoll: true
    })).toBe("SR5.CyberpsychosisGlitch")
    expect(cyberpsychosisReminder(pc, "intimidation", {
      glitchRoll: true, criticalGlitchRoll: true
    })).toBe("SR5.CyberpsychosisCriticalGlitch")
  })
  it("nothing without a glitch, out of the social skills, or without the quality", () => {
    const pc = actor(quality("Cyberpsychose"))
    expect(cyberpsychosisReminder(pc, "negotiation", {
      glitchRoll: false
    })).toBeNull()
    expect(cyberpsychosisReminder(pc, "pistols", {
      glitchRoll: true
    })).toBeNull()
    expect(cyberpsychosisReminder(actor(quality("Antipathie")), "con", {
      glitchRoll: true
    })).toBeNull()
  })
})
