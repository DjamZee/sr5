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
  //Ruling of DjamZ (2026-10-06, G12): an extra action granted by an effect is not lost with a complex action
  it('keeps an extra simple action granted by an effect after a complex one', () => {
    const start = left(1, 3, 1)
    start.simple.value = 3
    start.complex.value = 1
    expect(spend([C], start)).toEqual([1, 1, 0])
  })
  it('spends the extra simple action first: one simple leaves the complex one', () => {
    const start = left(1, 3, 1)
    start.simple.value = 3
    start.complex.value = 1
    expect(spend([S], start)).toEqual([1, 2, 1])
    const again = left(1, 3, 1)
    again.simple.value = 3
    again.complex.value = 1
    expect(spend([S, S], again)).toEqual([1, 1, 0])
  })
  //Rosine's review: simple, complex, then simple spent 4 simple-equivalents out of 3 without any missing action
  it('spends the extra simple action once: simple, complex, then nothing left', () => {
    const start = left(1, 3, 1)
    start.simple.value = 3
    start.complex.value = 1
    expect(spend([S, C], start)).toEqual([1, 0, 0])
    const again = left(1, 3, 1)
    again.simple.value = 3
    again.complex.value = 1
    expect(SR5_MiscellaneousHelpers.missingAction([S, C, S], again)).toEqual({
      type: "simple", value: 2, current: 3
    })
  })
  it('keeps an extra complex action granted by an effect after a simple one, and the simple left after it', () => {
    const start = left(1, 2, 2)
    start.simple.value = 2
    start.complex.value = 2
    expect(spend([S], start)).toEqual([1, 1, 1])
    const again = left(1, 2, 2)
    again.simple.value = 2
    again.complex.value = 2
    expect(spend([S, C], again)).toEqual([1, 1, 0])
  })
  it('lets the extra simple action through after a complex one, with the blocking setting', () => {
    const start = left(1, 3, 1)
    start.simple.value = 3
    start.complex.value = 1
    expect(SR5_MiscellaneousHelpers.missingAction([C, S], start)).toBeNull()
  })
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

// N36: putting the choke setting back refunds the simple action, and the complex one with it
describe('spendActions refund', () => {
  const chokeBack = {
    type: "simple", value: -1, source: "changeChokeSettings"
  }
  const choke = {
    ...chokeBack, value: 1
  }
  it('S2 C1 -> S1 C0 -> S2 C1', () => expect(spend([choke, chokeBack])).toEqual([1, 2, 1]))
  it('gives no complex action back after a real complex one', () => expect(spend([C, chokeBack])).toEqual([1, 1, 0]))
  it('keeps a second complex action granted by an effect', () => expect(spend([choke, chokeBack], left(1, 4, 2))).toEqual([1, 4, 2]))
  it('a refunded complex action gives the simple ones back', () => expect(spend([C, {
    type: "complex", value: -1, source: "rebootDeck"
  }])).toEqual([1, 2, 1]))
})
