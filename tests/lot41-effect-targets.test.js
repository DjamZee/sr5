import {
  describe, it, expect, beforeEach, vi
} from "vitest"

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_UtilityItem
} from "../modules/entities/items/utilityItem.js"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  unarmedReachBonus
} from "../modules/entities/items/weaponTraits.js"
import {
  defenseUnlimitedHits, rollLimitValue
} from "../modules/rolls/roll-helpers/limit.js"
import {
  calledShotSkillsOf, calledShotSkillMatches, calledShotModifierFor
} from "../modules/rolls/roll-helpers/calledShotSkills.js"
import {
  handleMartialArtsCalledShot
} from "../modules/rolls/roll-prepare-case/rollData-Weapon.js"

beforeEach(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = k => k
})

// What applyCustomEffects leaves on the target of one item's effect
const applied = (effect, system, item = {
}) => {
  const actor = {
    system
  }
  SR5_CharacterUtility.applyCustomEffects({
    name: "Technique", type: "itemMartialArt", system: {
      isActive: true, itemRating: 2, customEffects: [{
        wifi: false, ...effect
      }], ...item
    }
  }, actor)
  return actor
}

const range = () => Object.fromEntries(["short", "medium", "long", "extreme"].map(k => [k, {
  base: 0, modifiers: []
}]))
const meleeWeapon = (skill, accessory = []) => ({
  category: "meleeWeapon", weaponSkill: {
    category: skill
  }, reach: {
    base: 0, modifiers: []
  }, range: range(), systemEffects: [], accessory
})
const actorWithReach = modifiers => ({
  system: {
    itemsProperties: {
      weapon: {
        reach: {
          modifiers
        }
      }
    }
  }
})
const reachEffect = (type, value) => applied({
  category: "weaponEffectTargets", target: "system.itemsProperties.weapon.reach", type, value
}, {
  itemsProperties: {
    weapon: {
      reach: {
        modifiers: []
      }
    }
  }
}).system.itemsProperties.weapon.reach.modifiers

describe("Weapons / Reach effect target", () => {
  it("keeps the weapon type as the modifier's details", () => {
    expect(reachEffect("unarmedCombat", 1).map(m => [m.value, m.details])).toEqual([[1, "unarmedCombat"]])
  })

  it("lengthens the melee weapons of its type only", () => {
    const mods = reachEffect("unarmedCombat", 1)
    const fists = meleeWeapon("unarmedCombat")
    SR5_UtilityItem._generateWeaponRange(fists, actorWithReach(mods))
    expect(fists.reach.value).toBe(1)
    const sword = meleeWeapon("blades")
    SR5_UtilityItem._generateWeaponRange(sword, actorWithReach(mods))
    expect(sword.reach.value).toBe(0)
  })

  it("reaches the kicks alone with the kick type", () => {
    const mods = reachEffect("kick", 1)
    const kick = meleeWeapon("unarmedCombat", [{
      name: "kick"
    }])
    const punch = meleeWeapon("unarmedCombat")
    SR5_UtilityItem._generateWeaponRange(kick, actorWithReach(mods))
    SR5_UtilityItem._generateWeaponRange(punch, actorWithReach(mods))
    expect([kick.reach.value, punch.reach.value]).toEqual([1, 0])
  })

  it("changes nothing without an effect", () => {
    const fists = meleeWeapon("unarmedCombat")
    SR5_UtilityItem._generateWeaponRange(fists, actorWithReach([]))
    expect(fists.reach.value).toBe(0)
  })

  it("adds the bare hands' share to an unarmed defender, never the kicks'", () => {
    expect(unarmedReachBonus({
      itemsProperties: {
        weapon: {
          reach: {
            modifiers: [{
              value: 1, details: "unarmedCombat"
            }, {
              value: 1, details: "kick"
            }, {
              value: 2, details: "blades"
            }]
          }
        }
      }
    })).toBe(1)
    expect(unarmedReachBonus({
    })).toBe(0)
  })
})

