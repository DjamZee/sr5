import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'
import {
  triggerRemovalAccuracy
} from '../modules/entities/items/weapon-accessory-rules.js'

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
const shooter = smartlink => ({
  type: "actorPc", system: {
    specialProperties: {
      smartlink: {
        value: smartlink
      }
    }
  }, items: new Map()
})
const acc = name => ({
  name, isActive: true
})
const prepared = (accessories, smartlink) => {
  const data = weapon(accessories)
  SR5_UtilityItem._handleWeaponAccessory(data, shooter(smartlink))
  return data
}

describe("Trigger removal (Hard Targets p. 182)", () => {
  it("adds its +1 to the smartgun's Accuracy, the smartlink it requires", () => {
    const data = prepared([acc("smartgunSystemInternal"), acc("triggerRemoval")], 2)
    expect(total(data.accuracy)).toBe(3)
  })

  it("competes with the other Accuracy bonuses when the shooter has no smartlink", () => {
    const data = prepared([acc("smartgunSystemInternal"), acc("triggerRemoval"), acc("redDotSight")], 0)
    expect(total(data.accuracy)).toBe(1)
  })

  it("does nothing without a smartgun system on the weapon", () => {
    expect(triggerRemovalAccuracy(weapon([acc("triggerRemoval")]))).toBeNull()
    expect(total(prepared([acc("triggerRemoval")], 2).accuracy)).toBe(0)
  })

  it("is recognised by its name on a Mégapack item", () => {
    const item = {
      name: "Suppression de la détente", isActive: true, system: {
        weaponAccessory: {
        }
      }
    }
    expect(triggerRemovalAccuracy(weapon([item, acc("smartgunSystemExternal")]))?.accessory).toBe(item)
  })
})
