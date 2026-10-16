import {
  describe, it, expect, beforeEach
} from "vitest"
import {
  limbAttributes, weaponLimb, weaponAttribute, withLimbAgility, hostLimb, limbEnhancementNames, limbChoices,
  isLimbAttributeTarget, strengthRecoil, weaponRecoilCompensation
} from "../modules/system/cyberlimb.js"
import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"

// SR5 p. 459-460: a cyberlimb has its own Strength and Agility (3, more when customized), raised by the enhancement
// of each type installed in it; a weapon held by the limb attacks with its Agility and hits with its Strength.
// Fragmentation p. 10 (Redoak): arm FOR 6 + Strength enhancement 3 = 9, sap (FOR + 2)P = 8 with the body, 11 with the arm.

const items = list => Object.assign([...list], {
  get: id => list.find(i => i.id === id)
})

const enhancement = (id, name, attribute, rating, situational = true) => ({
  id, _id: id, name, type: "itemAugmentation", system: {
    category: "cyberlimbsAccessory", itemRating: rating, isActive: true, customEffects: {
      0: {
        category: "characterAttributes", target: `system.attributes.${attribute}.augmented`, type: "rating",
        multiplier: null, situational, when: "en utilisant le membre amélioré"
      }
    }
  }
})

const arm = (id, strength, agility, plugged = [], extra = {
}) => ({
  id, name: `Bras ${id}`, type: "itemAugmentation", system: {
    category: "cyberlimbs", isActive: true, accessory: plugged.map(p => ({
      _id: p.id, name: p.name, type: p.type, system: p.system
    })),
    cyberlimbs: {
      strength: {
        base: strength, customization: 0
      }, agility: {
        base: agility, customization: 0
      }
    }, ...extra
  }
})

const actor = (list, strength = 6, agility = 4) => ({
  type: "actorPc", items: items(list), system: {
    attributes: {
      strength: {
        augmented: {
          value: strength
        }
      }, agility: {
        augmented: {
          value: agility
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
        }, damageValue: {
          modifiers: []
        }
      }
    },
  }
})

const meleeWeapon = (heldByLimb = "", base = 2) => ({
  heldByLimb,
  accuracy: {
    base: 0, modifiers: [], isPhysicalLimitBased: false
  },
  damageValue: {
    base, modifiers: [], isStrengthBased: true
  },
  armorPenetration: {
    base: 0, modifiers: []
  },
  recoilCompensation: {
    base: 0, modifiers: []
  },
  damageType: "physical",
  weaponSkill: {
    category: "clubs"
  },
  firingMode: {
  },
  choke: {
  },
})

beforeEach(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = k => k
})

describe("a cyberlimb's own attributes", () => {
  it("base plus customization plus the enhancement plugged into it", () => {
    const str = enhancement("e1", "Amélioration (FOR)", "strength", 3)
    const limb = arm("a1", 6, 6, [str])
    const attrs = limbAttributes(limb, items([limb, str]))
    expect(attrs.strength.value).toBe(9)
    expect(attrs.agility.value).toBe(6)
    expect(attrs.strength.enhancement.name).toBe("Amélioration (FOR)")
  })

  it("adds the customization (SR5 p. 459, Membres personnalisés)", () => {
    const limb = arm("a1", 3, 3)
    limb.system.cyberlimbs.agility.customization = 2
    expect(limbAttributes(limb, items([limb])).agility.value).toBe(5)
  })

  it("reads the enhancement's current rating, not the copy kept when it was plugged", () => {
    const agi = enhancement("e1", "Amélioration (AGI)", "agility", 1)
    const limb = arm("a1", 3, 3, [agi])
    agi.system.itemRating = 3
    expect(limbAttributes(limb, items([limb, agi])).agility.value).toBe(6)
  })

  it("one enhancement of each type: the highest counts (SR5 p. 460)", () => {
    const a = enhancement("e1", "AGI 1", "agility", 1), b = enhancement("e2", "AGI 2", "agility", 2)
    const limb = arm("a1", 3, 3, [a, b])
    expect(limbAttributes(limb, items([limb, a, b])).agility.value).toBe(5)
  })

  it("an enhancement plugged elsewhere does not count for this limb", () => {
    const str = enhancement("e1", "FOR 3", "strength", 3)
    const left = arm("a1", 6, 6, [str]), right = arm("a2", 6, 6)
    expect(limbAttributes(right, items([left, right, str])).strength.value).toBe(6)
    expect(hostLimb("e1", [left, right, str])).toBe(left)
    expect(hostLimb("e1", [right, str])).toBeNull()
  })

  it("an enhancement switched off, or a wireless bonus with the wireless off, raises nothing", () => {
    const str = enhancement("e1", "FOR 3", "strength", 3)
    const limb = arm("a1", 6, 6, [str])
    str.system.isActive = false
    expect(limbAttributes(limb, items([limb, str])).strength.value).toBe(6)
    str.system.isActive = true
    str.system.customEffects[0].wifi = true
    expect(limbAttributes(limb, items([limb, str])).strength.value).toBe(6)
    str.system.wirelessTurnedOn = true
    expect(limbAttributes(limb, items([limb, str])).strength.value).toBe(9)
  })
})

