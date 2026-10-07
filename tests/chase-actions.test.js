import {
  describe, it, expect
} from 'vitest'
import {
  CHASE_ACTIONS, actionsFor, actionRefusal, actionThreshold, actionDice, resolveAction, resolveFollowUp, opposedNet,
  optimalSpeedModifier, catchUpSteps, behindRange, sixPackBonus, collisionMultiplier, collisionDamage, winsOpposed
} from '../modules/system/chase-actions.js'

// Vehicle chases (R12, part 2): the chase actions of the core book (SR5 p. 204-205) and of Rigger 5.0 (p. 176-181)

const ids = {
  initiatorId: 'A', targetId: 'B'
}

describe('the actions of each rule set', () => {
  it('the core book has Catch-Up / Break Away, Cut Off and Ram, and Control a Vehicle in both', () => {
    expect(actionsFor(false).map(a => a.key)).toEqual(['control', 'catchUpBook', 'cutOffBook', 'rammingBook'])
    const r5 = actionsFor(true).map(a => a.key)
    expect(r5).toContain('control')
    expect(r5).toContain('catchUp')
    expect(r5).not.toContain('catchUpBook')
    expect(r5).toEqual(expect.arrayContaining(['quickTurn', 'crazyIvan', 'cutOff', 'discreetPursuit', 'driveBy',
      'likeAGlove', 'snatch', 'pit', 'collision', 'sowChaos', 'sixPack', 'controlledExit', 'drift', 'clearPath',
      'fallingLeaf', 'strafe', 'swarm']))
  })

  it('no stunt and no Edge action in this part (part 3)', () => {
    expect(Object.keys(CHASE_ACTIONS)).not.toContain('stunt')
    expect(Object.keys(CHASE_ACTIONS)).not.toContain('zenDriving')
  })

  it('refuses an action at the wrong range, for the wrong kind, without target, or twice a turn', () => {
    expect(actionRefusal('cutOff', {
      advanced: true, range: 'medium', hasTarget: true, kind: 'ground'
    })).toBe('range')
    expect(actionRefusal('cutOff', {
      advanced: true, range: 'short', hasTarget: true, kind: 'ground'
    })).toBeNull()
    expect(actionRefusal('fallingLeaf', {
      advanced: true, kind: 'ground'
    })).toBe('kind')
    expect(actionRefusal('catchUp', {
      advanced: true, kind: 'ground', hasTarget: false
    })).toBe('target')
    expect(actionRefusal('sowChaos', {
      advanced: true, kind: 'ground', flags: {
        sowChaosUsed: true
      }
    })).toBe('once')
    expect(actionRefusal('catchUp', {
      advanced: true, kind: 'rotor', hasTarget: true, range: 'long', flags: {
        noCatchUp: true
      }
    })).toBe('noCatchUp')
    expect(actionRefusal('catchUp', {
      advanced: false, kind: 'ground', hasTarget: true
    })).toBe('unknown')
  })
})