describe("unlimited hits of an active defense", () => {
  it("sets the flag of the defense through a boolean effect", () => {
    const actor = applied({
      category: "characterDefenses", target: "system.defenses.dodge.unlimited", type: "boolean", value: "true"
    }, {
      defenses: {
        dodge: {
          unlimited: false
        }, block: {
          unlimited: false
        }
      }
    })
    expect(defenseUnlimitedHits(actor.system.defenses)).toEqual({
      dodge: true, block: false, parryBlades: false, parryClubs: false
    })
  })

  it("is off by default", () => {
    expect(Object.values(defenseUnlimitedHits(undefined)).some(Boolean)).toBe(false)
  })

  it("the roll keeps no limit once lifted", () => {
    expect(rollLimitValue({
      value: 5, unlimited: true
    })).toBe(0)
    expect(rollLimitValue({
      value: 5
    })).toBe(5)
  })
})

describe("called shot technique kept for some attacks", () => {
  it("reads a list or a comma-separated string, none meaning every attack", () => {
    expect(calledShotSkillsOf({
      skills: ["unarmedCombat"]
    })).toEqual(["unarmedCombat"])
    expect(calledShotSkillsOf({
      skills: "blades, clubs"
    })).toEqual(["blades", "clubs"])
    expect(calledShotSkillsOf({
      skills: ""
    })).toBeNull()
    expect(calledShotSkillsOf({
    })).toBeNull()
  })

  it("'armed' stands for any skill but Unarmed Combat", () => {
    expect(calledShotSkillMatches(["armed"], "blades")).toBe(true)
    expect(calledShotSkillMatches(["armed"], "pistols")).toBe(true)
    expect(calledShotSkillMatches(["armed"], "unarmedCombat")).toBe(false)
    expect(calledShotSkillMatches(null, "unarmedCombat")).toBe(true)
  })

  const disarm = () => applied({
    category: "martialArts", target: "system.itemsProperties.martialArts.disarm.modifier", type: "value", value: 1, skills: ["unarmedCombat"]
  }, {
    itemsProperties: {
      martialArts: {
        disarm: {
          modifier: {
            value: 0, modifiers: []
          }
        }
      }
    }
  }).system.itemsProperties.martialArts.disarm.modifier

  it("keeps the skills on the modifier", () => {
    expect(disarm().modifiers.map(m => [m.value, m.skills])).toEqual([[1, ["unarmedCombat"]]])
  })

  it("eases the attacks of its skills only", () => {
    const modifier = disarm()
    modifier.value = 1
    expect(calledShotModifierFor(modifier, "unarmedCombat")).toBe(1)
    expect(calledShotModifierFor(modifier, "blades")).toBe(0)
  })

  it("leaves an effect without skills as it was: every attack", async () => {
    const actor = applied({
      category: "martialArts", target: "system.itemsProperties.martialArts.disarm.modifier", type: "value", value: 1
    }, {
      itemsProperties: {
        martialArts: {
          disarm: {
            modifier: {
              value: 0, modifiers: []
            }
          }
        }
      }
    })
    const modifier = actor.system.itemsProperties.martialArts.disarm.modifier
    expect(modifier.modifiers[0].skills).toBeUndefined()
    modifier.value = 1
    expect(calledShotModifierFor(modifier, "blades")).toBe(1)
  })

  it("handleMartialArtsCalledShot reads the attack's skill", async () => {
    const rollData = () => ({
      combat: {
        calledShot: {
          martialArts: {
          }, martialArtsModifiers: {
          }
        }
      }
    })
    const actor = {
      system: {
        itemsProperties: {
          martialArts: {
            feint: {
              isActive: false, modifier: {
                value: 2, modifiers: [{
                  value: 2, skills: ["armed"]
                }]
              }
            }
          }
        }
      }
    }
    expect((await handleMartialArtsCalledShot(rollData(), actor, "blades")).combat.calledShot.martialArtsModifiers.feint).toBe(2)
    expect((await handleMartialArtsCalledShot(rollData(), actor, "unarmedCombat")).combat.calledShot.martialArtsModifiers.feint).toBeUndefined()
  })
})
