import {
  describe, it, expect
} from 'vitest'
import {
  SOCIAL_MANEUVERS, maneuverDice, maneuversFor, maneuverSucceeded, carriedEffect, zanshinTier
} from '../modules/system/social-maneuvers.js'
import {
  pendingFor, afterUse
} from '../modules/system/social-pending.js'

// Social Maneuvers, Cutting Aces p. 153-154 (VF)
describe('the dice of a maneuver, p. 153', () => {
  it('-4 unless stated otherwise: Hustle -6, Zanshin -2', () => {
    expect(maneuverDice('diversion')).toBe(-4)
    expect(maneuverDice('hustle')).toBe(-6)
    expect(maneuverDice('zanshin')).toBe(-2)
  })

  it('Push Home doubles the +2 for leverage on top of its -4', () => {
    expect(maneuverDice('pushHome')).toBe(-2)
  })

  it('has the fourteen maneuvers of the book', () => {
    expect(Object.keys(SOCIAL_MANEUVERS)).toHaveLength(14)
  })

  it('offers each maneuver on its own test', () => {
    expect(maneuversFor('con')).toEqual(['hustle', 'diversion', 'drawAttention'])
    expect(maneuversFor('knowledge')).toEqual(['informedOpinion'])
    expect(maneuversFor('judgeIntentions')).toEqual(['zanshin'])
    expect(maneuversFor('firearms')).toEqual([])
  })
})

describe('the outcome', () => {
  it('a net hit is read on the resistance card', () => {
    expect(maneuverSucceeded('diversion', {
      hits: 3, net: null
    })).toBe(null)
    expect(maneuverSucceeded('diversion', {
      hits: 3, net: 1
    })).toBe(true)
    expect(maneuverSucceeded('diversion', {
      hits: 3, net: 0
    })).toBe(false)
  })

  it('Hustle works when the test fails', () => {
    expect(maneuverSucceeded('hustle', {
      hits: 2, net: -1
    })).toBe(true)
    expect(maneuverSucceeded('hustle', {
      hits: 0, net: null
    })).toBe(true)
    expect(maneuverSucceeded('hustle', {
      hits: 4, net: 2
    })).toBe(false)
  })

  it('Informed Opinion carries its hits to the social limit, for the encounter', () => {
    expect(carriedEffect('informedOpinion', {
      hits: 3
    }, {
      authorId: 'a', targetId: 'b'
    })).toMatchObject({
      holder: 'a', kind: 'limit', value: 3, persistent: true
    })
  })

  it('Drill Sergeant gives the target -2 on resisting Leadership, against the author', () => {
    expect(carriedEffect('drillSergeant', {
      hits: 2
    }, {
      authorId: 'a', targetId: 'b'
    })).toMatchObject({
      holder: 'b', kind: 'dice', value: -2, tests: ['leadership'], resistOnly: true, versus: null
    })
  })

  it('Hustle gives the author +2 against the same target', () => {
    expect(carriedEffect('hustle', {
      hits: 0
    }, {
      authorId: 'a', targetId: 'b'
    })).toMatchObject({
      holder: 'a', value: 2, versus: 'b'
    })
  })

  it('Zanshin tells up to three tiers', () => {
    expect(zanshinTier(0)).toBe(0)
    expect(zanshinTier(2)).toBe(2)
    expect(zanshinTier(5)).toBe(3)
  })
})

describe('the pending effects', () => {
  const list = [
    {
      id: 'x', tests: ['con', 'negotiation'], versus: 'b'
    },
    {
      id: 'y', tests: ['leadership'], resistOnly: true
    },
    {
      id: 'z', tests: ['con'], persistent: true
    },
  ]

  it('ticks an effect against one party only when the roll is against her', () => {
    expect(pendingFor(list, {
      test: 'con', isResist: false, otherId: 'b'
    }).map(p => [p.entry.id, p.checked])).toEqual([['x', true], ['z', true]])
    expect(pendingFor(list, {
      test: 'con', isResist: false, otherId: 'c'
    }).map(p => [p.entry.id, p.checked])).toEqual([['x', false], ['z', true]])
  })

  it('keeps a resisting malus for the resistance', () => {
    expect(pendingFor(list, {
      test: 'leadership', isResist: false
    })).toHaveLength(0)
    expect(pendingFor(list, {
      test: 'leadership', isResist: true
    })).toHaveLength(1)
  })

  it('spends the used effects, not the persistent ones', () => {
    expect(afterUse(list, ['x', 'z']).map(e => e.id)).toEqual(['y', 'z'])
  })
})
