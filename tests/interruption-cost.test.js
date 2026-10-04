import {
  describe, it, expect
} from 'vitest'

import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'

// SR5 p. 170: each interruption action costs its own Initiative, 5 unless stated otherwise
describe('interruptionInitiativeCost', () => {
  it('costs 5 by default', () => {
    expect(SR5_MiscellaneousHelpers.interruptionInitiativeCost([{
      type: "interruption", value: 1, source: "matrixAction"
    }])).toBe(5)
  })

  it('adds up two interruptions of the same list', () => {
    expect(SR5_MiscellaneousHelpers.interruptionInitiativeCost([
      {
        type: "interruption", value: 1, source: "matrixAction", initiativeCost: 10
      },
      {
        type: "interruption", value: 1, source: "other"
      },
    ])).toBe(15)
  })

  it('ignores the other kinds of action', () => {
    expect(SR5_MiscellaneousHelpers.interruptionInitiativeCost([{
      type: "complex", value: 1, source: "attack"
    }])).toBe(0)
  })
})
