import {
  describe, it, expect
} from 'vitest'
import {
  existsSync
} from 'node:fs'
import {
  MOD_CATEGORIES, slotGauges, modsByCategory, modCost, workshopCost, toolsModifier, installPlan, installOutcome, workshopImage
} from '../modules/system/vehicle-workshop.js'

const mod = (type, slots, extra = {
}) => ({
  name: `${type}-${slots}`, system: {
    type, slots: {
      value: slots
    }, isActive: true, price: {
      value: 1000
    }, ...extra
  }
})
const capacity = Object.fromEntries(MOD_CATEGORIES.map(k => [k, 4]))

describe('Workshop slots (Rigger 5.0 p. 153-154)', () => {
  it('counts the fitted mods, not those waiting to be installed nor the factory ones (R5 p. 191)', () => {
    const gauges = slotGauges(capacity, [
      mod('powerTrain', 2), mod('powerTrain', 1, {
        isActive: false
      }), mod('powerTrain', 1, {
        isActive: true, isFactory: true
      }),
    ])
    const powerTrain = gauges.find(g => g.key === 'powerTrain')
    expect(powerTrain).toMatchObject({
      used: 2, total: 4, free: 2, full: false, over: false, percent: 50
    })
  })

  it('shows a full category, and one over its slots', () => {
    const gauges = slotGauges(capacity, [mod('weapons', 4), mod('body', 5)])
    expect(gauges.find(g => g.key === 'weapons')).toMatchObject({
      full: true, over: false, percent: 100
    })
    expect(gauges.find(g => g.key === 'body')).toMatchObject({
      full: true, over: true, free: 0, percent: 100
    })
  })

  it('keeps the six categories in the book order', () => {
    expect(slotGauges(capacity, []).map(g => g.key)).toEqual(['powerTrain', 'protection', 'weapons', 'body', 'electromagnetic', 'cosmetic'])
  })
})

describe('Mods by category', () => {
  it('sorts the mods, a mod without a category last', () => {
    const groups = modsByCategory([mod('cosmetic', 1), mod('', 1), mod('powerTrain', 1)])
    expect(groups.map(g => g.key)).toEqual([...MOD_CATEGORIES, ''])
    expect(groups[0].mods).toHaveLength(1)
    expect(groups.at(-1).mods).toHaveLength(1)
  })

  it('has no "other" group when every mod has a category', () => {
    expect(modsByCategory([mod('body', 1)])).toHaveLength(6)
  })
})

describe('Workshop cost (Q6 and Q8 of DjamZ)', () => {
  it('adds the mods to the bare vehicle, the factory ones at 0', () => {
    expect(workshopCost(20000, [mod('body', 1), mod('body', 1, {
      isFactory: true
    })])).toEqual({
      vehicle: 20000, mods: 1000, total: 21000
    })
  })

  it('keeps a factory mod taken off free', () => {
    expect(modCost({
      ...mod('body', 1, {
        isActive: false
      }), flags: {
        sr5: {
          wasFactory: true
        }
      }
    })).toBe(0)
  })
})

describe('Tools (Rigger 5.0 p. 153, SR5 p. 148)', () => {
  it('asks nothing when the tools are enough', () => {
    expect(toolsModifier('shop', 'shop').value).toBe(0)
    expect(toolsModifier('kit', 'facility').value).toBe(0)
    expect(toolsModifier('', 'none').value).toBe(0)
  })

  it('takes -2 for lighter tools and -4 without any', () => {
    expect(toolsModifier('facility', 'kit')).toEqual({
      key: 'inadequate', value: -2
    })
    expect(toolsModifier('kit', 'none')).toEqual({
      key: 'unavailable', value: -4
    })
  })
})

describe('Install and removal (Rigger 5.0 p. 153-154)', () => {
  it('installs at the threshold of the mod, 1 hour', () => {
    expect(installPlan({
      threshold: 28
    })).toEqual({
      threshold: 28, interval: 'hour', multiplier: 1
    })
  })

  it('removes at half the threshold, rounded up (SR5 p. 50)', () => {
    expect(installPlan({
      threshold: 7, removal: true
    }).threshold).toBe(4)
    expect(installPlan({
      threshold: 1, removal: true
    }).threshold).toBe(1)
  })

  it('loses the parts on a critical glitch of the install, not of the removal', () => {
    expect(installOutcome({
      hits: 9, threshold: 28, criticalGlitch: true
    })).toBe('partsLost')
    expect(installOutcome({
      hits: 9, threshold: 28, criticalGlitch: true, removal: true
    })).toBe('failed')
  })

  it('is done at the threshold, goes on while the pool lasts, else is unfinished', () => {
    expect(installOutcome({
      hits: 28, threshold: 28, stillExtended: true
    })).toBe('done')
    expect(installOutcome({
      hits: 12, threshold: 28, stillExtended: true
    })).toBe('ongoing')
    expect(installOutcome({
      hits: 12, threshold: 28, stillExtended: false
    })).toBe('unfinished')
  })
})

describe('Workshop picture (Q9 of DjamZ)', () => {
  it('shows the vehicle, else the picture of its category', () => {
    expect(workshopImage('worlds/x/bulldog.webp', {
      type: 'vehicle', category: 'truck'
    })).toBe('worlds/x/bulldog.webp')
    expect(workshopImage('', {
      category: 'car'
    })).toBe('systems/sr5/assets/img/vehicles/car.webp')
    expect(workshopImage(null, {
      category: 'minidrone'
    })).toBe('systems/sr5/assets/img/vehicles/minidrone.webp')
    // The system's default icons are no picture of the vehicle's own
    expect(workshopImage('systems/sr5/assets/img/items/itemVehicle.svg', {
      type: 'vehicle', category: 'bike'
    })).toBe('systems/sr5/assets/img/vehicles/bike.webp')
    expect(workshopImage('systems/sr5/assets/img/actors/actorDrone.svg', {
      type: 'drone', category: 'hugeDrone'
    })).toBe('systems/sr5/assets/img/vehicles/hugeDrone.webp')
    expect(workshopImage('', {
      category: 'submarine'
    })).toBe('systems/sr5/assets/img/vehicles/submarine.webp')
    expect(workshopImage(null, {
      type: 'vehicle', category: 'lta'
    })).toBe('systems/sr5/assets/img/vehicles/lta.webp')
  })

  it('falls back on the drone or vehicle icon without a known category', () => {
    expect(workshopImage('systems/sr5/assets/img/items/itemDrone.svg', {
      type: 'drone'
    })).toBe('systems/sr5/assets/img/items/itemDrone.svg')
    expect(workshopImage('', {
      type: 'vehicle', category: 'hovercraft'
    })).toBe('systems/sr5/assets/img/items/itemVehicle.svg')
  })

  it('has a picture on disk for every category of the system', () => {
    const categories = ['microdrone', 'minidrone', 'smallDrone', 'mediumDrone', 'largeDrone', 'hugeDrone', 'bike',
      'car', 'truck', 'boat', 'submarine', 'rotorCraft', 'vectorThrustCraft', 'fixedWingAircraft', 'lta']
    for (const category of categories) {
      const path = workshopImage('', {
        category
      })
      expect(path).toMatch(/^systems\/sr5\/assets\/img\/vehicles\//)
      expect(existsSync(path.replace('systems/sr5/', ''))).toBe(true)
    }
  })
})
