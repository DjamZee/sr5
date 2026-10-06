import {
  describe, it, expect, beforeEach
} from "vitest"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// SR5 p. 458 and 463: the bone augmentations change the unarmed damage: bone density (STR + rating − 1)P,
// reinforced bones (STR + n)P. They are not compatible with each other: if several are carried, the highest.

const weapon = (category = "unarmedCombat") => ({
  accuracy: {
    base: 0, modifiers: [], isPhysicalLimitBased: false
  },
  damageValue: {
    base: 0, modifiers: [], isStrengthBased: true
  },
  armorPenetration: {
    base: 0, modifiers: []
  },
  recoilCompensation: {
    base: 0, modifiers: []
  },
  damageType: "stun",
  weaponSkill: {
    category
  },
  firingMode: {
  },
  choke: {
  },
})

const actorWith = modifiers => ({
  type: "actorPc",
  system: {
    attributes: {
      strength: {
        augmented: {
          value: 4
        }
      }
    },
    initiatives: {
      astralInit: {
        isActive: false
      }
    },
    itemsProperties: {
      weapon: {
        accuracy: {
          modifiers: []
        },
        damageValue: {
          modifiers
        }
      }
    },
  },
})

// What the actor's preparation leaves for one item's effect
const prepared = (name, rating, effect) => {
  const target = {
    modifiers: []
  }
  SR5_CharacterUtility.applyCustomEffects({
    name, type: "itemAugmentation", system: {
      itemRating: rating, isActive: true, customEffects: [{
        category: "weaponEffectTargets", target: "system.itemsProperties.weapon.damageValue", wifi: false, ...effect
      }]
    }
  }, {
    system: {
      itemsProperties: {
        weapon: {
          damageValue: target
        }
      }
    }
  })
  return target.modifiers
}

beforeEach(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = k => k
})

describe("unarmed damage of the bone augmentations", () => {
  it("bone density adds its rating − 1 and turns the damage physical", () => {
    const mods = prepared("Densité", 3, {
      type: "unarmedCombat", ratingOffset: -1, damageType: "physical"
    })
    expect(mods.map(m => [m.value, m.damageType])).toEqual([[2, "physical"]])
    const w = weapon()
    SR5_UtilityItem._generateWeaponDamage(w, actorWith(mods))
    expect(w.damageValue.value).toBe(4 + 2)
    expect(w.damageType).toBe("physical")
  })

  it("reads the rating again at each preparation, without writing it into the effect", () => {
    const effect = {
      category: "weaponEffectTargets", target: "system.itemsProperties.weapon.damageValue", type: "unarmedCombat",
      wifi: false, value: 0, ratingOffset: -1, damageType: "physical"
    }
    const item = {
      name: "Densité", type: "itemAugmentation", system: {
        itemRating: 4, isActive: true, customEffects: [effect]
      }
    }
    const prepare = () => {
      const target = {
        modifiers: []
      }
      SR5_CharacterUtility.applyCustomEffects(item, {
        system: {
          itemsProperties: {
            weapon: {
              damageValue: target
            }
          }
        }
      })
      return target.modifiers[0].value
    }
    expect(prepare()).toBe(3)
    item.system.itemRating = 2
    expect(prepare()).toBe(1)
    expect(effect.value).toBe(0)
  })

  it("rating 1 still turns the damage physical, with no bonus", () => {
    const w = weapon()
    SR5_UtilityItem._generateWeaponDamage(w, actorWith(prepared("Densité", 1, {
      type: "unarmedCombat", ratingOffset: -1, damageType: "physical"
    })))
    expect([w.damageValue.value, w.damageType]).toEqual([4, "physical"])
  })

  it("keeps only the highest of two bone augmentations", () => {
    const mods = [...prepared("Densité", 4, {
      type: "unarmedCombat", ratingOffset: -1, damageType: "physical"
    }), ...prepared("Titane", 0, {
      type: "unarmedCombat", value: 3, damageType: "physical"
    }), ...prepared("Plastique", 0, {
      type: "unarmedCombat", value: 1, damageType: "physical"
    })]
    const w = weapon()
    SR5_UtilityItem._generateWeaponDamage(w, actorWith(mods))
    expect(w.damageValue.value).toBe(4 + 3)
  })

  it("leaves a weapon of another category alone", () => {
    const w = weapon("blades")
    SR5_UtilityItem._generateWeaponDamage(w, actorWith(prepared("Densité", 3, {
      type: "unarmedCombat", ratingOffset: -1, damageType: "physical"
    })))
    expect([w.damageValue.value, w.damageType]).toEqual([4, "stun"])
  })

  it("an effect without the new fields works as before: fixed value, not the rating, damage type untouched", () => {
    const mods = prepared("Gants", 5, {
      type: "unarmedCombat", value: 1
    })
    expect(mods).toEqual([{
      source: "Gants", type: "itemAugmentation", value: 1, isMultiplier: false, details: "unarmedCombat"
    }])
    const w = weapon()
    SR5_UtilityItem._generateWeaponDamage(w, actorWith([...mods, {
      source: "Sans catégorie", type: "itemGear", value: 1, isMultiplier: false, details: undefined
    }]))
    expect([w.damageValue.value, w.damageType]).toEqual([4 + 1, "stun"])
  })

  it("a bone augmentation adds to the other bonuses of the category", () => {
    const w = weapon()
    SR5_UtilityItem._generateWeaponDamage(w, actorWith([...prepared("Gants", 0, {
      type: "unarmedCombat", value: 1
    }), ...prepared("Titane", 0, {
      type: "unarmedCombat", value: 3, damageType: "physical"
    })]))
    expect([w.damageValue.value, w.damageType]).toEqual([4 + 1 + 3, "physical"])
  })
})
