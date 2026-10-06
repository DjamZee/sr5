import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'
import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'

//Osmium mace (The Complete Trog p. 177): Acc 4*, DV (STR+4)P; Acc 3 and (STR+2)P with STR <= 4, Acc 5 and (STR+6)P with STR >= 7
beforeAll(() => {
  globalThis.game = globalThis.game || {
  }
  globalThis.game.i18n = globalThis.game.i18n || {
    localize: k => k
  }
  globalThis.SR5 = globalThis.SR5 || {
  }
})

const mods = base => ({
  base, value: base, modifiers: []
})
const actor = strength => ({
  type: "actorPc",
  system: {
    attributes: {
      strength: {
        augmented: {
          value: strength
        }
      }
    },
    limits: {
      physicalLimit: {
        value: 6
      }
    },
    initiatives: {
      astralInit: {
        isActive: false
      }
    },
  }
})
const mace = () => ({
  accessory: [{
    name: "osmium", isActive: true
  }],
  accuracy: mods(4),
  damageValue: {
    ...mods(4), isStrengthBased: true
  },
  weaponSkill: {
    category: "club"
  },
  firingMode: {
  },
  choke: {
  },
})
const profile = strength => {
  const data = mace()
  try {
    SR5_UtilityItem._generateWeaponDamage(data, actor(strength))
  } catch {
    // the firing-mode tail needs the full config; the damage part runs first
  }
  SR5_EntityHelpers.updateValue(data.accuracy)
  SR5_EntityHelpers.updateValue(data.damageValue)
  return {
    accuracy: data.accuracy.value, damage: data.damageValue.value
  }
}

describe("Osmium mace", () => {
  it("is clumsy with STR 3", () => {
    expect(profile(3)).toEqual({
      accuracy: 3, damage: 5
    })
  })
  it("keeps the listed profile with STR 5", () => {
    expect(profile(5)).toEqual({
      accuracy: 4, damage: 9
    })
  })
  it("hits like a myth with STR 8", () => {
    expect(profile(8)).toEqual({
      accuracy: 5, damage: 14
    })
  })
})
