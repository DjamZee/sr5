import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

const modifier = () => ({
  base: 0, value: 0, modifiers: []
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
      lowLight: {
        isActive: lowLight
      }, thermographic: {
        isActive: thermographic
      }
    },
  },
})
const weapon = (accessory = [], isActive = true) => ({
  isActive, ammunition: {
    type: ""
  }, accessory
})
// A weapon's built-in accessory (catalog entry, stored by name), e.g. the SPAS-24's flashlight (Run & Gun p. 54)
const builtIn = (name, isActive = true) => ({
  name, isActive
})
// An accessory item (compendium or world), carrying its effect in weaponAccessory.specialEffect
const accessoryItem = (name, specialEffect = "", isActive = true) => ({
  name, isActive, system: {
    weaponAccessory: {
      specialEffect
    }
  }
})
const sceneWithLight = light => ({
  getFlag: (_scope, key) => (key === "environModLight" ? light : 0)
})
const shot = (light, w, actor) => SR5_CombatHelpers.handleEnvironmentalModifiers(sceneWithLight(light), actor.system, false, undefined, false,
  SR5_UtilityItem.getWeaponLightCompensation(w, actor), SR5_UtilityItem.getWeaponLightCap(w))

describe("standard weapon flashlight (Run & Gun p. 69: partial light)", () => {
  beforeEach(() => {
    globalThis.game = {
      i18n: {
        localize: key => (key === "SR5.AccessoryFlashLight" ? "Lampe torche" : key)
      }
    }
  })
  afterEach(() => {
    delete globalThis.game
  })

  it("brings total darkness down to partial light for a shot with its weapon (-1 instead of -6)", () => {
    const actor = holder()
    expect(shot(3, weapon([builtIn("flashLight")]), actor)).toBe(-1)
    expect(shot(3, weapon(), actor)).toBe(-6)
  })

  it("brings dim light down to partial light, and leaves better light as it is", () => {
    const actor = holder()
    const w = weapon([builtIn("flashLight")])
    expect(shot(2, w, actor)).toBe(-1)
    expect(shot(1, w, actor)).toBe(-1)
    expect(shot(0, w, actor)).toBe(0)
  })

  it("lets low-light vision treat that partial light as full light", () => {
    expect(shot(3, weapon([builtIn("flashLight")]), holder({
      lowLight: true
    }))).toBe(0)
  })

  it("does nothing when the lamp or its weapon is off", () => {
    const actor = holder()
    expect(shot(3, weapon([builtIn("flashLight", false)]), actor)).toBe(-6)
    expect(SR5_UtilityItem.getWeaponLightCap(weapon([builtIn("flashLight")], false))).toBeNull()
  })

  it("works for an accessory item, including the compendium's lamp whose specialEffect is empty", () => {
    const actor = holder()
    expect(shot(3, weapon([accessoryItem("Ma lampe", "flashLight")]), actor)).toBe(-1)
    expect(shot(3, weapon([accessoryItem("Lampe torche")]), actor)).toBe(-1)
    // Another item with no effect is not taken for a flashlight
    expect(shot(3, weapon([accessoryItem("Crosse pliable")]), actor)).toBe(-6)
  })

  it("only counts for its own weapon: not for the defense nor for perception", () => {
    const actor = holder()
    SR5_UtilityItem._handleVisionAccessory(weapon([builtIn("flashLight")]), actor)
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(sceneWithLight(3), actor.system, true, undefined, true)).toBe(-6)
    expect(SR5_CombatHelpers.handleEnvironmentalModifiers(sceneWithLight(3), actor.system, true)).toBe(-6)
  })
})
