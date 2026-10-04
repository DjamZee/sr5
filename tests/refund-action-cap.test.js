import {
  describe, it, expect
} from 'vitest'

import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'

// SR5 p. 164: a pass gives one free action and two simple OR one complex. A refunded action (the weapon
// dialog put back to its first setting) can never give more than the pass grants
const pass = (free, simple, complex) => ({
  free: {
    value: 1, current: free
  }, simple: {
    value: 2, current: simple
  }, complex: {
    value: 1, current: complex
  },
})
const refund = (type, start) => {
  let a = SR5_MiscellaneousHelpers.spendActions(start, [{
    type, value: -1, source: "changeFiringMode"
  }])
  return [a.free.current, a.simple.current, a.complex.current]
}

describe('a refunded action is capped at the pass maximum', () => {
  it('a simple action never spent this pass gives nothing more', () => expect(refund("simple", pass(1, 2, 1))).toEqual([1, 2, 1]))
  it('a free action never spent this pass gives nothing more', () => expect(refund("free", pass(1, 2, 1))).toEqual([1, 2, 1]))
  it('a simple action spent this pass comes back with the complex one', () => expect(refund("simple", pass(1, 1, 0))).toEqual([1, 2, 1]))
  it('a free action spent this pass comes back', () => expect(refund("free", pass(0, 2, 1))).toEqual([1, 2, 1]))
  it('a counter with no maximum is left as before', () => {
    let a = SR5_MiscellaneousHelpers.spendActions({
      simple: {
        current: 2
      }, complex: {
        current: 1
      }
    }, [{
      type: "simple", value: -1
    }])
    expect(a.simple.current).toBe(3)
  })
})
