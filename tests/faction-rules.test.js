import {
  describe, it, expect
} from 'vitest'
import {
  FACTION_REASONS, FACTION_SPENDS, attitudeShift, shiftAttitude, canSpend, longConPenalty, scoreOf, sameGameMonth
} from '../modules/interface/faction-rules.js'

// Faction Reputation, Cutting Aces p. 156-160 (VF)
describe('faction reputation table, p. 157', () => {
  it('carries the book values', () => {
    expect(FACTION_REASONS).toMatchObject({
      negotiationKept: 1, negotiationBroken: -2, conUndetected: 1, shortConDetected: -3,
      longConDetected: -5, longConExtraWeek: -1, intimidation: -1, harm: -2, kill: -10,
      advanceGoals: 2, setBackGoals: -2,
    })
  })

  it('a long con found out costs -5 and -1 per full extra week', () => {
    expect(longConPenalty(2)).toBe(-5)
    expect(longConPenalty(7)).toBe(-6)
    expect(longConPenalty(20)).toBe(-7)
  })
})

describe('consequences table, p. 160', () => {
  it.each([
    [30, 4], [25, 4], [24, 3], [20, 3], [19, 2], [15, 2], [14, 1], [10, 1],
    [9, 0], [0, 0], [-9, 0], [-10, -1], [-14, -1], [-15, -2], [-20, -3], [-24, -3], [-25, -4], [-40, -4],
  ])('score %i gives %i steps', (score, steps) => {
    expect(attitudeShift(score)).toBe(steps)
  })

  it('moves the NPC attitude of SR5 p. 142 from neutral, clamped', () => {
    expect(shiftAttitude('neutral', 1)).toBe('friendly')
    expect(shiftAttitude('neutral', 4)).toBe('friendly')
    expect(shiftAttitude('neutral', -2)).toBe('prejudiced')
    expect(shiftAttitude('neutral', -4)).toBe('enemy')
    expect(shiftAttitude(undefined, 0)).toBe('neutral')
  })
})

describe('spending, p. 159-160', () => {
  it('carries the book costs', () => {
    expect(FACTION_SPENDS).toEqual({
      contactInfluence: 10, newContact: 20, streetCred: 10, notoriety: 20, serviceAsk: 2, serviceGranted: 3,
    })
  })

  it('never goes below zero', () => {
    expect(canSpend(10, 10)).toBe(true)
    expect(canSpend(9, 10)).toBe(false)
    expect(canSpend(-3, 2)).toBe(false)
  })

  it('once a month per contact', () => {
    expect(sameGameMonth(null, {
      year: 2080, month: 3
    })).toBe(false)
    expect(sameGameMonth({
      year: 2080, month: 3
    }, {
      year: 2080, month: 3
    })).toBe(true)
    expect(sameGameMonth({
      year: 2080, month: 3
    }, {
      year: 2080, month: 4
    })).toBe(false)
  })
})

describe('score from the journal', () => {
  const log = [
    {
      factionId: 'a', actorId: 'pc', delta: 2, pending: false
    },
    {
      factionId: 'a', actorId: 'pc', delta: -10, pending: false
    },
    {
      factionId: 'a', actorId: 'pc', delta: 5, pending: true
    },
    {
      factionId: 'b', actorId: 'pc', delta: 7, pending: false
    },
    {
      factionId: 'a', actorId: 'other', delta: 3, pending: false
    },
  ]
  it('sums applied movements only, per faction and character, and may be negative', () => {
    expect(scoreOf(log, 'a', 'pc')).toBe(-8)
    expect(scoreOf(log, 'b', 'pc')).toBe(7)
    expect(scoreOf([], 'a', 'pc')).toBe(0)
  })
})
