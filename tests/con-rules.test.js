import {
  describe, it, expect
} from 'vitest'
import {
  CON_STEPS, MATRIX_DEGREES, stepAllowed, netHits, intelDelta, evaluationTest, propFabrication, propAcquisition,
  propTotal, rolledStepOutcome, conOpposition, factionReasonOf, openRolledSteps
} from '../modules/system/con-rules.js'

// Using Con, Cutting Aces p. 162-164 (VF)
describe('the steps of a con, p. 162-164', () => {
  it('keeps the long-con steps out of a short con', () => {
    expect(stepAllowed('investigation', 'short')).toBe(false)
    expect(stepAllowed('matrixResearch', 'short')).toBe(false)
    expect(stepAllowed('evaluation', 'short')).toBe(false)
    expect(stepAllowed('reinforce', 'short')).toBe(false)
    expect(stepAllowed('surveillance', 'short')).toBe(true)
    expect(stepAllowed('propFabrication', 'short')).toBe(true)
    expect(stepAllowed('exit', 'short')).toBe(true)
  })

  it('marks surveillance and the bait mandatory', () => {
    expect(Object.keys(CON_STEPS).filter(k => CON_STEPS[k].mandatory)).toEqual(['surveillance', 'bait'])
  })

  it('carries the Matrix Connection Level table, p. 163', () => {
    expect(Object.values(MATRIX_DEGREES)).toEqual([4, 6, 8, 10, 12, 14, 16])
  })
})

describe('the Intel Level, p. 162-163', () => {
  it('adds the net hits of investigation and matrix research, never less', () => {
    expect(intelDelta('investigation', 3)).toBe(3)
    expect(intelDelta('matrixResearch', -2)).toBe(0)
  })

  it('adds or takes away the net hits of surveillance', () => {
    expect(intelDelta('surveillance', 2)).toBe(2)
    expect(intelDelta('surveillance', -2)).toBe(-2)
  })

  it('evaluation is limited by the Intel Level and opposed to it, impossible at 0 or less', () => {
    expect(evaluationTest(3)).toEqual({
      allowed: true, limit: 3, opposingDice: 3
    })
    expect(evaluationTest(0).allowed).toBe(false)
    expect(evaluationTest(-1).allowed).toBe(false)
  })

  it('counts net hits signed', () => {
    expect(netHits(4, 1)).toBe(3)
    expect(netHits(1, 4)).toBe(-3)
  })
})

describe('the Prop Rating, p. 163', () => {
  it('fabrication: threshold twice the rating, the hits halved when stopped short', () => {
    expect(propFabrication(3, 6)).toEqual({
      threshold: 6, done: true, rating: 3
    })
    expect(propFabrication(3, 5)).toEqual({
      threshold: 6, done: false, rating: 2
    })
  })

  it('acquisition: Availability three times the rating, 1,000 nuyen per point of Availability', () => {
    expect(propAcquisition(2)).toEqual({
      availability: 6, cost: 6000
    })
  })

  it('the props add up', () => {
    expect(propTotal([{
      rating: 2
    }, {
      rating: 3
    }])).toBe(5)
  })
})

describe('phases two and three, p. 163-164', () => {
  it('the bait: a win hooks, a tie leaves a long con wary and exposes a short one', () => {
    expect(rolledStepOutcome('bait', 2, 'long')).toBe('hooked')
    expect(rolledStepOutcome('bait', 0, 'long')).toBe('wary')
    expect(rolledStepOutcome('bait', 0, 'short')).toBe('exposed')
    expect(rolledStepOutcome('bait', -1, 'long')).toBe('exposed')
  })

  it('reinforcing: only a win keeps the mark', () => {
    expect(rolledStepOutcome('reinforce', 1, 'long')).toBe('hooked')
    expect(rolledStepOutcome('reinforce', 0, 'long')).toBe('exposed')
  })

  it('the exit: only a win is clean', () => {
    expect(rolledStepOutcome('exit', 1, 'short')).toBe('exitClean')
    expect(rolledStepOutcome('exit', 0, 'short')).toBe('exitCrumbled')
  })

  it('the opposition: the higher of Judge Intentions or Con + Intuition, Judge Intentions alone to reinforce', () => {
    expect(conOpposition('bait', {
      judgeIntentions: 6, conIntuition: 8
    }, 3)).toEqual({
      pool: 'conIntuition', base: 8, intelModifier: -3
    })
    expect(conOpposition('reinforce', {
      judgeIntentions: 6, conIntuition: 8
    }, 3)).toEqual({
      pool: 'judgeIntentions', base: 6, intelModifier: 0
    })
    expect(conOpposition('exit', {
      judgeIntentions: 7, conIntuition: 5
    }, 3).intelModifier).toBe(0)
  })

  it('offers the steps the con has reached', () => {
    expect(openRolledSteps({
      kind: 'long', status: 'preparing'
    })).toEqual(['bait'])
    expect(openRolledSteps({
      kind: 'long', status: 'wary'
    })).toEqual(['reinforce'])
    expect(openRolledSteps({
      kind: 'short', status: 'hooked'
    })).toEqual(['exit'])
    expect(openRolledSteps({
      kind: 'long', status: 'exposed'
    })).toEqual([])
  })

  it('offers the Faction Reputation reason of p. 158', () => {
    expect(factionReasonOf('exitClean', 'long')).toBe('conUndetected')
    expect(factionReasonOf('exposed', 'short')).toBe('shortConDetected')
    expect(factionReasonOf('vanished', 'long')).toBe('longConDetected')
    expect(factionReasonOf('hooked', 'long')).toBe(null)
  })
})
