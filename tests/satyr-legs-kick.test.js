import {
  describe, it, expect
} from "vitest"
import {
  weaponDamageBonusApplies, KICK_TRAIT
} from "../modules/entities/items/weaponTraits.js"
import {
  WEAPON_ACCESSORY_CATALOG
} from "../modules/data/weaponAccessoryCatalog.js"
import {
  SR5
} from "../modules/config.js"

// Jambes de satyre (Run Faster p. 83, VF): "un modificateur de VD de +2 aux attaques par coup de pied". The +2 is a
// "Weapons / DV" effect aimed at "kick": it reaches the unarmed weapons wearing the Kick trait, and no other.

const weapon = (category, traits = []) => ({
  weaponSkill: {
    category
  }, accessory: traits.map(name => ({
    name, type: "trait", isActive: true
  }))
})

describe("Kick trait and the Jambes de satyre bonus", () => {
  it("is a free trait of the catalog, named in the weapon accessories", () => {
    expect(WEAPON_ACCESSORY_CATALOG[KICK_TRAIT]).toEqual({
      price: 0, slot: "", type: "trait"
    })
    expect(SR5.weaponAccessories[KICK_TRAIT]).toBe("SR5.AccessoryKick")
  })
  it("reaches an unarmed weapon wearing the Kick trait", () => {
    expect(weaponDamageBonusApplies(weapon("unarmedCombat", [KICK_TRAIT]), "kick")).toBe(true)
  })
  it("does not reach a punch, nor a melee weapon wearing the trait by mistake", () => {
    expect(weaponDamageBonusApplies(weapon("unarmedCombat"), "kick")).toBe(false)
    expect(weaponDamageBonusApplies(weapon("blades", [KICK_TRAIT]), "kick")).toBe(false)
  })
  it("keeps the bonuses aimed at a category as before, a kick included", () => {
    expect(weaponDamageBonusApplies(weapon("unarmedCombat", [KICK_TRAIT]), "unarmedCombat")).toBe(true)
    expect(weaponDamageBonusApplies(weapon("unarmedCombat"), "unarmedCombat")).toBe(true)
    expect(weaponDamageBonusApplies(weapon("clubs"), "unarmedCombat")).toBe(false)
  })
})
