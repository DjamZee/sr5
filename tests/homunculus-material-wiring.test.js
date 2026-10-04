import {
  describe, it, expect, beforeAll, afterEach
} from "vitest"

// SR5 p. 301: the Body of a homunculus is the Structure of its material (table SR5 p. 198).
// These tests go through the real paths: attributes, Armor under the world setting, weapon breaking.

import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_ConverterHelpers
} from "../modules/rolls/roll-helpers/converter.js"
import {
  SR5, SR5_BARRIER_RATINGS
} from "../modules/config.js"

let materialArmorSetting = false

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  globalThis.game.i18n.format ??= (key) => key
  globalThis.game.settings = {
    get: (scope, key) => key === "sr5HomunculusMaterialArmor" ? materialArmorSetting : undefined
  }
})

afterEach(() => {
  materialArmorSetting = false
})

const value = () => ({
  base: 0, value: 0, modifiers: []
})
const attribute = () => ({
  natural: value(), augmented: value()
})

function spirit(type, material) {
  const attributes = {
  }
  for (const key of ["body", "agility", "reaction", "strength", "willpower", "logic", "intuition", "charisma"]) attributes[key] = attribute()
  const armor = {
    ...value(), specialDamage: {
    }, toxin: {
    }
  }
  for (const key of Object.keys(SR5.specialDamageTypes)) armor.specialDamage[key] = value()
  for (const key of Object.keys(SR5.propagationVectors)) armor.toxin[key] = value()
  return {
    type: "actorSpirit",
    system: {
      type,
      force: {
        base: 4, value: 4, modifiers: []
      },
      homunculusMaterial: material,
      attributes,
      specialAttributes: {
        magic: attribute()
      },
      essence: value(),
      initiatives: {
        physicalInit: {
          ...value(), dice: value()
        }
      },
      penalties: {
      },
      itemsProperties: {
        armor
      },
    }
  }
}

describe("homunculus Body from its material (utilityActor)", () => {
  it("takes the Structure of the chosen material", () => {
    const actor = spirit("homunculus", {
      type: "heavy", structure: 0, armor: 0
    })
    SR5_CharacterUtility.updateSpiritAttributes(actor)
    expect(actor.system.attributes.body.natural.base).toBe(6)
  })

  it("takes the Structure typed in for another material", () => {
    const actor = spirit("homunculus", {
      type: "other", structure: 18, armor: 3
    })
    SR5_CharacterUtility.updateSpiritAttributes(actor)
    expect(actor.system.attributes.body.natural.base).toBe(18)
  })

  it("stays at 0 without a material", () => {
    const actor = spirit("homunculus", {
      type: "", structure: 0, armor: 0
    })
    SR5_CharacterUtility.updateSpiritAttributes(actor)
    expect(actor.system.attributes.body.natural.base).toBe(0)
  })
})

describe("homunculus Armor under the world setting (utilityActor)", () => {
  it("gets no Armor by default, as in the book", () => {
    const actor = spirit("homunculus", {
      type: "heavy", structure: 0, armor: 0
    })
    SR5_CharacterUtility.updateArmor(actor)
    expect(actor.system.itemsProperties.armor.value).toBe(0)
  })

  it("gets the Armor of its material when the setting is on", () => {
    materialArmorSetting = true
    const actor = spirit("homunculus", {
      type: "heavy", structure: 0, armor: 0
    })
    SR5_CharacterUtility.updateArmor(actor)
    expect(actor.system.itemsProperties.armor.value).toBe(8)
  })

  it("leaves other spirits alone, setting on", () => {
    materialArmorSetting = true
    const actor = spirit("air", {
      type: "heavy", structure: 0, armor: 0
    })
    SR5_CharacterUtility.updateArmor(actor)
    expect(actor.system.itemsProperties.armor.value).toBe(0)
  })
})

describe("weapon breaking reads the same table (converter)", () => {
  it("gives the ratings of the table, Fragile Armor 2 as before", () => {
    expect(SR5_ConverterHelpers.barrierTypeToStructure("fragile")).toBe(1)
    expect(SR5_ConverterHelpers.barrierTypeToArmor("fragile")).toBe(2)
    expect(SR5_ConverterHelpers.barrierTypeToStructure("hardened")).toBe(16)
    expect(SR5_ConverterHelpers.barrierTypeToArmor("hardened")).toBe(32)
  })

  it("falls back on a heavy material for an unknown one, as before", () => {
    expect(SR5_ConverterHelpers.barrierTypeToStructure("nope")).toBe(6)
    expect(SR5_ConverterHelpers.barrierTypeToArmor("nope")).toBe(8)
  })

  it("follows a change of the table", () => {
    const saved = {
      ...SR5_BARRIER_RATINGS.average
    }
    SR5_BARRIER_RATINGS.average.armor = 99
    try {
      expect(SR5_ConverterHelpers.barrierTypeToArmor("average")).toBe(99)
    } finally {
      SR5_BARRIER_RATINGS.average = saved
    }
  })
})
