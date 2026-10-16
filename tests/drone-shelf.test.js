import {
  describe, expect, it
} from 'vitest'
import {
  isDroneEntry, isDroneMod
} from '../modules/system/drone-shelf.js'
import {
  SR5ShopCatalog
} from '../modules/interface/shop-catalog.js'
import {
  shopSettings
} from '../modules/interface/shop-vendor-rules.js'
import {
  templateShop, vendorTemplate
} from '../modules/interface/shop-vendor-templates.js'

const mod = (page, source = 'rigger5') => ({
  type: 'itemVehicleMod', system: {
    source, page
  }
})
const model = (type, category) => ({
  type: 'itemVehicle', system: {
    type, category
  }
})

// Relecture djamz.13, lot R6: drones and vehicles on two shelves, their mods with them
describe('the Drones shelf', () => {
  it('a drone mod is one of the chapter "Modification de drone" (Rigger 5.0 p. 126-132)', () => {
    expect(isDroneMod(mod('129').system)).toBe(true)
    expect(isDroneMod(mod(130).system)).toBe(true)
    expect(isDroneMod(mod('156').system)).toBe(false)
    expect(isDroneMod(mod('129', 'stolenSouls').system)).toBe(false)
  })

  it('drones and their mods go to Drones, vehicles and theirs to Vehicles', () => {
    expect(SR5ShopCatalog.shelfOf(model('drone', 'smallDrone'))).toBe('drones')
    expect(SR5ShopCatalog.shelfOf(model('', 'minidrone'))).toBe('drones')
    expect(SR5ShopCatalog.shelfOf(model('vehicle', 'car'))).toBe('vehicles')
    expect(SR5ShopCatalog.shelfOf(mod('130'))).toBe('drones')
    expect(SR5ShopCatalog.shelfOf(mod('163'))).toBe('vehicles')
    expect(isDroneEntry({
      type: 'itemGear'
    })).toBe(false)
  })

  it('the index carries the book and page that tell a drone mod', () => {
    expect(SR5ShopCatalog.INDEX_FIELDS).toEqual(expect.arrayContaining(['system.source', 'system.page']))
  })

  it('the index keeps the multiplier of a mod priced on its vehicle, for « base × Structure »', () => {
    expect(SR5ShopCatalog.essentials({
      price: {
        base: 1000, value: 0, multiplier: 'body'
      }
    }).price).toEqual({
      base: 1000, value: 0, multiplier: 'body'
    })
    expect(SR5ShopCatalog.essentials({
      price: {
        base: 50, value: 50
      }
    }).price).toEqual({
      base: 50, value: 50
    })
  })

  it('a shop set before still sells its drones on its vehicles shelf', () => {
    const old = {
      system: {
        shop: {
          shelves: ['vehicles']
        }
      }
    }
    expect(shopSettings(old).shelves).toEqual(['vehicles', 'drones'])
    const split = {
      system: {
        shop: {
          shelves: ['vehicles'], dronesApart: true
        }
      }
    }
    expect(shopSettings(split).shelves).toEqual(['vehicles'])
  })

  it('the drone dealer sells drones, the car dealers vehicles', () => {
    expect(templateShop(vendorTemplate('droneDealer'))).toMatchObject({
      shelves: ['drones'], dronesApart: true
    })
    expect(templateShop(vendorTemplate('ordinaryCars')).shelves).toEqual(['vehicles'])
  })
})