describe('thresholds', () => {
  it('core book Catch-Up: the maneuver threshold (2 by default) + Terrain (SR5 p. 200-201, 205)', () => {
    expect(actionThreshold('catchUpBook', {
      terrain: 1
    })).toBe(3)
    expect(actionThreshold('catchUpBook', {
      terrain: 3, maneuver: 4
    })).toBe(7)
  })

  it('Rigger 5.0 Catch-Up: Terrain + the Speed gap, the Terrain alone for the fastest (R5 p. 177)', () => {
    expect(actionThreshold('catchUp', {
      terrain: 2, gap: 3
    })).toBe(5)
    expect(actionThreshold('catchUp', {
      terrain: 2, gap: 3, fastest: true
    })).toBe(2)
  })

  it('an optimal Speed adds the gap to the current Speed (R5 p. 176)', () => {
    expect(optimalSpeedModifier(5, 2)).toBe(3)
    expect(optimalSpeedModifier(1, 2)).toBe(1)
    expect(optimalSpeedModifier(5, null)).toBe(0)
    expect(actionThreshold('driveBy', {
      terrain: 1, speed: 4
    })).toBe(3)
    expect(actionThreshold('clearPath', {
      terrain: 2, speed: 4
    })).toBe(2)
  })

  it('Quick Turn reads the target\'s Speed, Discreet Pursuit the range, Swarm the drones (R5 p. 176-181)', () => {
    expect(actionThreshold('quickTurn', {
      terrain: 1, targetSpeed: 4
    })).toBe(5)
    expect(actionThreshold('discreetPursuit', {
      terrain: 2, range: 'medium'
    })).toBe(4)
    expect(actionThreshold('discreetPursuit', {
      terrain: 2, range: 'contact'
    })).toBe(7)
    expect(actionThreshold('swarm', {
      terrain: 1, droneCount: 3
    })).toBe(4)
  })

  it('Like a Glove: the new Terrain, +2 for an End Run between different vehicles (R5 p. 178, VO p. 176)', () => {
    expect(actionThreshold('likeAGlove', {
      terrain: 1, newTerrainValue: 3
    })).toBe(3)
    expect(actionThreshold('likeAGlove', {
      terrain: 1, newTerrainValue: 3, endRun: true, endRunHarder: true
    })).toBe(5)
    expect(actionThreshold('likeAGlove', {
      terrain: 1, newTerrainValue: 3, endRun: true
    })).toBe(3)
  })
})

describe('opposed tests with a threshold (proposal, Q1)', () => {
  it('steps = hits over the higher of the threshold and the target\'s hits', () => {
    expect(opposedNet({
      hits: 6, threshold: 2, opposingHits: 3
    })).toBe(3)
    expect(opposedNet({
      hits: 6, threshold: 4, opposingHits: 1
    })).toBe(2)
    expect(opposedNet({
      hits: 3, threshold: 4, opposingHits: 0
    })).toBe(0)
    expect(opposedNet({
      hits: 3, threshold: 0, opposingHits: 3
    })).toBe(0)
    expect(winsOpposed({
      hits: 3, threshold: 0, opposingHits: 2
    })).toBe(true)
  })
})

describe('Catch-Up / Break Away', () => {
  it('core book: one range per net hit, at most the Acceleration; the pursuer closes in (SR5 p. 205)', () => {
    const out = resolveAction('catchUpBook', {
      ...ids, hits: 6, threshold: 2, acceleration: 2, initiatorRole: 'pursuer', range: 'long'
    })
    expect(out.success).toBe(true)
    expect(out.effects).toEqual([{
      type: 'shift', a: 'A', b: 'B', steps: -2
    }])
  })

  it('core book: missed threshold, nothing', () => {
    expect(resolveAction('catchUpBook', {
      ...ids, hits: 1, threshold: 3, acceleration: 2, initiatorRole: 'pursuer', range: 'long'
    }).effects).toEqual([])
  })

  it('core book: past Extreme, the pursuer rolls the same test to stay at Extreme', () => {
    const out = resolveAction('catchUpBook', {
      ...ids, hits: 5, threshold: 3, rawThreshold: 3, acceleration: 3, initiatorRole: 'pursued', range: 'long'
    })
    expect(out.effects).toEqual([{
      type: 'shift', a: 'A', b: 'B', steps: 1
    }, {
      type: 'followUp', vehicle: 'B', test: 'stayAtExtreme', threshold: 3, a: 'A', b: 'B'
    }])
    expect(resolveFollowUp(out.effects[1], {
      hits: 3, threshold: 3
    }).effects).toEqual([])
    expect(resolveFollowUp(out.effects[1], {
      hits: 2, threshold: 3
    }).effects).toEqual([{
      type: 'escape', a: 'A', b: 'B'
    }])
  })

  it('Rigger 5.0: past Extreme, each net hit of the pursuer takes a range off the move (R5 p. 177)', () => {
    const move = catchUpSteps({
      net: 4, acceleration: 4, role: 'pursued', range: 'medium', advanced: true
    })
    // medium → long → extreme → away: three steps escape, two are applied at once
    expect(move).toEqual({
      steps: 4, now: 2, escape: {
        toEscape: 3, total: 4
      }
    })
    const pending = {
      test: 'escapeR5', a: 'A', b: 'B', applied: 2, total: 4, toEscape: 3, threshold: 2
    }
    // 1 net hit: 3 steps left, still away
    expect(resolveFollowUp(pending, {
      hits: 3, threshold: 2
    }).effects).toEqual([{
      type: 'escape', a: 'A', b: 'B'
    }])
    // 3 net hits: one step only, the range comes back from Extreme to Long
    expect(resolveFollowUp(pending, {
      hits: 5, threshold: 2
    }).effects).toEqual([{
      type: 'shift', a: 'A', b: 'B', steps: -1
    }])
  })

  it('Rigger 5.0: opposed, the steps follow the proposal of Q1', () => {
    const out = resolveAction('catchUp', {
      ...ids, hits: 5, threshold: 2, opposingHits: 3, acceleration: 3, initiatorRole: 'pursuer', range: 'long'
    })
    expect(out.effects).toEqual([{
      type: 'shift', a: 'A', b: 'B', steps: -2
    }])
  })

  it('Drift adds a die, Like a Glove takes two (R5 p. 178, 180)', () => {
    expect(actionDice('catchUp', {
      side: 'initiator', flags: {
        drift: true
      }, gloveMalus: true
    })).toEqual([{
      key: 'SR5.CHASE_DiceDrift', value: 1
    }, {
      key: 'SR5.CHASE_DiceLikeAGlove', value: -2
    }])
  })
})

