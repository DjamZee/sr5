import {
  describe, it, expect
} from 'vitest'
import {
  SR5ShopCatalog
} from '../modules/interface/shop-catalog.js'
import {
  WEAPON_ACCESSORY_CATALOG
} from '../modules/data/weaponAccessoryCatalog.js'
import {
  vintageAccessoryPrice
} from '../modules/entities/items/weaponTraits.js'

// Lot 30: a weapon accessory priced on its weapon (long barrel HT p. 180 and 183, ceramic / plasteel components
// HT p. 181, internal smartgun SR5 p. 435) has no price of its own: the shop shows it, to be bought on the
// weapon's Armory, never for nothing in the cart
const accessory = (priceMultiplier, base = 0, type = 'modification') => ({
  type: 'itemWeapon', system: {
    category: 'weaponAccessory', price: {
      base, value: base
    }, weaponAccessory: {
      priceMultiplier, type
    }
  }
})

describe('weapon accessories priced on their weapon', () => {
  it('an accessory with a multiplier and no price of its own is priced on the weapon', () => {
    expect(SR5ShopCatalog.pricedOnWeapon(accessory(1))).toBe(true)
    expect(SR5ShopCatalog.weaponPriceMultiplier(accessory(3))).toBe(3)
  })
  it('an accessory with its own price, a trait at 0, or a weapon is not', () => {
    expect(SR5ShopCatalog.pricedOnWeapon(accessory(0, 500))).toBe(false)
    expect(SR5ShopCatalog.pricedOnWeapon(accessory(1, 500))).toBe(false)
    expect(SR5ShopCatalog.pricedOnWeapon(accessory(0, 0, 'trait'))).toBe(false)
    expect(SR5ShopCatalog.pricedOnWeapon({
      type: 'itemWeapon', system: {
        category: 'rangedWeapon', price: {
          base: 0
        }, weaponAccessory: {
          priceMultiplier: 1
        }
      }
    })).toBe(false)
    expect(SR5ShopCatalog.weaponPriceMultiplier(accessory(0, 500))).toBe(0)
  })
  it('the shop index and the kept essentials carry the multiplier', () => {
    expect(SR5ShopCatalog.INDEX_FIELDS).toContain('system.weaponAccessory.priceMultiplier')
    const kept = {
      type: 'itemWeapon', system: SR5ShopCatalog.essentials(accessory(2).system)
    }
    expect(SR5ShopCatalog.pricedOnWeapon(kept)).toBe(true)
    expect(SR5ShopCatalog.essentials(accessory(0, 500).system).weaponAccessory).toBeUndefined()
  })
  it('the book prices of the catalogue: long barrel the weapon once, internal smartgun once (doubles the weapon)', () => {
    expect(WEAPON_ACCESSORY_CATALOG.longbarrel.priceMultiplier).toBe(1)
    expect(WEAPON_ACCESSORY_CATALOG.smartgunSystemInternal.priceMultiplier).toBe(1)
    expect(WEAPON_ACCESSORY_CATALOG.ceramicPlasteelCompo4.priceMultiplier).toBe(4)
  })
  it('on a vintage weapon an accessory costs twice, a trait nothing more (RG p. 73)', () => {
    expect(vintageAccessoryPrice(1000, 'modification', true)).toBe(2000)
    expect(vintageAccessoryPrice(0, 'trait', true)).toBe(0)
  })
})
