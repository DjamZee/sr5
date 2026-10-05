import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'
import {
  capBallReloadStep, CAP_BALL_STEPS
} from '../modules/entities/items/weaponTraits.js'

//Gun H(e)aven 3 p. 3: Vintage and Cap & Ball traits
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
const weapon = (accessory, wireless = true) => ({
  accessory,
  isWireless: wireless,
  wirelessTurnedOn: wireless,
  price: mods(1000),
  concealment: mods(),
  accuracy: mods(5),
  availability: mods(),
  damageValue: mods(),
  weaponSkill: mods(),
  recoilCompensation: mods(),
})
const priceOf = (data, name) => data.accessory.find(a => a.name === name).price

describe("Vintage", () => {
  it("can never be wireless", () => {
    const data = weapon([{
      name: "vintage", isActive: true
    }])
    SR5_UtilityItem._handleWeaponAccessory(data)
    expect(data.isWireless).toBe(false)
    expect(data.wirelessTurnedOn).toBe(false)
  })
  it("doubles the price of physical upgrades", () => {
    const plain = weapon([{
      name: "bipod", isActive: true
    }])
    const old = weapon([{
      name: "vintage", isActive: true
    }, {
      name: "bipod", isActive: true
    }])
    SR5_UtilityItem._handleWeaponAccessory(plain)
    SR5_UtilityItem._handleWeaponAccessory(old)
    expect(priceOf(plain, "bipod")).toBeGreaterThan(0)
    expect(priceOf(old, "bipod")).toBe(priceOf(plain, "bipod") * 2)
    expect(priceOf(old, "vintage")).toBe(0)
  })
  it("leaves a modern weapon's wireless alone", () => {
    const data = weapon([{
      name: "bipod", isActive: true
    }])
    SR5_UtilityItem._handleWeaponAccessory(data)
    expect(data.wirelessTurnedOn).toBe(true)
  })
})

describe("Cap & Ball reload", () => {
  it("loads one round on the third Complex Action", () => {
    let r = capBallReloadStep(undefined)
    expect(r).toMatchObject({
      done: 1, loaded: 0
    })
    r = capBallReloadStep(r.step)
    expect(r).toMatchObject({
      done: 2, loaded: 0
    })
    r = capBallReloadStep(r.step)
    expect(r).toMatchObject({
      done: CAP_BALL_STEPS, loaded: 1, step: 0
    })
  })
})
