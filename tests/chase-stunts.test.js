import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  actionRefusal, actionThreshold, resolveAction, resolveFollowUp, stuntAdvantage, stuntAdvantagesFor, stuntRangeBonus,
  withStunt, STUNT_DICE_CAP, crazyStuntEdge
} from '../modules/system/chase-actions.js'
import {
  prepareChaseRoll, chaseTestKind
} from '../modules/system/chase-roll-prepare.js'
import {
  RIGGER_QUALITY_EFFECTS, chaseQualityDice
} from '../modules/system/rigger-qualities.js'

// Vehicle chases (R12, part 3): the stunts (SR5 p. 205, R5 p. 182-183), the Edge actions (R5 p. 178-181) and the two
// qualities that waited for the chase (R5 p. 37)

const ids = {
  initiatorId: 'A', targetId: 'B'
}

describe('the core book\'s Stunt (SR5 p. 205)', () => {
  it('is for the pursued only, threshold maneuver + Terrain, [Speed or Handling]', () => {
    expect(actionRefusal('stuntBook', {
      advanced: false, role: 'pursuer'
    })).toBe('pursuedOnly')
    expect(actionRefusal('stuntBook', {
      advanced: false, role: 'pursued'
    })).toBeNull()
    expect(actionThreshold('stuntBook', {
      terrain: 1
    })).toBe(3)
    expect(actionThreshold('stuntBook', {
      terrain: 2, maneuver: 4
    })).toBe(6)
  })

  it('failed: out of control at once', () => {
    const out = resolveAction('stuntBook', {
      ...ids, hits: 2, threshold: 3, pursuers: ['B']
    })
    expect(out.success).toBe(false)
    expect(out.effects).toEqual([{
      type: 'outOfControl', id: 'A'
    }, {
      type: 'crash', id: 'A'
    }])
    expect(out.notes[0].key).toBe('SR5.CHASE_NoteStuntBookFailed')
  })

  it('made: every pursuer rolls the same test, same threshold and limit', () => {
    const out = resolveAction('stuntBook', {
      ...ids, hits: 4, threshold: 2, rawThreshold: 3, limit: 'speed', pursuers: ['B', 'C']
    })
    expect(out.success).toBe(true)
    expect(out.effects).toEqual(['B', 'C'].map(id => ({
      type: 'followUp', vehicle: id, test: 'stuntFollow', threshold: 3, a: 'A', b: id, limit: 'speed'
    })))
  })

  it('a pursuer who misses falls a range back (getting away past Extreme is the register\'s)', () => {
    const pending = {
      test: 'stuntFollow', vehicle: 'B', a: 'A', b: 'B', threshold: 3
    }
    expect(resolveFollowUp(pending, {
      hits: 3, threshold: 3
    }).effects).toEqual([])
    expect(resolveFollowUp(pending, {
      hits: 2, threshold: 3
    }).effects).toEqual([{
      type: 'shift', a: 'A', b: 'B', steps: 1
    }])
  })
})

