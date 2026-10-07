import {
  describe, it, expect
} from 'vitest'
import {
  actsAsRcc, rccRatings, sharedAutosofts, sharingSlotsLeft, hasLocalAutosoftRunning, droneUsesRccAutosofts,
  rccAutosoftsForDrone, autosoftFitsDrone, localAutosoftRating, droneAutopilot, programSwitchActionType, rccAutosoftRows
} from '../modules/entities/actors/rcc.js'

// Rigger command console (SR5 p. 269-272) and autosoft ratings (Rigger 5.0 p. 131): lot R4 of the rigging plan.

const autosoft = (id, {
  active = true, shared = true, rating = 4, model = '', isModelBased = false
} = {
}) => ({
  _id: id, name: id, type: 'itemProgram', system: {
    type: 'autosoft', isActive: active, isShared: shared, itemRating: rating, model, isModelBased
  }
})

const consoleSystem = (sharing, noiseReduction = 0, deviceRating = 4) => ({
  matrix: {
    deviceType: 'riggerCommandConsole', deviceRating, attributes: {
      sharing: {
        base: sharing
      }, noiseReduction: {
        base: noiseReduction
      }
    }
  }
})

const drone = (consoleItems, {
  sharing = 2, controlMode = 'autopilot', slaved = true, system = consoleSystem(sharing), pilot = 3
} = {
}) => ({
  controlMode, slaved, model: 'Steel Lynx',
  attributes: {
    pilot: {
      natural: {
        base: pilot
      }
    }
  },
  vehicleOwner: {
    id: 'rigger', system, items: consoleItems
  }
})

describe('who acts as a rigger command console', () => {
  it('an actor, or the copy of its system a drone carries', () => {
    expect(actsAsRcc({
      system: consoleSystem(1)
    })).toBe(true)
    expect(actsAsRcc(consoleSystem(1))).toBe(true)
  })
  it('a commlink or a deck does not', () => {
    expect(actsAsRcc({
      matrix: {
        deviceType: 'commlink'
      }
    })).toBe(false)
    expect(actsAsRcc(undefined)).toBe(false)
  })
})

describe('Noise Reduction and Sharing (SR5 p. 269)', () => {
  it('their total stays within the Device Rating, Noise Reduction kept first', () => {
    expect(rccRatings(2, 2, 4, true)).toEqual({
      noiseReduction: 2, sharing: 2
    })
    expect(rccRatings(3, 3, 4, true)).toEqual({
      noiseReduction: 3, sharing: 1
    })
    expect(rccRatings(6, 0, 4, true)).toEqual({
      noiseReduction: 4, sharing: 0
    })
  })
  it('off a console, neither counts', () => {
    expect(rccRatings(2, 2, 4, false)).toEqual({
      noiseReduction: 0, sharing: 0
    })
  })
})

describe('sharing: the chosen autosofts, up to the Sharing rating', () => {
  it('a console with Sharing 2 and three shared autosofts gives two', () => {
    const items = [autosoft('acuity'), autosoft('maneuvering'), autosoft('evasion')]
    expect(sharedAutosofts(items, 2).map(i => i._id)).toEqual(['acuity', 'maneuvering'])
  })
  it('an autosoft left unshared, or not running on the console, is not shared', () => {
    const items = [autosoft('acuity', {
      shared: false
    }), autosoft('maneuvering', {
      active: false
    }), autosoft('evasion')]
    expect(sharedAutosofts(items, 3).map(i => i._id)).toEqual(['evasion'])
  })
  it('a common program never is', () => {
    const items = [{
      _id: 'armor', type: 'itemProgram', system: {
        type: 'common', isActive: true, isShared: true
      }
    }]
    expect(sharedAutosofts(items, 2)).toEqual([])
  })
  it('the rigger may mark as many as the Sharing, running or not', () => {
    const items = [autosoft('acuity'), autosoft('evasion', {
      active: false
    }), autosoft('stealth', {
      shared: false
    })]
    expect(sharingSlotsLeft(items, 3)).toBe(1)
    expect(sharingSlotsLeft(items, 2)).toBe(0)
  })
})