describe("the limb a weapon is held by", () => {
  it("an active cyberlimb of the actor, else none", () => {
    const limb = arm("a1", 6, 6)
    expect(weaponLimb({
      heldByLimb: "a1"
    }, items([limb]))).toBe(limb)
    expect(weaponLimb({
      heldByLimb: ""
    }, items([limb]))).toBeNull()
    expect(weaponLimb({
      heldByLimb: "gone"
    }, items([limb]))).toBeNull()
    limb.system.isActive = false
    expect(weaponLimb({
      heldByLimb: "a1"
    }, items([limb]))).toBeNull()
  })

  it("the choices are the active cyberlimbs", () => {
    const limb = arm("a1", 6, 6), off = arm("a2", 3, 3)
    off.system.isActive = false
    expect(limbChoices([limb, off, enhancement("e1", "x", "strength", 1)])).toEqual({
      a1: "Bras a1"
    })
  })

  it("recoil compensation: the limb's Strength for a weapon it holds, the other sources kept (SR5 p. 178, 459)", () => {
    const str = enhancement("e1", "FOR 3", "strength", 3)
    const limb = arm("a1", 6, 6, [str])
    const a = actor([limb, str], 2)
    // Body Strength 2: 1 + 1, plus an effect worth 1
    a.system.recoilCompensation = {
      base: strengthRecoil(2), value: strengthRecoil(2) + 1
    }
    expect(weaponRecoilCompensation({
      heldByLimb: ""
    }, a)).toBe(3)
    // Arm Strength 9: 1 + 3, plus the same effect
    expect(weaponRecoilCompensation({
      heldByLimb: "a1"
    }, a)).toBe(5)
    expect([strengthRecoil(3), strengthRecoil(4), strengthRecoil(0)]).toEqual([2, 3, 1])
  })

  it("Strength and Agility: the limb's, or the actor's when held by the body", () => {
    const str = enhancement("e1", "FOR 3", "strength", 3)
    const limb = arm("a1", 6, 6, [str])
    const a = actor([limb, str])
    expect(weaponAttribute("strength", {
      heldByLimb: "a1"
    }, a)).toBe(9)
    expect(weaponAttribute("agility", {
      heldByLimb: "a1"
    }, a)).toBe(6)
    expect(weaponAttribute("strength", {
      heldByLimb: ""
    }, a)).toBe(6)
  })

  it("swaps the Agility of the dice pool without touching the actor's skill modifiers", () => {
    const shared = {
      source: "SR5.Agility", type: "linkedAttribute", value: 4
    }
    const skill = {
      source: "SR5.Clubs", type: "skillRating", value: 5
    }
    const out = withLimbAgility([skill, shared], "SR5.Agility", 8)
    expect(out.map(m => m.value)).toEqual([5, 8])
    expect(shared.value).toBe(4)
    expect(out[1].source).toBe("SR5.Agility")
  })
})