describe('Rigger 5.0\'s stunts (R5 p. 182-183)', () => {
  it('alone: (level + Terrain), never on autopilot', () => {
    expect(actionThreshold('stunt', {
      terrain: 2, stunt: {
        level: 3
      }
    })).toBe(5)
    expect(actionRefusal('stunt', {
      advanced: true, controlMode: 'autopilot'
    })).toBe('autopilot')
    expect(actionRefusal('stunt', {
      advanced: true, controlMode: 'rigging'
    })).toBeNull()
  })

  it('within an action: the level goes on its threshold', () => {
    expect(actionThreshold('drift', {
      terrain: 1, speed: 2
    })).toBe(1)
    expect(actionThreshold('drift', {
      terrain: 1, speed: 2, stunt: {
        level: 2
      }
    })).toBe(3)
  })

  it('failed: a driving test at once, −level dice, threshold the Terrain (arbitrage de DjamZ, 08/10)', () => {
    const out = withStunt({
      success: false, net: 0, effects: [], notes: []
    }, {
      ...ids, terrain: 2, stunt: {
        level: 3, advantage: 'handling'
      }
    })
    expect(out.effects).toEqual([{
      type: 'followUp', vehicle: 'A', test: 'stuntCrash', threshold: 2, a: 'A', dice: -3, diceKey: 'SR5.CHASE_DiceStunt'
    }])
    expect(resolveFollowUp({
      test: 'stuntCrash', vehicle: 'A', threshold: 2
    }, {
      hits: 1, threshold: 2
    }).effects).toEqual([{
      type: 'outOfControl', id: 'A'
    }, {
      type: 'crash', id: 'A'
    }])
  })

  it('no stunt, nothing changes', () => {
    const outcome = {
      success: false, net: 0, effects: [], notes: []
    }
    expect(withStunt(outcome, {
      ...ids
    })).toBe(outcome)
  })

  it('the Handling of the turn, never past its double', () => {
    expect(stuntAdvantage({
      level: 2, advantage: 'handling'
    }, {
      ...ids, handling: 4
    }).effects).toEqual([{
      type: 'turnHandling', id: 'A', delta: 2
    }])
    expect(stuntAdvantage({
      level: 3, advantage: 'handling'
    }, {
      ...ids, handling: 4, turnHandling: 2
    }).effects).toEqual([{
      type: 'turnHandling', id: 'A', delta: 2
    }])
    expect(stuntAdvantage({
      level: 3, advantage: 'handling'
    }, {
      ...ids, handling: 4, turnHandling: 4
    }).notes[0].key).toBe('SR5.CHASE_NoteStuntCapped')
  })

  it('slows the targeted vehicle: its Speed, or its Handling for the turn', () => {
    expect(stuntAdvantage({
      level: 2, advantage: 'slow', slow: 'speed'
    }, {
      ...ids, targetSpeed: 3
    }).effects).toEqual([{
      type: 'turnSpeed', id: 'B', value: 1
    }])
    expect(stuntAdvantage({
      level: 2, advantage: 'slow', slow: 'handling'
    }, {
      ...ids
    }).effects).toEqual([{
      type: 'turnHandling', id: 'B', delta: -2
    }])
    expect(stuntAdvantage({
      level: 2, advantage: 'slow'
    }, {
      initiatorId: 'A'
    }).notes[0].key).toBe('SR5.CHASE_NoteNobodyNear')
  })

  it('a crazy stunt costs a point of Edge and gets the usual Edge dice (R5 p. 182)', () => {
    expect(crazyStuntEdge({
      level: 2, advantage: 'crazy'
    }, 4)).toBe(4)
    expect(crazyStuntEdge({
      level: 2, advantage: 'soak'
    }, 4)).toBe(0)
    expect(crazyStuntEdge({
      level: 0, advantage: 'crazy'
    }, 4)).toBe(0)
    expect(crazyStuntEdge(undefined, 4)).toBe(0)
    // A crazy stunt prepares its test with the point already spent: the test pushes the limit, no other one
    const data = {
      test: {
        title: ''
      }, threshold: {
        value: 0
      }, limit: {
        base: 4, modifiers: {
        }, type: 'handling'
      }, dicePool: {
        modifiers: []
      }, previousMessage: {
        messageId: ''
      }, edge: {
        canUseEdge: true
      }
    }
    prepareChaseRoll(data, {
      system: {
      }
    }, {
      chaseRoll: {
        mode: 'initiate', key: 'stunt', threshold: 3, edgePush: 4
      }
    })
    expect(data.edge).toEqual({
      canUseEdge: true, prepaidPush: 4
    })
  })

  it('the dice outside the chase never go past +4', () => {
    expect(stuntAdvantage({
      level: 6, advantage: 'soak'
    }, ids).notes[0].data.dice).toBe(STUNT_DICE_CAP)
    expect(stuntAdvantage({
      level: 2, advantage: 'social'
    }, ids).notes[0].data.dice).toBe(2)
  })

  it('its successes join a range change, past the Acceleration up to its double', () => {
    expect(stuntAdvantagesFor('catchUp')).toContain('range')
    expect(stuntAdvantagesFor('drift')).not.toContain('range')
    expect(stuntRangeBonus({
      level: 2, advantage: 'range'
    }, 'drift')).toBe(0)
    // 2 net hits + 3 from the stunt, Acceleration 2: 4 ranges (the double), not 5
    const out = resolveAction('catchUp', {
      ...ids, hits: 6, opposingHits: 1, threshold: 3, acceleration: 2, initiatorRole: 'pursuer', range: 'extreme',
      stunt: {
        level: 3, advantage: 'range'
      }
    })
    expect(out.effects).toEqual([{
      type: 'shift', a: 'A', b: 'B', steps: -4
    }])
  })
})

