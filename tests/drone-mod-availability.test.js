import {
  describe, it, expect
} from 'vitest'
import {
  modPointsAvailability, droneCannotMove
} from '../modules/system/drone-mod-points.js'

// An attribute upgrade as the Mégapack writes it: +1 per rating on the attribute and its off-road twin
const upgrade = (key, rating, extra = {
}) => ({
  system: {
    itemRating: rating, isActive: true, customEffects: {
      0: {
        target: `system.attributes.${key}.augmented`, type: 'rating', value: 1
      },
      1: {
        target: `system.attributes.${key}OffRoad.augmented`, type: 'rating', value: 1
      },
    }, ...extra
  }
})
const lowered = (key, by) => ({
  system: {
    isActive: true, customEffects: {
      0: {
        target: `system.attributes.${key}.augmented`, type: 'value', value: -by
      }
    }
  }
})
const sensorReplacement = rating => ({
  name: 'Remplacement des Senseurs', type: 'itemVehicleMod', system: {
    itemRating: rating, isActive: true, customEffects: {
      0: {
        target: 'system.attributes.sensor.augmented', type: 'ratingReplace', value: 0
      }
    }
  }
})
const drone = {
  body: 3, modPoints: null, attributes: {
    handling: 3, speed: 3, acceleration: 1, armor: 3, sensor: 3
  }
}

describe('Availability of an attribute change (R5 p. 127-128)', () => {
  it('new value × 2 for Handling, Speed and Sensor, × 4 for Acceleration', () => {
    expect(modPointsAvailability(upgrade('handling', 2), drone)).toEqual({
      availability: 10, legality: ''
    })
    expect(modPointsAvailability(upgrade('speed', 1), drone)).toEqual({
      availability: 8, legality: ''
    })
    expect(modPointsAvailability(upgrade('acceleration', 1), drone)).toEqual({
      availability: 8, legality: ''
    })
  })
  it('a Sensor replacement is priced and found at its rating', () => {
    expect(modPointsAvailability(sensorReplacement(5), drone)).toEqual({
      availability: 10, legality: ''
    })
  })
  it('Armor: the new value, Restricted beyond 6 and Forbidden beyond 12', () => {
    expect(modPointsAvailability(upgrade('armor', 3), drone)).toEqual({
      availability: 6, legality: ''
    })
    expect(modPointsAvailability(upgrade('armor', 6), drone)).toEqual({
      availability: 9, legality: 'R'
    })
    expect(modPointsAvailability(upgrade('armor', 12), drone)).toEqual({
      availability: 15, legality: 'F'
    })
  })
  it('a lowered Structure: 2 points gained per point, × 3', () => {
    expect(modPointsAvailability(lowered('body', 1), drone)).toEqual({
      availability: 6, legality: ''
    })
  })
  it('keeps the mod\'s own legality, and leaves any other mod to its own availability', () => {
    expect(modPointsAvailability(upgrade('speed', 1, {
      legality: 'R'
    }), drone).legality).toBe('R')
    expect(modPointsAvailability({
      system: {
        isActive: true, slots: {
          value: 2
        }
      }
    }, drone)).toBeNull()
    expect(modPointsAvailability(lowered('speed', 1), drone)).toBeNull()
  })
})

describe('A drone that can no longer move (R5 p. 128)', () => {
  it('Handling below 1, or Speed or Acceleration below 0', () => {
    expect(droneCannotMove({
      handling: 1, speed: 0, acceleration: 0
    })).toBe(false)
    expect(droneCannotMove({
      handling: 0, speed: 3, acceleration: 1
    })).toBe(true)
    expect(droneCannotMove({
      handling: 2, speed: -1, acceleration: 1
    })).toBe(true)
    expect(droneCannotMove({
      handling: 2, speed: 2, acceleration: -1
    })).toBe(true)
  })
})