describe("weapon damage and range with a cyberarm (Fragmentation p. 10)", () => {
  it("Redoak's sap: 8 with the body, 11 with the arm FOR 6 + 3", () => {
    const str = enhancement("e1", "FOR 3", "strength", 3)
    const limb = arm("a1", 6, 6, [str])
    const a = actor([limb, str], 6)
    const body = meleeWeapon("")
    SR5_UtilityItem._generateWeaponDamage(body, a)
    expect(body.damageValue.value).toBe(8)
    const held = meleeWeapon("a1")
    SR5_UtilityItem._generateWeaponDamage(held, a)
    expect(held.damageValue.value).toBe(11)
  })

  it("the attack dice pool takes the arm's Agility: Gorgeous George, 8 with the body, 10 with the arm (Fragmentation p. 13)", () => {
    const limb = arm("a1", 5, 5)
    const a = actor([limb], 6, 3)
    a.system.skills = {
      unarmedCombat: {
        test: {
          modifiers: [{
            source: "SR5.Agility", type: "linkedAttribute", value: 3
          }, {
            source: "SR5.UnarmedCombat", type: "skillRating", value: 5
          }]
        }
      }
    }
    const pool = heldByLimb => {
      const w = {
        system: {
          ...meleeWeapon(heldByLimb), weaponSkill: {
            category: "unarmedCombat", modifiers: [], specialization: false
          }
        }
      }
      SR5_UtilityItem._generateWeaponDicepool(w, a)
      return w.system.weaponSkill.dicePool
    }
    expect(pool("")).toBe(8)
    expect(pool("a1")).toBe(10)
    expect(a.system.skills.unarmedCombat.test.modifiers[0].value).toBe(3)
  })

  it("a thrown weapon carries the limb's Strength into its range", () => {
    const limb = arm("a1", 8, 3)
    const w = {
      heldByLimb: "a1", category: "throwingWeapon", systemEffects: [], range: {
        isStrengthBased: true,
        short: {
          base: 1, modifiers: []
        }, medium: {
          base: 2, modifiers: []
        }, long: {
          base: 5, modifiers: []
        }, extreme: {
          base: 7, modifiers: []
        }
      }
    }
    SR5_UtilityItem._generateWeaponRange(w, actor([limb], 3))
    expect(w.range.short.modifiers[0].value).toBe(8 * 1 - 1)
  })
})

describe("an enhancement plugged into a cyberlimb does not raise the body", () => {
  const apply = (item, list) => {
    const a = actor(list)
    a.system.attributes.strength.augmented.modifiers = []
    SR5_CharacterUtility.applyCustomEffects(item, a)
    return a
  }

  it("a non situational Strength enhancement in an arm is left to the arm", () => {
    const str = enhancement("e1", "FOR 3", "strength", 3, false)
    const limb = arm("a1", 6, 6, [str])
    const a = apply(str, [limb, str])
    expect(a.system.attributes.strength.augmented.modifiers).toEqual([])
    expect(limbAttributes(limb, a.items).strength.value).toBe(9)
  })

  it("the same enhancement left unplugged still applies as before", () => {
    const str = enhancement("e1", "FOR 3", "strength", 3, false)
    const a = apply(str, [str])
    expect(a.system.attributes.strength.augmented.modifiers.map(m => m.value)).toEqual([3])
  })

  it("names the limb enhancements, whose boxes a limb-held weapon roll leaves out", () => {
    const str = enhancement("e1", "FOR 3", "strength", 3)
    const limb = arm("a1", 6, 6, [str])
    expect([...limbEnhancementNames(items([limb, str]))]).toEqual(["FOR 3"])
    expect(isLimbAttributeTarget("system.attributes.agility.augmented")).toBe(true)
    expect(isLimbAttributeTarget("system.attributes.body.augmented")).toBe(false)
  })
})
