import {
  describe, it, expect
} from 'vitest'

import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'

// SR5 p. 164-165: one free action, and two simple or one complex, per initiative pass
const left = (free, simple, complex) => ({
  free: {
    current: free
  }, simple: {
    current: simple
  }, complex: {
    current: complex
  },
})

describe('missingAction', () => {
  it('lets an action through while one is left', () => {
    expect(SR5_MiscellaneousHelpers.missingAction([{
      type: "free", value: 1, source: "turnOnWifi"
    }], left(1, 2, 1))).toBeNull()
  })

  it('names the free action spent twice (switching the wireless)', () => {
    expect(SR5_MiscellaneousHelpers.missingAction([{
      type: "free", value: 1, source: "turnOffWifi"
    }], left(0, 2, 1))).toEqual({
      type: "free", value: 1, current: 0
    })
  })

  it('names the complex action of a reboot when none is left', () => {
    expect(SR5_MiscellaneousHelpers.missingAction([{
      type: "complex", value: 1, source: "rebootDeck"
    }], left(1, 2, 0))).toEqual({
      type: "complex", value: 1, current: 0
    })
  })

  it('adds up the actions of one roll by type', () => {
    expect(SR5_MiscellaneousHelpers.missingAction([{
      type: "simple", value: 1, source: "attack"
    }, {
      type: "simple", value: 1, source: "insertClip"
    }], left(1, 1, 1))).toEqual({
      type: "simple", value: 2, current: 1
    })
  })

  it('ignores manual adjustments, interruptions, special actions and refunds', () => {
    expect(SR5_MiscellaneousHelpers.missingAction([
      {
        type: "free", value: 3, source: "manual"
      },
      {
        type: "interruption", value: 1, source: "matrixAction"
      },
      {
        type: "special", value: 1, source: "attack"
      },
      {
        type: "simple", value: -1, source: "changeFiringMode"
      },
    ], left(0, 0, 0))).toBeNull()
  })

  it('accepts an empty or missing list', () => {
    expect(SR5_MiscellaneousHelpers.missingAction([], left(0, 0, 0))).toBeNull()
    expect(SR5_MiscellaneousHelpers.missingAction(undefined, left(0, 0, 0))).toBeNull()
  })
})
