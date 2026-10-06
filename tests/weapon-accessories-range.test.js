import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'
import {
  redDotSightWorks, redDotSightBonus, ignoredRecoilAccessories, isAccessoryKind
} from '../modules/entities/items/weapon-accessory-rules.js'
import {
  laserDamageReduction, energyAuraApplies, jugularToxin
} from '../modules/rolls/roll-helpers/weapon-attack-rules.js'

beforeAll(() => {
  globalThis.game = globalThis.game || {
  }
  globalThis.game.i18n = globalThis.game.i18n || {
    localize: k => k
  }
})

const mods = (base = 0) => ({
  base, value: base, modifiers: []
})
const weapon = (accessory) => ({
  accessory,
  isWireless: true,
  wirelessTurnedOn: true,
  price: mods(1000),
  concealment: mods(),
  accuracy: mods(5),
  availability: mods(),
  damageValue: mods(),
  weaponSkill: mods(),
  recoilCompensation: mods(),
})
const total = property => property.modifiers.reduce((sum, m) => sum + m.value, 0)
//An accessory dropped from the Mégapack: no specialEffect, recognised by its name
const item = (name, itemEffects = [], specialEffect = "") => ({
  name, isActive: true, system: {
    itemEffects, weaponAccessory: {
      specialEffect
    }, price: {
      base: 0
    }
  }
})
const recoil = value => ({
  target: "system.recoilCompensation", type: "value", value, cumulative: true
})

describe("Red dot sight (Street Lethal p. 49)", () => {
  it("+1 Accuracy and +1 die at short range, +1 Accuracy at medium, nothing beyond", () => {
    expect(redDotSightBonus("short")).toEqual({
      accuracy: 1, dice: 1
    })
    expect(redDotSightBonus("medium")).toEqual({
      accuracy: 1, dice: 0
    })
    expect(redDotSightBonus("long")).toEqual({
      accuracy: 0, dice: 0
    })
    expect(redDotSightBonus("extreme")).toEqual({
      accuracy: 0, dice: 0
    })
  })

  it("works alone, catalog entry or Mégapack item", () => {
    expect(redDotSightWorks(weapon([{
      name: "redDotSight", isActive: true
    }]))).toBe(true)
    expect(redDotSightWorks(weapon([item("Viseur point rouge")]))).toBe(true)
    expect(redDotSightWorks(weapon([item("Red Dot Sight")]))).toBe(true)
  })

  it("does nothing when inactive or absent", () => {
    expect(redDotSightWorks(weapon([{
      name: "redDotSight", isActive: false
    }]))).toBe(false)
    expect(redDotSightWorks(weapon([]))).toBe(false)
  })

  it("is not compatible with a laser sight, a holographic sight or a zoom", () => {
    for (const other of [item("Visée laser"), item("Viseur holographique"), item("Lunette de visée", [], "imagingScope"), {
      name: "laserSight", isActive: true
    }]) {
      expect(redDotSightWorks(weapon([item("Viseur point rouge"), other]))).toBe(false)
    }
  })

  it("is not compatible with a smartgun used through a smartlink", () => {
    const data = weapon([item("Viseur point rouge"), item("Système smartgun (interne)", [], "smartgunInternal")])
    expect(redDotSightWorks(data, true)).toBe(false)
    expect(redDotSightWorks(data, false)).toBe(true)
  })

  it("the item no longer adds its Accuracy at every range: the attack adds it", () => {
    const data = weapon([item("Viseur point rouge", [{
      target: "system.accuracy", type: "value", value: 1, cumulative: false
    }])])
    SR5_UtilityItem._handleWeaponAccessory(data)
    expect(total(data.accuracy)).toBe(0)
    const legacy = weapon([{
      name: "redDotSight", isActive: true
    }])
    SR5_UtilityItem._handleWeaponAccessory(legacy)
    expect(total(legacy.accuracy)).toBe(0)
  })
})

describe("Recoil compensation that does not stack (Run & Gun p. 71)", () => {
  it("gyro mount and tripod: only one compensates", () => {
    const data = weapon([item("Gyrostabilisateur", [recoil(6)]), item("Trépied", [recoil(6)])])
    SR5_UtilityItem._handleWeaponAccessory(data)
    expect(total(data.recoilCompensation)).toBe(6)
  })

  it("keeps the best of a group (bipod 2 and foregrip 1: 2)", () => {
    const data = weapon([{
      name: "foregrip", isActive: true
    }, {
      name: "bipod", isActive: true
    }])
    SR5_UtilityItem._handleWeaponAccessory(data)
    expect(total(data.recoilCompensation)).toBe(2)
    //The foregrip keeps its other effect
    expect(total(data.concealment)).toBe(1)
  })

  it("the two groups add up, as do systems outside them", () => {
    const data = weapon([item("Trépied", [recoil(6)]), item("Crosse pliable", [recoil(1)]), item("Support de hanche rembourré", [recoil(1)]), item("Tir électronique", [recoil(1)])])
    SR5_UtilityItem._handleWeaponAccessory(data)
    expect(total(data.recoilCompensation)).toBe(8)
  })

  it("the same system twice does not double", () => {
    const data = weapon([item("Trépied", [recoil(6)]), item("Trépied", [recoil(6)])])
    SR5_UtilityItem._handleWeaponAccessory(data)
    expect(total(data.recoilCompensation)).toBe(6)
  })

  it("an inactive accessory does not take the place of an active one", () => {
    const gyro = item("Gyrostabilisateur", [recoil(6)])
    const bipod = item("Bipied", [recoil(2)])
    gyro.isActive = false
    expect(ignoredRecoilAccessories(weapon([gyro, bipod]), SR5_UtilityItem._accessoryRecoil).size).toBe(0)
  })

  it("does not take the stock removal or an adhesive stock for a stock of the group", () => {
    expect(isAccessoryKind(item("Suppression de la crosse"), "foldingStock")).toBe(false)
    expect(isAccessoryKind(item("Crosse adhésive"), "shockPad")).toBe(false)
    expect(isAccessoryKind(item("Crosse rembourrée / Rembourrage antichoc"), "shockPad")).toBe(true)
  })
})

describe("Laser weapons (Run & Gun p. 64)", () => {
  it("DV -1 per range band beyond short range", () => {
    expect(["short", "medium", "long", "extreme"].map(r => laserDamageReduction(r))).toEqual([0, 1, 2, 3])
  })
  it("DV -1 per level of visibility, added to range: extreme range in moderate fog is -5", () => {
    expect(laserDamageReduction("extreme", 2)).toBe(5)
    expect(laserDamageReduction("short", 3)).toBe(3)
    expect(laserDamageReduction("short", 4)).toBe(3)
  })
})

describe("Energy aura (SR5 p. 397): melee attacks only", () => {
  it("applies to a melee weapon, not to a ranged one or a grenade", () => {
    expect(energyAuraApplies("meleeWeapon")).toBe(true)
    expect(energyAuraApplies("rangedWeapon")).toBe(false)
    expect(energyAuraApplies("grenade")).toBe(false)
  })
})

describe("Hit 'em Where It Counts (Run & Gun p. 131)", () => {
  it("toxin Power +2 and speed -1, without touching the weapon", () => {
    const toxin = {
      power: 6, speed: 3
    }
    expect(jugularToxin(toxin)).toEqual({
      power: 8, speed: 2
    })
    expect(toxin).toEqual({
      power: 6, speed: 3
    })
  })
  it("an immediate toxin stays immediate, a toxin of Power 0 stays 0", () => {
    expect(jugularToxin({
      power: 0, speed: 0
    })).toEqual({
      power: 0, speed: 0
    })
  })
})
