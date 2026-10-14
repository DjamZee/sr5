import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'
import {
  SR5
} from '../modules/config.js'
import {
  WEAPON_ACCESSORY_CATALOG
} from '../modules/data/weaponAccessoryCatalog.js'

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
  isWireless: false,
  wirelessTurnedOn: false,
  price: mods(300),
  concealment: mods(),
  accuracy: mods(5),
  availability: mods(),
  damageValue: mods(),
  armorPenetration: mods(),
  reach: mods(),
  weaponSkill: mods(),
  recoilCompensation: mods(),
})
const total = property => property.modifiers.reduce((sum, m) => sum + m.value, 0)
const prepared = names => {
  const data = weapon(names.map(name => ({
    name, isActive: true
  })))
  SR5_UtilityItem._handleWeaponAccessory(data, undefined)
  return data
}

describe("Instrument of death (No Future p. 152-153)", () => {
  it("Accuracy -1, Availability +2, the weapon's price twice", () => {
    const data = prepared(["deathInstrument"])
    expect(total(data.accuracy)).toBe(-1)
    expect(total(data.availability)).toBe(2)
    expect(total(data.price)).toBe(300)
  })
})

describe("Special modifications (Better Than Bad p. 145)", () => {
  it("each option adds its own, and two options stack", () => {
    const data = prepared(["specialModDamage", "specialModArmorPenetration", "specialModAccuracy", "specialModRecoil", "specialModConcealment", "specialModReach", "specialModAccuracy"])
    expect(total(data.damageValue)).toBe(1)
    expect(total(data.armorPenetration)).toBe(-1)
    expect(total(data.accuracy)).toBe(2)
    expect(total(data.recoilCompensation)).toBe(1)
    expect(total(data.concealment)).toBe(-1)
    expect(total(data.reach)).toBe(1)
  })

  it("every new trait has its label", () => {
    for (const key of ["deathInstrument", "specialModDamage", "specialModArmorPenetration", "specialModAccuracy", "specialModRecoil", "specialModConcealment", "specialModReach", "net", "netXL", "shockNet"]) {
      expect(WEAPON_ACCESSORY_CATALOG[key]?.type).toBe("trait")
      expect(SR5.weaponAccessories[key]).toBeTruthy()
    }
  })
})
