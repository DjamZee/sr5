import {
  describe, it, expect
} from 'vitest'
import {
  SR5ShopCatalog
} from '../modules/interface/shop-catalog.js'

// C7c (Adrore, 08/10): the workshop's shop button opens on the vehicle mods, which have no price off a vehicle
// (Rigger 5.0 p. 156) and are bought on the workshop, never in the cart
const mod = (value, base) => ({
  type: 'itemVehicleMod', system: {
    price: {
      value, base
    }
  }
})

describe('vehicle mods in the shop', () => {
  it('a mod with a list price and no price off a vehicle is priced on the vehicle', () => {
    expect(SR5ShopCatalog.pricedOnVehicle(mod(0, 4000))).toBe(true)
  })
  it('a mod already priced, a mod with no price at all, or another item is not', () => {
    expect(SR5ShopCatalog.pricedOnVehicle(mod(500, 500))).toBe(false)
    expect(SR5ShopCatalog.pricedOnVehicle(mod(0, 0))).toBe(false)
    expect(SR5ShopCatalog.pricedOnVehicle({
      type: 'itemGear', system: {
        price: {
          value: 0, base: 100
        }
      }
    })).toBe(false)
  })
  it('the vehicles shelf splits the vehicles from their mods', () => {
    expect(SR5ShopCatalog.subOf(mod(0, 1000))).toBe('itemVehicleMod')
    expect(SR5ShopCatalog.subOf({
      type: 'itemVehicle', system: {
      }
    })).toBe('itemVehicle')
  })
})
