import {
  describe, it, expect
} from 'vitest'

import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'

// SR5 p. 164: two simple actions OR one complex action per action phase, plus one free action
const left = (free, simple, complex) => ({
  free: {
    current: free
  }, simple: {
    current: simple
  }, complex: {
    current: complex
  },
})
const S = {
  type: "simple", value: 1, source: "attack"
}
const C = {
  type: "complex", value: 1, source: "rebootDeck"
}
const spend = (actions, start = left(1, 2, 1)) => {
  let a = SR5_MiscellaneousHelpers.spendActions(start, actions)
  return [a.free.current, a.simple.current, a.complex.current]
}

describe('spendActions', () => {
  it('a complex action leaves no simple one', () => expect(spend([C])).toEqual([1, 0, 0]))
  it('a simple action leaves no complex one', () => expect(spend([S])).toEqual([1, 1, 0]))
  it('two simple actions empty both', () => expect(spend([S, S])).toEqual([1, 0, 0]))
  it('a simple action after a complex one shows the overspending', () => expect(spend([C, S])).toEqual([1, -1, 0]))
  it('a complex action after a simple one shows the overspending', () => expect(spend([S, C])).toEqual([1, 0, -1]))
  it('a free action touches nothing else', () => expect(spend([{
    type: "free", value: 1, source: "turnOnWifi"
  }])).toEqual([0, 2, 1]))
  it('keeps a second complex action granted by an effect', () => expect(spend([C], left(1, 4, 2))).toEqual([1, 2, 1]))
  it('lets a manual adjustment touch only its counter', () => {
    expect(spend([{
      type: "simple", value: -1, source: "manual"
    }], left(1, 0, 0))).toEqual([1, 1, 0])
    expect(spend([{
      type: "complex", value: 1, source: "manual"
    }])).toEqual([1, 2, 0])
  })
  it('ignores a type the actor does not carry', () => expect(spend([{
    type: "interruption", value: 1, source: "dodge"
  }])).toEqual([1, 2, 1]))
})

describe('missingAction with the shared budget', () => {
  it('refuses a complex action after a simple one', () => {
    expect(SR5_MiscellaneousHelpers.missingAction([S, C], left(1, 2, 1))).toEqual({
      type: "complex", value: 1, current: 1
    })
    expect(SR5_MiscellaneousHelpers.missingAction([C], left(1, 1, 0))).toEqual({
      type: "complex", value: 1, current: 0
    })
  })
  it('refuses a simple action after a complex one', () => {
    expect(SR5_MiscellaneousHelpers.missingAction([C, S], left(1, 2, 1))).toEqual({
      type: "simple", value: 1, current: 2
    })
    expect(SR5_MiscellaneousHelpers.missingAction([S], left(1, 0, 0))).toEqual({
      type: "simple", value: 1, current: 0
    })
  })
  it('lets two simple actions through', () => expect(SR5_MiscellaneousHelpers.missingAction([S, S], left(1, 2, 1))).toBeNull())
})
