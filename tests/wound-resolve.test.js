import {
  describe, it, expect
} from 'vitest'
import {
  woundBoxes, hasWoundResolve, ledgerWithFighters, atPhaseStart, afterTest, ignoresWounds, ledgerWithoutCombat
} from '../modules/system/wound-resolve-rules.js'

// Deus vult ! / Mon pays, qu'il ait tort ou raison (Manuel de l'assassin p. 14-15)

const monitors = (physical, stun) => ({
  conditionMonitors: {
    physical: {
      actual: {
        value: physical
      }
    }, stun: {
      actual: {
        value: stun
      }
    }
  }
})
const quality = (isActive = true) => ({
  type: 'itemQuality', system: {
    isActive, systemEffects: [{
      category: 'specialCase', value: 'woundResolve'
    }]
  }
})

describe('who has it, and the boxes counted', () => {
  it('an active quality with the effect', () => {
    expect(hasWoundResolve([quality()])).toBe(true)
    expect(hasWoundResolve([quality(false)])).toBe(false)
    expect(hasWoundResolve([{
      system: {
        systemEffects: {
          0: {
            value: 'woundResolve'
          }
        }
      }
    }])).toBe(true)
    expect(hasWoundResolve([])).toBe(false)
  })
  it('« dommages physiques ou étourdissants » : both monitors, or the grunt\'s one', () => {
    expect(woundBoxes(monitors(2, 3))).toBe(5)
    expect(woundBoxes({
      conditionMonitors: {
        condition: {
          actual: {
            value: 4
          }
        }
      }
    })).toBe(4)
  })
})

describe('the test at the start of the action phase', () => {
  const start = ledgerWithFighters({
  }, [{
    uuid: 'A', boxes: 1
  }], 'c1')
  it('the wounds before the combat call for no test', () => {
    expect(start.A).toMatchObject({
      combatId: 'c1', boxes: 1, threshold: 0
    })
    expect(atPhaseStart(start.A, 1, 'c1').threshold).toBeNull()
    expect(ledgerWithFighters(start, [{
      uuid: 'A', boxes: 5
    }], 'c1')).toBeNull()
  })
  it('the book\'s example: 2 boxes, a success, 2 more: threshold 4', () => {
    let phase = atPhaseStart(start.A, 3, 'c1')
    expect(phase.threshold).toBe(2)
    let entry = afterTest(phase.entry, true)
    expect(ignoresWounds(entry)).toBe(true)
    phase = atPhaseStart(entry, 5, 'c1')
    expect(phase.threshold).toBe(4)
  })
  it('« continue d\'effectuer un test avant chaque phase » : holding, a test even without a new box', () => {
    const entry = afterTest(atPhaseStart(start.A, 3, 'c1').entry, true)
    expect(atPhaseStart(entry, 3, 'c1').threshold).toBe(2)
  })
  it('a failure: the modifiers apply, and no more test before the next combat', () => {
    const entry = afterTest(atPhaseStart(start.A, 3, 'c1').entry, false)
    expect(ignoresWounds(entry)).toBe(false)
    expect(atPhaseStart(entry, 6, 'c1').threshold).toBeNull()
    expect(atPhaseStart(entry, 6, 'c2').entry).toMatchObject({
      combatId: 'c2', broken: false, boxes: 6
    })
  })
  it('healed boxes are no wound', () => {
    expect(atPhaseStart(start.A, 0, 'c1')).toMatchObject({
      threshold: null, entry: {
        boxes: 0
      }
    })
  })
  it('the combat over, its entries go', () => {
    expect(ledgerWithoutCombat(start, 'c1')).toEqual({
    })
    expect(ledgerWithoutCombat(start, 'c2')).toBeNull()
  })
})
