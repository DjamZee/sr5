import {
  describe, it, expect
} from "vitest"

// F7 (DjamZ's ruling, 2026-10-06): a martial arts technique the character has learned applies on its own,
// without being pinned (Choquer: Shake Up -4 becomes -3). Only a technique that is an action chosen for the
// roll (All-Out Attack, Balestra, Run & Gun p. 134) keeps its switch.

const {
  martialArtNeedsSwitch, martialArtApplies
} = await import("../modules/system/martial-arts-technique.js")

const effect = (target, type = "value", value = 1) => ({
  target, type, value
})
const technique = (actionType, effects, isActive = false) => ({
  actionType, isActive, customEffects: Object.fromEntries(effects.map((e, i) => [String(i), e]))
})

const choquer = technique("permanent", [
  effect("system.itemsProperties.martialArts.shakeUp.modifier"),
  effect("system.itemsProperties.martialArts.locationEye.modifier"),
])
const clouer = technique("free", [effect("system.itemsProperties.martialArts.pin.isActive", "boolean", "true")])
const serpent = technique("simple", [effect("system.itemsProperties.martialArts.feint.modifier")])
const souplesse = technique("permanent", [effect("system.defenses.dodge")])
const outrance = technique("complex", [effect("system.skills.unarmedCombat.test", "value", 2)])
const balestra = technique("complex", [effect("system.defenses.defend", "value", -1)])
// As the Mégapack gives them: situational, a box of the roll dialog
const situational = e => ({
  ...e, situational: true, when: "en exécutant une attaque à outrance"
})
const outranceMegapack = technique("complex", [situational(effect("system.skills.unarmedCombat.test", "value", 2))])

describe("a learned martial arts technique applies on its own", () => {
  it("applies Choquer's modifier without being pinned (Run & Gun p. 148-151)", () => {
    expect(martialArtNeedsSwitch(choquer)).toBe(false)
    expect(martialArtApplies(choquer)).toBe(true)
  })

  it("unlocks its called shot without being pinned: the shot is chosen in the roll dialog", () => {
    expect(martialArtApplies(clouer)).toBe(true)
    expect(martialArtApplies(serpent)).toBe(true)
  })

  it("applies a permanent technique on a pool (Souplesse du roseau)", () => {
    expect(martialArtApplies(souplesse)).toBe(true)
  })

  it("applies an action whose effects are situational: the roll dialog offers them (Run & Gun p. 134)", () => {
    expect(martialArtNeedsSwitch(outranceMegapack)).toBe(false)
    expect(martialArtApplies(outranceMegapack)).toBe(true)
  })

  it("keeps the switch of an action whose effect is not situational (an item made by hand)", () => {
    expect(martialArtNeedsSwitch(outrance)).toBe(true)
    expect(martialArtNeedsSwitch(balestra)).toBe(true)
    expect(martialArtApplies(outrance)).toBe(false)
    expect(martialArtApplies({
      ...outrance, isActive: true
    })).toBe(true)
  })

  it("reads an array of effects as well as an object", () => {
    expect(martialArtApplies({
      ...choquer, customEffects: Object.values(choquer.customEffects)
    })).toBe(true)
    expect(martialArtNeedsSwitch({
      actionType: "complex", customEffects: []
    })).toBe(false)
  })
})