describe('Edge (R5 p. 178-181)', () => {
  it('Zen Driving: the rigger jumped in, a point left, once a turn; it controls the vehicle', () => {
    const base = {
      advanced: true, controlMode: 'rigging', edgeLeft: true
    }
    expect(actionRefusal('zenDriving', base)).toBeNull()
    expect(actionRefusal('zenDriving', {
      ...base, controlMode: 'manual'
    })).toBe('jumpedIn')
    expect(actionRefusal('zenDriving', {
      ...base, controlMode: 'autopilot'
    })).toBe('autopilot')
    expect(actionRefusal('zenDriving', {
      ...base, edgeLeft: false
    })).toBe('noEdge')
    expect(actionRefusal('zenDriving', {
      ...base, flags: {
        zenDrivingUsed: true
      }
    })).toBe('once')
    expect(resolveAction('zenDriving', ids).effects).toEqual([{
      type: 'control', id: 'A'
    }])
  })

  it('Hang On Baby: only once the monitor is full; it keeps the vehicle this turn', () => {
    const base = {
      advanced: true, controlMode: 'rigging', edgeLeft: true
    }
    expect(actionRefusal('holdOn', base)).toBe('notDestroyed')
    expect(actionRefusal('holdOn', {
      ...base, monitorFull: true
    })).toBeNull()
    expect(resolveAction('holdOn', ids).effects).toEqual([{
      type: 'flag', id: 'A', flag: 'holdOn'
    }])
  })

  it('Leaf in the Wind: an aircraft destroyed or at Speed 0, any pilot but the autopilot; (Terrain + damage)', () => {
    const base = {
      advanced: true, kind: 'rotor', controlMode: 'manual', edgeLeft: true
    }
    expect(actionRefusal('leafInWind', {
      ...base, speed: 3
    })).toBe('notFalling')
    expect(actionRefusal('leafInWind', {
      ...base, speed: 0
    })).toBeNull()
    expect(actionRefusal('leafInWind', {
      ...base, kind: 'ground', speed: 0
    })).toBe('kind')
    expect(actionThreshold('leafInWind', {
      terrain: 1, damageModifier: -2
    })).toBe(3)
    const out = resolveAction('leafInWind', {
      ...ids, hits: 5, threshold: 3
    })
    expect(out.notes).toEqual([{
      key: 'SR5.CHASE_NoteLeafInWind', data: {
        net: 2
      }
    }])
  })
})