describe('the other actions', () => {
  it('Cut Off: won, the target rolls Terrain + net hits or crashes out of control (SR5 p. 205, R5 p. 178)', () => {
    const book = resolveAction('cutOffBook', {
      ...ids, hits: 4, opposingHits: 2, terrain: 1
    })
    expect(book.effects[0]).toMatchObject({
      type: 'followUp', vehicle: 'B', test: 'avoidCrash', threshold: 3
    })
    expect(resolveFollowUp(book.effects[0], {
      hits: 1, threshold: 3
    }).effects).toEqual([{
      type: 'outOfControl', id: 'B'
    }])
    expect(resolveAction('cutOff', {
      ...ids, hits: 2, opposingHits: 2, terrain: 1, threshold: 1
    }).effects).toEqual([])
  })

  it('Ram (core book): the target takes Body + net hits, the attacker half its Body (SR5 p. 205)', () => {
    const out = resolveAction('rammingBook', {
      ...ids, hits: 5, opposingHits: 2, body: 11
    })
    expect(out.notes[0].data).toEqual({
      target: 14, initiator: 6
    })
  })

  it('Quick Turn and Six Pack put the initiator behind the target (R5 p. 176, 179)', () => {
    expect(behindRange(1, true, 'contact')).toBe('extreme')
    expect(behindRange(3, true, 'contact')).toBe('medium')
    expect(behindRange(9, true, 'contact')).toBe('contact')
    expect(behindRange(9, true, 'short')).toBe('short')
    const turn = resolveAction('quickTurn', {
      ...ids, hits: 6, threshold: 4
    })
    expect(turn.effects).toEqual([{
      type: 'setRange', a: 'A', b: 'B', range: 'long'
    }, {
      type: 'roles', pursuer: 'A', pursued: 'B'
    }])
    expect(resolveAction('quickTurn', {
      ...ids, hits: 4, threshold: 4
    }).effects).toEqual([])
    expect(sixPackBonus('long', true)).toBe(2)
    expect(sixPackBonus('contact', true)).toBe(0)
    expect(actionDice('sixPack', {
      side: 'target', range: 'extreme'
    })).toEqual([{
      key: 'SR5.CHASE_DiceSixPack', value: 3
    }])
  })

  it('PIT: won, Handling down by the net hits; lost, the initiator slows by the gap (R5 p. 179)', () => {
    expect(resolveAction('pit', {
      ...ids, hits: 5, opposingHits: 2, threshold: 1
    }).effects).toEqual([{
      type: 'handling', id: 'B', delta: -3
    }])
    expect(resolveAction('pit', {
      ...ids, hits: 1, opposingHits: 3, threshold: 1, speed: 4
    }).effects).toEqual([{
      type: 'speed', id: 'A', value: 2
    }])
  })

  it('Collision: the damage of the table by angle (R5 p. 179)', () => {
    expect(collisionMultiplier(2)).toBe(0.5)
    expect(collisionMultiplier(11)).toBe(10)
    expect(collisionDamage({
      angle: 'rear', speed: 5, targetSpeed: 3, body: 10, net: 2
    })).toEqual({
      target: 7, initiator: 4, relative: 2
    })
    expect(collisionDamage({
      angle: 'front', speed: 3, targetSpeed: 3, body: 10, net: 0
    })).toEqual({
      target: 20, initiator: 20, relative: 6
    })
  })

  it('Like a Glove: won, the new Terrain and a test for each opponent; End Run ends the chase (R5 p. 178)', () => {
    const won = resolveAction('likeAGlove', {
      ...ids, hits: 3, threshold: 3, newTerrain: 'r5Tight', newTerrainValue: 4, opponents: ['B', 'C']
    })
    expect(won.effects[0]).toEqual({
      type: 'terrain', key: 'r5Tight'
    })
    expect(won.effects.slice(1).map(e => e.vehicle)).toEqual(['B', 'C'])
    expect(resolveFollowUp(won.effects[1], {
      hits: 1, threshold: 4
    }).effects).toEqual([{
      type: 'shift', a: 'A', b: 'B', steps: 2
    }, {
      type: 'glove', id: 'B', terrain: 'r5Tight'
    }])
    const run = resolveAction('likeAGlove', {
      ...ids, hits: 5, threshold: 5, endRun: true, opponents: ['B']
    })
    expect(run.effects).toEqual([{
      type: 'escape', a: 'A', b: 'B'
    }])
    const failed = resolveAction('likeAGlove', {
      ...ids, hits: 1, threshold: 3, speed: 4, newTerrainValue: 3
    })
    expect(failed.effects).toEqual([])
    expect(failed.notes[0].data.dv).toBe(7)
  })

  it('Sow Chaos and Clear the Path change the Terrain of the turn (R5 p. 179-181)', () => {
    expect(resolveAction('sowChaos', {
      ...ids, hits: 2, threshold: 2, nearOpponents: ['B']
    }).effects).toEqual([{
      type: 'turnTerrain', ids: ['B'], delta: 1
    }])
    const path = resolveAction('clearPath', {
      ...ids, hits: 4, threshold: 2, body: 9, terrain: 2, nearAllies: ['C']
    })
    expect(path.effects).toEqual([{
      type: 'turnTerrain', ids: ['C'], delta: -2
    }])
    expect(path.notes[0].data.dv).toBe(7)
  })

  it('Falling Leaf: out of the chase at Speed 0; a glitch, out of control and a Handling test (R5 p. 181)', () => {
    const out = resolveAction('fallingLeaf', {
      ...ids, hits: 3, threshold: 2, glitch: true, criticalGlitch: false, handling: 4
    })
    expect(out.effects.map(e => e.type)).toEqual(['speed', 'leave', 'outOfControl', 'followUp'])
    expect(resolveFollowUp(out.effects[3], {
      hits: 1, threshold: 4
    }).effects).toEqual([{
      type: 'handling', id: 'A', delta: -3
    }])
  })

  it('Control a Vehicle rolls nothing and gives the control back (SR5 p. 203)', () => {
    expect(CHASE_ACTIONS.control.roll).toBe(false)
    expect(resolveAction('control', ids).effects).toEqual([{
      type: 'control', id: 'A'
    }])
  })
})
