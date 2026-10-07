import {
  describe, it, expect
} from 'vitest'
import {
  usesModPoints, attributeChange, modPointsDemand, modPointsOf, modPointsUsage, modPointsRefusal, modPointsPrice,
  armorOverload, attributeCap
} from '../modules/system/drone-mod-points.js'
import {
  dealerPointsGauge, buildPointsRefusal
} from '../modules/system/vehicle-dealership.js'

// An attribute upgrade as the Mégapack writes it: +1 per rating on the attribute and its off-road twin
const upgrade = (key, rating, extra = {
}) => ({
  system: {
    itemRating: rating, isActive: true, slots: {
      value: 14
    }, customEffects: {
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
// A drone mod of the Mégapack: its points are in its slots (Amphibie, the arm)
const pointsMod = points => ({
  system: {
    isActive: true, slots: {
      value: points
    }
  }
})
const drone = {
  body: 3, modPoints: null, attributes: {
    handling: 3, speed: 3, acceleration: 1, armor: 3, sensor: 3
  }
}

describe('Modification Points setting (Rigger 5.0 p. 126)', () => {
  it('applies to drones only, and only when the world chooses them', () => {
    expect(usesModPoints('modPoints', 'drone')).toBe(true)
    expect(usesModPoints('modPoints', 'vehicle')).toBe(false)
    expect(usesModPoints('slots', 'drone')).toBe(false)
  })
})

describe('What a mod asks (R5 p. 127)', () => {
  it('reads the attribute and the amount from the effects, the off-road twin not counted again', () => {
    expect(attributeChange(upgrade('speed', 2))).toEqual({
      key: 'speed', amount: 2
    })
  })
  it('a "rating" effect is worth the rating once prepared (its value then holds the rating, not a factor)', () => {
    const prepared = upgrade('speed', 2)
    prepared.system.customEffects[0].value = 2
    expect(attributeChange(prepared)).toEqual({
      key: 'speed', amount: 2
    })
  })
  it('+2 Speed costs 1 point, +4 costs 3', () => {
    expect(modPointsOf(upgrade('speed', 2))).toBe(1)
    expect(modPointsOf(upgrade('speed', 4))).toBe(3)
    expect(modPointsOf(upgrade('speed', 1))).toBe(0)
  })
  it('counts Armor by steps of 3', () => {
    expect(modPointsDemand(upgrade('armor', 3))).toEqual({
      kind: 'upgrade', key: 'armor', steps: 1
    })
    expect(modPointsOf(upgrade('armor', 6))).toBe(1)
  })
  it('takes a drone mod at its points, ignoring the vehicle slots of an attribute upgrade', () => {
    expect(modPointsOf(pointsMod(2))).toBe(2)
  })
})

describe('The drone\'s points (R5 p. 126-127)', () => {
  it('a drone has its Structure in points, Y when the gamemaster wrote it', () => {
    expect(modPointsUsage(drone, []).total).toBe(3)
    expect(modPointsUsage({
      ...drone, modPoints: 1
    }, []).total).toBe(1)
  })
  it('one free +1 per drone, not per attribute', () => {
    expect(modPointsUsage(drone, [upgrade('speed', 2)]).used).toBe(1)
    expect(modPointsUsage(drone, [upgrade('speed', 2), upgrade('handling', 2)]).used).toBe(3)
  })
  it('the downgrades give back one point at most', () => {
    expect(modPointsUsage(drone, [lowered('sensor', 1), lowered('handling', 1)]).total).toBe(4)
  })
  it('lowering the Structure by 1 is a net gain of 1, never below half of it', () => {
    expect(modPointsUsage(drone, [lowered('body', 1)]).total).toBe(4)
    expect(modPointsUsage(drone, [lowered('body', 3)]).total).toBe(5)
  })
})

describe('Refusal (R5 p. 126-127)', () => {
  it('refuses a mod beyond the points left, with what it needs and what is left', () => {
    const fitted = [pointsMod(2)]
    expect(modPointsRefusal(drone, fitted, null, upgrade('speed', 2))).toBe(null)
    expect(modPointsRefusal(drone, fitted, null, pointsMod(2))).toEqual({
      needed: 2, free: 1
    })
  })
  it('never refuses a change that asks no more, even on a drone already over', () => {
    const over = pointsMod(5)
    expect(modPointsRefusal(drone, [over], over, pointsMod(4))).toBe(null)
  })
  it('refuses an attribute beyond twice its starting value, Armor aside', () => {
    expect(modPointsRefusal({
      ...drone, body: 9
    }, [], null, upgrade('handling', 4))).toEqual({
      attribute: 'handling', cap: 6
    })
    expect(modPointsRefusal({
      ...drone, body: 9
    }, [], null, upgrade('armor', 6))).toBe(null)
  })
  it('a starting 0 counts as 0.5', () => {
    expect(attributeCap(0)).toBe(1)
  })
})

describe('Price (R5 p. 127-128)', () => {
  it('Speed: new value × Structure × 2 × 200', () => {
    expect(modPointsPrice(upgrade('speed', 2), {
      ...drone, body: 2, attributes: {
        speed: 3
      }
    })).toBe(4000)
  })
  it('Handling: new value × Structure × 200; Sensor: new value × 1000', () => {
    expect(modPointsPrice(upgrade('handling', 2), {
      body: 2, attributes: {
        handling: 3
      }
    })).toBe(2000)
    expect(modPointsPrice(upgrade('sensor', 1), {
      body: 2, attributes: {
        sensor: 3
      }
    })).toBe(4000)
  })
  it('a mod that is no attribute upgrade keeps its own price', () => {
    expect(modPointsPrice(pointsMod(1), drone)).toBe(null)
  })
})

describe('Armor beyond 3 × Structure (R5 p. 127-128)', () => {
  it('-1 Handling and Speed every 3 points, -1 Acceleration every 6', () => {
    expect(armorOverload(9, 3)).toEqual({
      handling: 0, speed: 0, acceleration: 0
    })
    expect(armorOverload(15, 3)).toEqual({
      handling: -2, speed: -2, acceleration: -1
    })
  })
})

describe('Dealership under the points (R5 p. 126-128)', () => {
  it('one gauge: fitted points, then what the mods waiting to be installed will take', () => {
    const g = dealerPointsGauge(drone, [pointsMod(1), {
      ...upgrade('speed', 2), pending: true
    }])
    expect(g).toMatchObject({
      key: 'modPoints', used: 1, pending: 1, planned: 2, total: 3, over: false
    })
  })
  it('refuses the gamemaster\'s fitting beyond the points', () => {
    expect(buildPointsRefusal(drone, [pointsMod(3)], upgrade('speed', 2))).toEqual({
      needed: 1, free: 0
    })
  })
})
