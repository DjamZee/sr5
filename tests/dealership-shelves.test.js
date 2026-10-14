import {
  describe, it, expect
} from 'vitest'
import {
  dealerShelf, vehicleShowcase, modifiedShowcase, isDroneModel
} from '../modules/system/vehicle-dealership.js'

// The showroom of the dealership (Adrore's feedback C8): vehicles and drones apart, sorted by category then name,
// each model with its figures
const model = (name, type, category, attributes = {
}) => ({
  name, system: {
    type, category, attributes, seating: 2
  }
})

describe('dealership shelves', () => {
  const rows = [
    model('Zeta', 'vehicle', 'car'), model('Alpha', 'vehicle', 'car'), model('Harley', 'vehicle', 'bike'),
    model('Doberman', 'drone', 'mediumDrone'), model('Fly-Spy', 'drone', 'microdrone'),
    model('Old', 'vehicle', ''), model('Untyped drone', '', 'minidrone'),
  ]

  it('tells a drone by its type, or by a drone category when the type is missing', () => {
    expect(isDroneModel({
      type: 'drone'
    })).toBe(true)
    expect(isDroneModel({
      type: '', category: 'minidrone'
    })).toBe(true)
    expect(isDroneModel({
      type: 'vehicle', category: 'car'
    })).toBe(false)
  })

  it('keeps the vehicles shelf to vehicles, by category in order, then by name, unknown category last', () => {
    const shelf = dealerShelf(rows, 'vehicles')
    expect(shelf.map(g => g.key)).toEqual(['bike', 'car', ''])
    expect(shelf[1].rows.map(r => r.name)).toEqual(['Alpha', 'Zeta'])
  })

  it('puts the drones from the smallest', () => {
    expect(dealerShelf(rows, 'drones').map(g => [g.key, g.rows.map(r => r.name)])).toEqual([
      ['microdrone', ['Fly-Spy']], ['minidrone', ['Untyped drone']], ['mediumDrone', ['Doberman']],
    ])
  })
})

describe('vehicle showcase', () => {
  it('prints the off-road value after the on-road one only when it differs', () => {
    const stats = vehicleShowcase({
      attributes: {
        handling: 4, handlingOffRoad: 3, acceleration: 2, accelerationOffRoad: 2, speed: 4, speedOffRoad: 0,
        pilot: 1, body: 10, armor: 6, sensor: 2
      }, seating: 4
    })
    expect(Object.fromEntries(stats.map(s => [s.key, s.value]))).toEqual({
      handling: '4/3', acceleration: '2', speed: '4', pilot: '1', body: '10', armor: '6', sensor: '2', seating: '4'
    })
  })

  // Lot 35 (DjamZ 14/10): the figures once the mods are fitted, the printed ones beside
  const mod = (effects, extra = {
  }) => ({
    name: 'mod', system: {
      isActive: true, itemRating: 3, customEffects: effects, ...extra
    }
  })
  const value = (target, v) => ({
    target, type: 'value', value: v
  })
  const vehicle = {
    attributes: {
      handling: 4, speed: 3, acceleration: 1, pilot: 2, body: 8, armor: 6, sensor: 2
    }, seating: 1
  }
  const read = rows => Object.fromEntries(rows.map(s => [s.key, [s.value, s.base, s.changed]]))

  it('adds the effects of the mods fitted, never of the factory ones nor of those waiting to be installed', () => {
    const rows = read(modifiedShowcase(vehicle, [
      mod([value('system.attributes.armor.augmented', 3)]),
      mod([value('system.attributes.speed.augmented', 1)], {
        isActive: false
      }),
      mod([value('system.attributes.handling.augmented', 1)], {
        isFactory: true
      }),
      mod([{
        target: 'system.attributes.body.augmented', type: 'rating'
      }]),
    ]))
    expect(rows.armor).toEqual(['9', '6', true])
    expect(rows.body).toEqual(['11', '8', true])
    expect(rows.speed).toEqual(['3', '3', false])
    expect(rows.handling).toEqual(['4', '4', false])
  })

  it('lets a replacement stand in for the Pilot, and counts a wireless bonus only with the wireless on', () => {
    const rows = read(modifiedShowcase(vehicle, [
      mod({
      }, {
        effectKind: 'autopilotReplacement', itemRating: 4
      }),
      mod([{
        ...value('system.attributes.sensor.augmented', 1), wifi: true
      }], {
        wirelessTurnedOn: false
      }),
    ]))
    expect(rows.pilot).toEqual(['4', '2', true])
    expect(rows.sensor).toEqual(['2', '2', false])
  })
})