describe('Cascadeur and Poursuivant infatigable (R5 p. 37)', () => {
  const quality = value => ({
    type: 'itemQuality', system: {
      isActive: true, systemEffects: [{
        category: 'specialCase', value
      }]
    }
  })
  const both = [quality(RIGGER_QUALITY_EFFECTS.stuntman), quality(RIGGER_QUALITY_EFFECTS.tirelessPursuer)]
  const vehicle = (controlMode = 'manual') => ({
    controlMode, vehicleOwner: {
      id: 'rigger'
    }
  })

  it('+2 to a chase action, +2 to a stunt, never on autopilot', () => {
    expect(chaseQualityDice(vehicle(), both, {
      action: true, stunt: true
    }).map(d => d.value)).toEqual([2, 2])
    expect(chaseQualityDice(vehicle('remote'), both, {
      action: true
    })).toEqual([{
      key: 'SR5.RiggerTirelessPursuer', value: 2
    }])
    expect(chaseQualityDice(vehicle('autopilot'), both, {
      action: true, stunt: true
    })).toEqual([])
    expect(chaseQualityDice(vehicle(), [], {
      action: true, stunt: true
    })).toEqual([])
  })

  it('what is a chase action and what is a Stunt test (arbitrage de DjamZ, 08/10: a stunt within counts)', () => {
    expect(chaseTestKind({
      mode: 'initiate', key: 'catchUp'
    })).toEqual({
      action: true, stunt: false
    })
    expect(chaseTestKind({
      mode: 'initiate', key: 'catchUp', options: {
        stunt: {
          level: 1
        }
      }
    })).toEqual({
      action: true, stunt: true
    })
    expect(chaseTestKind({
      mode: 'initiate', key: 'stuntBook'
    }).stunt).toBe(true)
    expect(chaseTestKind({
      mode: 'oppose', key: 'catchUp'
    })).toEqual({
      action: false, stunt: false
    })
    expect(chaseTestKind({
      mode: 'followUp', key: 'stuntBook', test: 'stuntFollow'
    })).toEqual({
      action: false, stunt: true
    })
    expect(chaseTestKind({
      mode: 'initiate', key: 'zenDriving'
    }).action).toBe(false)
  })
})

describe('the vehicle test of a part 3 chase test', () => {
  beforeAll(() => {
    globalThis.game = {
      i18n: {
        localize: k => k, format: (k, d) => `${k}${JSON.stringify(d)}`
      }
    }
  })
  const rollData = () => ({
    test: {
      title: ''
    }, threshold: {
      value: 0
    }, limit: {
      base: 4, modifiers: {
      }, type: 'handling'
    }, dicePool: {
      modifiers: []
    }, previousMessage: {
      messageId: ''
    }
  })
  const drone = {
    system: {
      controlMode: 'rigging', vehicleOwner: {
        id: 'rigger', items: [{
          type: 'itemQuality', system: {
            isActive: true, systemEffects: [{
              value: RIGGER_QUALITY_EFFECTS.stuntman
            }]
          }
        }]
      }, attributes: {
      }, vehicleTest: {
        limit: {
          modifiers: []
        }
      }
    }
  }

  it('takes the Handling of the turn as a limit modifier, and Cascadeur\'s dice on a stunt', () => {
    const data = rollData()
    prepareChaseRoll(data, drone, {
      chaseRoll: {
        mode: 'initiate', key: 'stunt', threshold: 3, limit: 'handling', limitMods: [{
          key: 'SR5.CHASE_LimitStunt', value: 2
        }], options: {
          stunt: {
            level: 2
          }
        }
      }
    })
    expect(data.limit.modifiers.chaseStunt).toEqual({
      label: 'SR5.CHASE_LimitStunt', value: 2
    })
    expect(data.dicePool.modifiers).toEqual([{
      type: 'chaseAction', label: 'SR5.RiggerStuntman', value: 2
    }])
  })

  it('no Handling modifier on a Speed limit', () => {
    const data = rollData()
    prepareChaseRoll(data, drone, {
      chaseRoll: {
        mode: 'initiate', key: 'catchUpBook', threshold: 2, limit: 'speed', limitMods: [{
          key: 'SR5.CHASE_LimitStunt', value: 2
        }]
      }
    })
    expect(data.limit.modifiers).toEqual({
    })
  })
})
