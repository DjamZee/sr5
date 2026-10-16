import {
  describe, it, expect
} from 'vitest'
import {
  mechanicSkillFor, repairState, repairPlan, partsCost, nanomaintenanceRating, repairedMonitor
} from '../modules/system/vehicle-repair.js'

describe('Mechanic skill of a vehicle (SR5 p. 146-147)', () => {
  it('reads the category of a vehicle', () => {
    expect(mechanicSkillFor({
      category: 'rotorCraft'
    })).toBe('aeronauticsMechanic')
    expect(mechanicSkillFor({
      category: 'submarine'
    })).toBe('nauticalMechanic')
    expect(mechanicSkillFor({
      category: 'bike'
    })).toBe('automotiveMechanic')
  })
  it('reads the pilot skill of a drone, which is sized, not typed', () => {
    expect(mechanicSkillFor({
      category: 'smallDrone', pilotSkill: 'pilotAircraft'
    })).toBe('aeronauticsMechanic')
    expect(mechanicSkillFor({
      category: 'mediumDrone', pilotSkill: 'pilotWalker'
    })).toBe('automotiveMechanic')
  })
  it('falls back on Automotive Mechanic', () => {
    expect(mechanicSkillFor({
      category: 'minidrone'
    })).toBe('automotiveMechanic')
    expect(mechanicSkillFor(undefined)).toBe('automotiveMechanic')
  })
})

describe('Repair state (R5 p. 33)', () => {
  it('a damaged vehicle can be repaired', () => {
    expect(repairState({
      value: 10, actual: {
        value: 4
      }
    })).toEqual({
      damage: 4, wrecked: false, repairable: true
    })
  })
  it('a full monitor is wrecked, no repair test', () => {
    expect(repairState({
      value: 10, actual: {
        value: 10
      }
    })).toMatchObject({
      wrecked: true, repairable: false
    })
  })
  it('nothing to repair on an intact vehicle', () => {
    expect(repairState({
      value: 10, actual: {
        value: 0
      }
    }).repairable).toBe(false)
  })
})

describe('Repair plan (R5 p. 34, p. 167)', () => {
  it('with every part: threshold = boxes, 4 hours', () => {
    expect(repairPlan({
      boxes: 4
    })).toEqual({
      threshold: 4, missingParts: 0, interval: 'hour', multiplier: 4, partsModifier: 0, nanoModifier: 0
    })
  })
  it('parts missing: one day, -4 per missing box', () => {
    expect(repairPlan({
      boxes: 4, missingParts: 2
    })).toMatchObject({
      interval: 'day', multiplier: 1, partsModifier: -8
    })
  })
  it('never more missing boxes than boxes to repair', () => {
    expect(repairPlan({
      boxes: 2, missingParts: 5
    }).partsModifier).toBe(-8)
  })
  it('assisted nanomaintenance adds its rating', () => {
    expect(repairPlan({
      boxes: 3, nanoAssist: 3
    }).nanoModifier).toBe(3)
  })
  it('parts cost 5 % of the price per box', () => {
    expect(partsCost(20000, 4)).toBe(4000)
  })
})

describe('Nanomaintenance rating (R5 p. 167)', () => {
  const mod = (name, system) => ({
    type: 'itemVehicleMod', name, system: {
      isActive: true, itemRating: 1, systemEffects: [], ...system
    }
  })
  it('reads the system effect of an active mod', () => {
    expect(nanomaintenanceRating([mod('Ruche', {
      itemRating: 3, systemEffects: [{
        category: 'specialCase', value: 'nanomaintenance'
      }]
    })])).toBe(3)
  })
  it('reads a mod named after it', () => {
    expect(nanomaintenanceRating([mod('Système de nanomaintenance', {
      itemRating: 2
    })])).toBe(2)
  })
  it('ignores an inactive mod and other items', () => {
    expect(nanomaintenanceRating([mod('Nanomaintenance', {
      isActive: false, itemRating: 4
    }), {
      type: 'itemGear', name: 'Nanomaintenance', system: {
        itemRating: 4
      }
    }])).toBe(0)
  })
  it('caps the rating at 4', () => {
    expect(nanomaintenanceRating([mod('Nanomaintenance', {
      itemRating: 6
    })])).toBe(4)
  })
})

describe('Repaired monitor', () => {
  it('takes the boxes off the base', () => {
    expect(repairedMonitor({
      actual: {
        base: 4
      }
    }, 3)).toEqual({
      base: 1, repaired: 3
    })
  })
  it('never below 0, aggravated marks follow', () => {
    expect(repairedMonitor({
      actual: {
        base: 2
      }, aggravated: 2
    }, 5)).toEqual({
      base: 0, repaired: 2, aggravated: 0
    })
  })
})
