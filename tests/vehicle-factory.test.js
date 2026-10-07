import {
  describe, it, expect
} from 'vitest'
import {
  carriedGear, isFactoryMod, modTakesSlots, factorySkipsEffect
} from '../modules/system/vehicle-factory.js'

describe('Factory equipment of a vehicle (Rigger 5.0 p. 154-156)', () => {
  it('reads the box of the sheet or the Mégapack flag', () => {
    expect(isFactoryMod({
      system: {
        isFactory: true
      }
    })).toBe(true)
    expect(isFactoryMod({
      system: {
        isFactory: false
      }, flags: {
        sr5: {
          isFactory: true
        }
      }
    })).toBe(true)
    expect(isFactoryMod({
      system: {
        isFactory: false
      }
    })).toBe(false)
    expect(isFactoryMod(undefined)).toBe(false)
  })
  it('a factory mod takes up its slots, even switched off', () => {
    expect(modTakesSlots({
      isActive: false
    }, true)).toBe(true)
    expect(modTakesSlots({
      isActive: true
    }, true)).toBe(true)
  })
  it('a mod bought afterwards takes up its slots while it is fitted', () => {
    expect(modTakesSlots({
      isActive: true
    }, false)).toBe(true)
    expect(modTakesSlots({
      isActive: false
    }, false)).toBe(false)
  })
  it('the effect of a factory mod on a printed attribute is never applied twice: the profile carries it', () => {
    expect(factorySkipsEffect(true, {
      target: 'system.attributes.handlingOffRoad'
    })).toBe(true)
    expect(factorySkipsEffect(false, {
      target: 'system.attributes.handlingOffRoad'
    })).toBe(false)
  })
  it('what the profile does not print still applies, a drone arm\'s box (R5 p. 129)', () => {
    expect(factorySkipsEffect(true, {
      target: 'system.conditionMonitors.condition'
    })).toBe(false)
    expect(factorySkipsEffect(true, {
    })).toBe(false)
  })
})
describe('Vehicle equipment (Rigger 5.0 p. 154-156)', () => {
  it('the gear carried aboard goes with the drone, never its mods nor weapons', () => {
    const items = [{
      type: 'itemGear', name: 'Scanner'
    }, {
      type: 'itemVehicleMod', name: 'Blindage'
    }, {
      type: 'itemWeapon', name: 'Ares Alpha'
    }, {
      type: 'itemGear', name: 'Kit de mécanique'
    }]
    expect(carriedGear(items).map(i => i.name)).toEqual(['Scanner', 'Kit de mécanique'])
    expect(carriedGear(undefined)).toEqual([])
  })
})
