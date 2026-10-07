import {
  describe, it, expect, beforeAll
} from 'vitest'
import {
  prepareChaseRoll, vehicleTestCostsAction
} from '../modules/system/chase-roll-prepare.js'

// Vehicle chases (R12, part 2): the vehicle test of a chase action takes the threshold, the limit and the dice the
// chase window gave it

beforeAll(() => {
  globalThis.game = {
    i18n: {
      localize: k => k, format: (k, d) => `${k}${JSON.stringify(d)}`
    }
  }
})

function rollData() {
  return {
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
  }
}

const drone = {
  system: {
    offRoadMode: false, attributes: {
      speed: {
        augmented: {
          value: 5
        }
      }
    }, vehicleTest: {
      limit: {
        modifiers: [{
          value: 2
        }]
      }
    }
  }
}

describe('a chase action\'s vehicle test', () => {
  it('leaves any other vehicle test alone', () => {
    expect(prepareChaseRoll(rollData(), drone, null)).toBe(false)
    expect(prepareChaseRoll(rollData(), drone, {
      chaseRoll: {
        key: 'nothing'
      }
    })).toBe(false)
  })

  it('takes the threshold and the dice, and keeps what the window put on the card', () => {
    const data = rollData()
    const chase = {
      mode: 'initiate', key: 'catchUp', threshold: 3, limit: 'handling', dice: [{
        key: 'SR5.CHASE_DiceDrift', value: 1
      }]
    }
    expect(prepareChaseRoll(data, drone, {
      chaseRoll: chase
    })).toBe(true)
    expect(data.threshold.value).toBe(3)
    expect(data.chase).toBe(chase)
    expect(data.dicePool.modifiers).toEqual([{
      type: 'chaseAction', label: 'SR5.CHASE_DiceDrift', value: 1
    }])
    expect(data.limit).toEqual({
      base: 4, modifiers: {
      }, type: 'handling'
    })
    expect(data.test.title).toContain('SR5.CHASE_Action_catchUp')
    expect(data.test.title).toContain('(3)')
  })

  it('a fast environment of the core book limits by Speed, its modifiers kept apart (SR5 p. 205)', () => {
    const data = rollData()
    prepareChaseRoll(data, drone, {
      chaseRoll: {
        mode: 'initiate', key: 'catchUpBook', threshold: 2, limit: 'speed'
      }
    })
    expect(data.limit.base).toBe(3)
    expect(data.limit.type).toBe('speed')
  })

  it('the opposing card answers the initiator\'s', () => {
    const data = rollData()
    prepareChaseRoll(data, drone, {
      chaseRoll: {
        mode: 'oppose', key: 'cutOff', threshold: 0, originId: 'abc'
      }
    })
    expect(data.previousMessage.messageId).toBe('abc')
    expect(data.test.title).toContain('SR5.CHASE_Opposing')
    expect(data.test.title).not.toContain('(0)')
  })
})

// Arbitrage de DjamZ (08/10, SR5 p. 205): a test another's action imposes is free, as a defense
describe('vehicleTestCostsAction', () => {
  it('a chase action the character takes, or a plain vehicle test, costs its complex action', () => {
    expect(vehicleTestCostsAction(undefined)).toBe(true)
    expect(vehicleTestCostsAction({
      test: {
        type: 'ramming'
      }
    })).toBe(true)
    expect(vehicleTestCostsAction({
      chaseRoll: {
        mode: 'initiate', key: 'stunt'
      }
    })).toBe(true)
  })
  it('opposing an action, following a stunt or avoiding the crash costs nothing', () => {
    for (const chaseRoll of [
      {
        mode: 'oppose', key: 'cutOff'
      },
      {
        mode: 'followUp', key: 'stunt', test: 'stuntFollow'
      },
      {
        mode: 'followUp', key: 'cutOff', test: 'avoidCrash'
      },
      {
        mode: 'followUp', key: 'catchUpR5', test: 'escapeR5'
      },
    ]) expect(vehicleTestCostsAction({
      chaseRoll
    })).toBe(false)
  })
})
