import {
  describe, it, expect
} from 'vitest'
import {
  usesModPoints, attributeChange, modPointsDemand, modPointsUsage, modPointsRefusal, modPointsPrice,
  armorOverload, attributeCap, modPointsLines, weaponMountPoints, modsTakingPoints, modPointsCost, modPointsOnDrone
} from '../modules/system/drone-mod-points.js'

// The points of a mod alone on its drone, its line as the sheet shows it
const modPointsOf = (system, vehicle = null) => modPointsLines([system], undefined, vehicle)[0]
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

// R5 p. 191 (Body without (Y)), arbitrage de DjamZ du 08/10 replacing Q6: factory equipment is free
describe('Factory equipment takes no point', () => {
  it('a new Steel Lynx keeps its 6 points, its factory mount free', () => {
    const lynx = {
      body: 6, attributes: {
      }
    }
    const factoryMount = {
      system: {
        isActive: true, isFactory: true, isWeaponMounted: true, weaponMount: {
          size: 'heavy', visibility: 'external'
        }, slots: {
          value: 2
        }
      }
    }
    const bought = {
      system: {
        isActive: true, slots: {
          value: 2
        }
      }
    }
    expect(modsTakingPoints([factoryMount, bought])).toEqual([bought])
    expect(modPointsUsage(lynx, modsTakingPoints([factoryMount]).map(m => m.system))).toMatchObject({
      total: 6, used: 0, free: 6
    })
    expect(modPointsCost(factoryMount, lynx)).toBe(0)
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
  it('lowering the Structure by 1 is a net gain of 1, never below half of it rounded up', () => {
    expect(modPointsUsage(drone, [lowered('body', 1)]).total).toBe(4)
    // Structure 3: down to 2, "pas à 1 (car 1 < 1,5)" (R5 p. 127): 1 point at most
    expect(modPointsUsage(drone, [lowered('body', 2)]).total).toBe(4)
    expect(modPointsUsage(drone, [lowered('body', 3)]).total).toBe(4)
    // An even Structure goes down to its half: 4 to 2
    expect(modPointsUsage({
      ...drone, body: 4
    }, [lowered('body', 3)]).total).toBe(6)
  })
})

describe('The points on each line (review 40)', () => {
  it('the free +1 is taken once per drone: two +2 show 1 and 2, as the gauge counts 3', () => {
    const mods = [upgrade('speed', 2), upgrade('handling', 2), pointsMod(2), lowered('sensor', 1)]
    expect(modPointsLines(mods)).toEqual([1, 2, 2, 0])
    expect(modPointsUsage(drone, mods.slice(0, 2)).used).toBe(3)
  })
  it('the free +1 goes to an upgrade that takes its points, the one waiting to be installed shows its full steps', () => {
    const waiting = upgrade('speed', 2, {
      isActive: false
    })
    const fitted = upgrade('handling', 2)
    expect(modPointsLines([waiting, fitted], m => m.system.isActive)).toEqual([2, 1])
    // None fitted yet: the first upgrade of the list shows it
    expect(modPointsLines([waiting, upgrade('sensor', 2, {
      isActive: false
    })], m => m.system.isActive)).toEqual([1, 2])
    expect(modPointsLines(null)).toEqual([])
  })
  it('the pose window tells the cost of the line, the free +1 once per drone (lot 16b)', () => {
    // Speed +1 as if alone: 0 ; beside a fitted Handling upgrade that took the free +1: 1, as on its line
    expect(modPointsOf(upgrade('speed', 1))).toBe(0)
    expect(modPointsOnDrone([upgrade('handling', 1)], upgrade('speed', 1))).toBe(1)
    expect(modPointsOnDrone([], upgrade('speed', 1))).toBe(0)
    // A waiting upgrade does not take it: the mod being fitted does
    expect(modPointsOnDrone([upgrade('handling', 1, {
      isActive: false
    })], upgrade('speed', 2))).toBe(1)
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
  it('refuses a Structure below half its start, rounded up (R5 p. 127, Lancelot E4)', () => {
    // Structure 3: down to 2, not to 1
    expect(modPointsRefusal(drone, [], null, lowered('body', 1))).toBe(null)
    expect(modPointsRefusal(drone, [], null, lowered('body', 2))).toEqual({
      attribute: 'body', floor: 2
    })
    // Two lowerings add up; one already there and kept as it is stays allowed
    const first = lowered('body', 1)
    expect(modPointsRefusal(drone, [first], null, lowered('body', 1))).toEqual({
      attribute: 'body', floor: 2
    })
    const deep = lowered('body', 2)
    expect(modPointsRefusal(drone, [deep], deep, lowered('body', 2))).toBe(null)
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
  it('leaves the factory equipment out of the gauge and of the refusal (R5 p. 191)', () => {
    const factory = {
      system: {
        ...pointsMod(3).system, isFactory: true
      }
    }
    expect(dealerPointsGauge(drone, [factory, pointsMod(1)])).toMatchObject({
      used: 1, total: 3, over: false
    })
    expect(buildPointsRefusal(drone, [factory], pointsMod(2))).toBeNull()
  })
  it('refuses the gamemaster\'s fitting beyond the points', () => {
    expect(buildPointsRefusal(drone, [pointsMod(3)], upgrade('speed', 2))).toEqual({
      needed: 1, free: 0
    })
  })
})

// A weapon mount as utilityItem._handleWeaponMounted leaves it on a vehicle: its slots set by the vehicle size
const mount = (size, visibility = 'external', slots = 4) => ({
  system: {
    isActive: true, isWeaponMounted: true, weaponMount: {
      size, visibility, flexibility: 'turret', control: 'remote'
    }, slots: {
      value: slots
    }
  }
})

describe('Weapon mounts under the Modification Points (R5 p. 128)', () => {
  it('cost the drone table, not the vehicle slots', () => {
    expect(['micro', 'mini', 'small', 'standard', 'large', 'huge', 'heavy'].map(size => modPointsOf(mount(size))))
      .toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(modPointsOf(mount('heavy', 'external', 4))).toBe(6)
  })
  it('add 1 for a pop-up mount (internal or concealed), nothing for the flexibility or the control', () => {
    expect(modPointsOf(mount('standard', 'internal', 8))).toBe(4)
    expect(modPointsOf(mount('heavy', 'concealed', 12))).toBe(7)
  })
  it('read the vehicle light mount by the weapons it carries, as the Standard (arbitrage de DjamZ, 08/10)', () => {
    expect(weaponMountPoints(mount('light').system)).toBe(3)
  })
  it('leave a mount without a size, and any other mod, to its own slots', () => {
    expect(modPointsOf(mount('', 'external', 1))).toBe(1)
    expect(weaponMountPoints(pointsMod(2))).toBeNull()
    expect(modPointsUsage(drone, [mount('heavy'), pointsMod(1)]).used).toBe(7)
  })
})

// The Sensor replacement of the Mégapack (R5 p. 171): its slots are its rating, its effect a ratingReplace
const sensorReplacement = (rating, extra = {
}) => ({
  name: 'Remplacement des Senseurs', type: 'itemVehicleMod', system: {
    itemRating: rating, isActive: true, slots: {
      value: rating
    }, customEffects: {
      0: {
        target: 'system.attributes.sensor.augmented', type: 'ratingReplace', value: 0
      }
    }, ...extra
  }
})

describe('Sensor replacement under the Modification Points (R5 p. 128)', () => {
  it('is a raise of the Sensor to its rating, not its slots', () => {
    // Sensor 3 to 6: +3, 2 points on its own line, priced as the new Sensor × 1,000 ¥
    expect(modPointsDemand(sensorReplacement(6), drone)).toEqual({
      kind: 'upgrade', key: 'sensor', steps: 3
    })
    expect(modPointsOf(sensorReplacement(6), drone)).toBe(2)
    expect(modPointsPrice(sensorReplacement(6), drone)).toBe(6000)
  })
  it('takes the free +1 once per drone with the other upgrades', () => {
    expect(modPointsUsage(drone, [sensorReplacement(5), upgrade('speed', 1)]).used).toBe(2)
    expect(modPointsLines([sensorReplacement(5), upgrade('speed', 1)], () => true, drone)).toEqual([1, 1])
  })
  it('costs nothing when no higher than the drone Sensor', () => {
    expect(modPointsOf(sensorReplacement(3), drone)).toBe(0)
    expect(modPointsPrice(sensorReplacement(3), drone)).toBeNull()
  })
  it('is known by its name when it carries no effect', () => {
    expect(modPointsOf({
      ...sensorReplacement(5), system: {
        itemRating: 5, isActive: true, slots: {
          value: 5
        }
      }
    }, drone)).toBe(1)
  })
  it('leaves the Autopilot replacement free (arbitrage de DjamZ, 08/10), by its effect or its name', () => {
    const autopilot = sensorReplacement(5)
    autopilot.system.customEffects[0].target = 'system.attributes.pilot.augmented'
    expect(modPointsOf(autopilot, drone)).toBe(0)
    expect(modPointsOf({
      name: "Remplacement de l'Autopilote", system: {
        itemRating: 5, isActive: true, slots: {
          value: 5
        }
      }
    }, drone)).toBe(0)
    expect(modPointsUsage(drone, [autopilot]).used).toBe(0)
    expect(modPointsPrice(autopilot, drone)).toBeNull()
  })
  it('keeps the double cap of the Sensor (R5 p. 127)', () => {
    expect(modPointsRefusal({
      ...drone, body: 12
    }, [], null, sensorReplacement(7))).toEqual({
      attribute: 'sensor', cap: 6
    })
  })
})