describe('exclusion: a drone running its own autosoft does not use the console\'s (SR5 p. 269)', () => {
  const consoleItems = [autosoft('acuity'), autosoft('maneuvering')]
  it('a slaved drone on autopilot uses the shared autosofts', () => {
    expect(rccAutosoftsForDrone(drone(consoleItems), []).map(i => i._id)).toEqual(['acuity', 'maneuvering'])
  })
  it('one local autosoft running sets all of them aside', () => {
    const local = [autosoft('ownAcuity')]
    expect(hasLocalAutosoftRunning(local)).toBe(true)
    expect(rccAutosoftsForDrone(drone(consoleItems), local)).toEqual([])
  })
  it('a local autosoft switched off does not', () => {
    expect(rccAutosoftsForDrone(drone(consoleItems), [autosoft('ownAcuity', {
      active: false
    })])).toHaveLength(2)
  })
  it('nor a drone out of autopilot, unslaved, or under a commlink', () => {
    expect(droneUsesRccAutosofts(drone(consoleItems, {
      controlMode: 'rigging'
    }), [])).toBe(false)
    expect(droneUsesRccAutosofts(drone(consoleItems, {
      slaved: false
    }), [])).toBe(false)
    expect(droneUsesRccAutosofts(drone(consoleItems, {
      system: {
        matrix: {
          deviceType: 'commlink', deviceRating: 4
        }
      }
    }), [])).toBe(false)
  })
  it('the Sharing read on the console copy is kept within its Device Rating', () => {
    const items = [autosoft('a'), autosoft('b'), autosoft('c')]
    expect(rccAutosoftsForDrone(drone(items, {
      system: consoleSystem(3, 2, 3)
    }), [])).toHaveLength(1)
  })
  it('an autosoft [Model] works for its model only (SR5 p. 272)', () => {
    expect(autosoftFitsDrone({
      isModelBased: true, model: 'Steel Lynx'
    }, 'Steel Lynx')).toBe(true)
    expect(autosoftFitsDrone({
      isModelBased: true, model: 'Doberman'
    }, 'Steel Lynx')).toBe(false)
    expect(autosoftFitsDrone({
      isModelBased: false
    }, 'Steel Lynx')).toBe(true)
  })
})

describe('cap: an autopilot runs no autosoft above its rating (Rigger 5.0 p. 131)', () => {
  it('a local autosoft 6 on an autopilot 3 runs at 3', () => {
    expect(localAutosoftRating(6, 3)).toBe(3)
    expect(localAutosoftRating(2, 3)).toBe(2)
  })
  it('the autopilot is read from the source rating', () => {
    expect(droneAutopilot(drone([], {
      pilot: 3
    }))).toBe(3)
    expect(droneAutopilot({
    })).toBe(0)
  })
  it('the console shares at its full rating', () => {
    expect(rccAutosoftsForDrone(drone([autosoft('acuity', {
      rating: 6
    })], {
      pilot: 2
    }), [])[0].system.itemRating).toBe(6)
  })
})

describe('switching autosofts is a complex action (SR5 p. 272)', () => {
  const program = type => ({
    system: {
      type
    }
  })
  it('loading an autosoft, or any program on a drone', () => {
    expect(programSwitchActionType(program('autosoft'), 'actorPc', true)).toBe('complex')
    expect(programSwitchActionType(program('common'), 'actorDrone', true)).toBe('complex')
  })
  it('a deck program stays free, and unloading too', () => {
    expect(programSwitchActionType(program('common'), 'actorPc', true)).toBe('free')
    expect(programSwitchActionType(program('autosoft'), 'actorDrone', false)).toBe('free')
  })
})

describe('the rows of the drone sheet', () => {
  it('used, shared but idle, or not shared', () => {
    const items = [autosoft('acuity'), autosoft('maneuvering', {
      shared: false
    })]
    expect(rccAutosoftRows(drone(items), []).map(r => r.state)).toEqual(['used', 'notShared'])
    expect(rccAutosoftRows(drone(items), [autosoft('own')]).map(r => r.state)).toEqual(['idle', 'notShared'])
  })
  it('a third autosoft marked beyond Sharing 2 is shown as not shared', () => {
    const items = [autosoft('a'), autosoft('b'), autosoft('c')]
    expect(rccAutosoftRows(drone(items), []).map(r => r.state)).toEqual(['used', 'used', 'notShared'])
  })
  it('no console, no rows', () => {
    expect(rccAutosoftRows({
      vehicleOwner: {
        id: '', items: []
      }
    }, [])).toEqual([])
  })
})
