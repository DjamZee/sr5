import {
  describe, it, expect
} from 'vitest'
import {
  COMBAT_MANEUVERS, maneuverThreshold, maneuverBonuses, resolveManeuver, entryHolds, maneuverOffers, prunedLedger,
  tacnetCoordination, assistPool,
} from '../modules/rolls/roll-helpers/combat-maneuvers.js'

// Lot 37b: combat maneuvers of Run & Gun p. 112-116 and Street Lethal p. 180-181
describe('the threshold of a maneuver', () => {
  it('is the book\'s, or the GM\'s own', () => {
    expect(maneuverThreshold('crossfire')).toBe(6)
    expect(maneuverThreshold('crossfire', {
      threshold: '5'
    })).toBe(5)
    expect(maneuverThreshold('crossfire', {
      threshold: ''
    })).toBe(6)
  })
  it('Fire Shield has none in the book: the GM sets it', () => {
    expect(maneuverThreshold('fireShield')).toBe(null)
    expect(maneuverThreshold('fireShield', {
      threshold: 4
    })).toBe(4)
  })
  it('Indirect Fire by map and binoculars: +1 (SL p. 180)', () => {
    expect(maneuverThreshold('indirectFire', {
      mapAndBinoculars: true
    })).toBe(5)
  })
})

describe('the bonuses of a maneuver that succeeded', () => {
  it('fixed ones from the book', () => {
    expect(maneuverBonuses('crossfire')).toEqual([{
      rolls: 'attack', value: 3
    }])
    expect(maneuverBonuses('saturation')).toEqual([{
      rolls: 'autoAttack', value: 4
    }])
  })
  it('the entries give +1 only once the team was spotted (RG p. 114)', () => {
    expect(maneuverBonuses('dynamicEntry', {
      detected: true
    })).toEqual([{
      rolls: 'attack', value: 1
    }])
  })
  it('Pack Attack: +1 per 3 hits of the leader, rounded down (RG p. 114)', () => {
    expect(maneuverBonuses('packAttack', {
      hits: 7
    })).toEqual([{
      rolls: 'meleeAttack', value: 2
    }])
  })
  it('Slicing the Pie: +1 defense die per hit (RG p. 116)', () => {
    expect(maneuverBonuses('slicingPie', {
      hits: 3
    })).toEqual([{
      rolls: 'defense', value: 3
    }])
  })
  it('Shield Wall: a defense die per net hit (SL p. 181)', () => {
    expect(maneuverBonuses('shieldWall', {
      hits: 5, threshold: 3
    })).toEqual([{
      rolls: 'defense', value: 2
    }])
  })
})

describe('the outcome of the test (RG p. 113)', () => {
  const team = [{
    uuid: 'B', glitch: false
  }, {
    uuid: 'C', glitch: true
  }]
  it('a success gives the bonus to all, but a member who glitched is out of place for the pass', () => {
    const out = resolveManeuver('crossfire', {
      hits: 6, threshold: 6, leaderUuid: 'A', assists: team
    })
    expect(out.success).toBe(true)
    expect(out.members.A).toEqual({
      bonus: true, penalty: 0, turn: true
    })
    expect(out.members.B.bonus).toBe(true)
    expect(out.members.C).toEqual({
      bonus: false, penalty: 3, turn: false
    })
  })
  it('a failure puts all out of place, a penalty equal to the bonus on defense, for the pass', () => {
    const out = resolveManeuver('castle', {
      hits: 4, threshold: 5, leaderUuid: 'A', assists: team
    })
    expect(out.success).toBe(false)
    expect(Object.values(out.members).every(m => !m.bonus && m.penalty === 2 && !m.turn)).toBe(true)
  })
  it('a critical glitch of anyone fails it, for the whole turn', () => {
    const out = resolveManeuver('crossfire', {
      hits: 9, threshold: 6, leaderUuid: 'A', assists: [{
        uuid: 'B', criticalGlitch: true, glitch: true
      }]
    })
    expect(out.success).toBe(false)
    expect(out.critical).toBe(true)
    expect(out.members.A).toEqual({
      bonus: false, penalty: 3, turn: true
    })
  })
  it('Slicing the Pie is the scout\'s alone, and its critical glitch costs -2 (RG p. 116)', () => {
    const out = resolveManeuver('slicingPie', {
      hits: 0, threshold: 1, leaderUuid: 'A', leaderCritical: true, leaderGlitch: true, assists: [{
        uuid: 'B'
      }]
    })
    expect(Object.keys(out.members)).toEqual(['A'])
    expect(out.members.A.penalty).toBe(2)
  })
  it('a Shield Wall that fails breaks without penalty (SL p. 181)', () => {
    const out = resolveManeuver('shieldWall', {
      hits: 1, threshold: 3, leaderUuid: 'A'
    })
    expect(out.members.A.penalty).toBe(0)
  })
})

describe('the boxes of the rolls', () => {
  const now = {
    combatId: 'c', round: 2, pass: 1
  }
  const ledger = {
    card1: {
      label: 'Feu croisé', bonuses: [{
        rolls: 'attack', value: 3
      }], members: {
        A: {
          bonus: true, penalty: 0, holds: {
            combatId: 'c', round: 2, pass: null
          }
        },
        C: {
          bonus: false, penalty: 3, holds: {
            combatId: 'c', round: 2, pass: 1
          }
        },
      }
    }
  }
  it('a member gets the bonus on the rolls it is for', () => {
    expect(maneuverOffers(ledger, 'A', new Set(['all', 'attack', 'rangedAttack']), now)[0].value).toBe(3)
    expect(maneuverOffers(ledger, 'A', new Set(['all', 'defense']), now)).toEqual([])
  })
  it('a member out of place gets his penalty on defense only, for the pass', () => {
    expect(maneuverOffers(ledger, 'C', new Set(['all', 'defense']), now)[0].value).toBe(-3)
    expect(maneuverOffers(ledger, 'C', new Set(['all', 'attack']), now)).toEqual([])
    expect(maneuverOffers(ledger, 'C', new Set(['all', 'defense']), {
      ...now, pass: 2
    })).toEqual([])
  })
  it('the bonus ends with the combat turn: a new test is needed', () => {
    expect(maneuverOffers(ledger, 'A', new Set(['attack']), {
      ...now, round: 3
    })).toEqual([])
    expect(entryHolds(null, null)).toBe(true)
    expect(Object.keys(prunedLedger(ledger, {
      ...now, round: 3
    }))).toEqual([])
    expect(Object.keys(prunedLedger(ledger, now))).toEqual(['card1'])
  })
})

describe('the RP-Tac and the members', () => {
  it('level II: explanations in a simple action, +5 Initiative to one; level III: +10, +5, +5 (RG p. 119)', () => {
    expect(tacnetCoordination(1)).toEqual({
      instructions: 'complex', initiative: []
    })
    expect(tacnetCoordination(2)).toEqual({
      instructions: 'simple', initiative: [5]
    })
    expect(tacnetCoordination(3).initiative).toEqual([10, 5, 5])
  })
  it('a member without the skill defaults on Intuition - 1, wounds included', () => {
    expect(assistPool(7, 4)).toBe(7)
    expect(assistPool(null, 4)).toBe(3)
    expect(assistPool(undefined, 4, -2)).toBe(1)
    expect(assistPool(null, 1, -3)).toBe(0)
  })
  it('every maneuver names its page', () => {
    for (const m of Object.values(COMBAT_MANEUVERS)) expect(m.page).toMatch(/^(RG|SL) \d/)
  })
})
