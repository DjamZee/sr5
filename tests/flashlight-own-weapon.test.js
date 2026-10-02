import {
  describe, it, expect
} from "vitest"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// Run & Gun p. 69: a weapon flashlight lights "in the direction the weapon points", and a low-light
// (or infrared) one takes the light penalty one row down for a character using low-light (or
// thermographic) vision. The row used to be written on the actor as soon as the weapon carrying the
// lamp was equipped, so it also counted for every other weapon and for the defense test.
const modifier = () => ({
  base: 0, value: 0, modifiers: []
})
const vision = (isActive = false) => ({
  isActive
})
const holder = ({
  lowLight = false, thermographic = false
} = {
}) => ({
  system: {
    itemsProperties: {
      environmentalMod: {
        visibility: modifier(), light: modifier(), glare: modifier(), wind: modifier(), range: modifier()
      }
    },
    visions: {
      lowLight: vision(lowLight), thermographic: vision(thermographic)
    },
  },
})
const weapon = (accessory = []) => ({
  isActive: true,
  ammunition: {
    type: ""
  },
  accessory,
})
const lamp = (name, isActive = true) => ({
  name, isActive
})
const darkness = {
  getFlag: (_scope, key) => (key === "environModLight" ? 3 : 0)
}

// What the actor's preparation does for each of its weapons, then the value it ends with
const prepare = (actor, weapons) => {
  for (const w of weapons) SR5_UtilityItem._handleVisionAccessory(w, actor)
  const light = actor.system.itemsProperties.environmentalMod.light
  light.value = light.modifiers.reduce((sum, m) => sum + m.value, 0)
}
const lightOf = (w, actor) => SR5_UtilityItem.getWeaponLightCompensation?.(w, actor) ?? 0
// Ranged attack with weapon w; defense test (rollData-Defense: noWind, melee columns, no weapon)
const shotWith = (w, actor) => SR5_CombatHelpers.handleEnvironmentalModifiers(darkness, actor.system, false, undefined, false, lightOf(w, actor))
const defense = (actor) => SR5_CombatHelpers.handleEnvironmentalModifiers(darkness, actor.system, true, undefined, true)
// Visual perception (roll-dialog): no wind column, no weapon
const perception = (actor) => SR5_CombatHelpers.handleEnvironmentalModifiers(darkness, actor.system, true)

describe("weapon flashlight (Run & Gun p. 69)", () => {
  it("takes one light row off a shot made with its own weapon", () => {
    const actor = holder({
      lowLight: true
    })
    const rifle = weapon([lamp("flashLightLowLight")])
    prepare(actor, [rifle])
    expect(shotWith(rifle, actor)).toBe(-3)
  })

  it("does nothing for another weapon of the same actor", () => {
    const actor = holder({
      lowLight: true
    })
    const rifle = weapon([lamp("flashLightLowLight")])
    const pistol = weapon()
    prepare(actor, [rifle, pistol])
    expect(shotWith(pistol, actor)).toBe(-6)
  })

  // RG p. 69 does not say where the weapon points during a defense or a perception test; DjamZ ruled on
  // 2026-10-03 that the lamp counts for neither (the GM adds it by hand when the fiction calls for it)
  it("does nothing for the defense test nor for visual perception", () => {
    const actor = holder({
      lowLight: true
    })
    prepare(actor, [weapon([lamp("flashLightLowLight")])])
    expect(defense(actor)).toBe(-6)
    expect(perception(actor)).toBe(-6)
  })

  it("does not add up across two equipped weapons", () => {
    const actor = holder({
      lowLight: true
    })
    const rifle = weapon([lamp("flashLightLowLight")])
    prepare(actor, [rifle, weapon([lamp("flashLightLowLight")])])
    expect(shotWith(rifle, actor)).toBe(-3)
  })

  it("needs the matching vision, the lamp switched on and the weapon equipped", () => {
    const noVision = holder()
    const rifle = weapon([lamp("flashLightLowLight")])
    prepare(noVision, [rifle])
    expect(shotWith(rifle, noVision)).toBe(-6)

    const actor = holder({
      lowLight: true
    })
    const off = weapon([lamp("flashLightLowLight", false)])
    prepare(actor, [off])
    expect(shotWith(off, actor)).toBe(-6)

    const stowed = weapon([lamp("flashLightLowLight")])
    stowed.isActive = false
    expect(lightOf(stowed, actor)).toBe(0)
  })

  it("does the same for an infrared lamp and thermographic vision", () => {
    const actor = holder({
      thermographic: true
    })
    const rifle = weapon([lamp("flashLightInfrared")])
    const pistol = weapon()
    prepare(actor, [rifle, pistol])
    expect(lightOf(rifle, actor)).toBe(-1)
    expect(lightOf(pistol, actor)).toBe(0)
    expect(actor.system.itemsProperties.environmentalMod.light.value).toBe(0)
  })

  it("reads a lamp added as an accessory item", () => {
    const actor = holder({
      lowLight: true
    })
    const rifle = weapon([{
      name: "Lampe VN", isActive: true, system: {
        weaponAccessory: {
          specialEffect: "flashLightLowLight"
        }
      }
    }])
    expect(lightOf(rifle, actor)).toBe(-1)
  })
})
