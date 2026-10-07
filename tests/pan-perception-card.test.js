import {
  describe, it, expect
} from 'vitest'
import {
  cardBudget, needsGMWindow, perceptionFacts
} from '../modules/canvas/pan-crown/pan-perception-card.js'
import {
  answerOf
} from '../modules/canvas/pan-crown/pan-perception.js'

// What the system reads on the icon a Matrix Perception aims at (couronne du PAN, lot 5, SR5 p. 237)

const commlink = {
  uuid: 'Actor.g.Item.c', type: 'itemDevice', name: 'Commlink',
  system: {
    isActive: true, deviceRating: 3, commcode: '555-0199',
    conditionMonitors: {
      matrix: {
        value: 10, actual: {
          value: 4
        }
      }
    },
    marks: [{
      ownerId: 'x', value: 2
    }],
  },
}
const earpiece = {
  uuid: 'Actor.g.Item.e', type: 'itemGear', name: 'Oreillette',
  system: {
    deviceRating: 2, conditionMonitors: {
      matrix: {
        value: 9, actual: {
          value: 0
        }
      }
    }, marks: []
  },
}
const program = {
  type: 'itemProgram', name: 'Marteau', system: {
    isActive: true
  }
}
const idle = {
  type: 'itemProgram', name: 'Armure', system: {
    isActive: false
  }
}
const guard = {
  uuid: 'Actor.g', type: 'actorGrunt', name: 'Garde', items: [commlink, earpiece, program, idle],
  flags: {
    sr5: {
      lastMatrixAction: {
        key: 'hackOnTheFly', worldTime: 10, round: 2, combatId: 'c'
      }
    }
  },
  system: {
    matrix: {
      userGrid: 'local', attributes: {
        attack: {
          value: 0
        }, sleaze: {
          value: 0
        }, dataProcessing: {
          value: 3
        }, firewall: {
          value: 3
        }
      }
    }
  },
}

describe('the facts of a Matrix Perception', () => {
  it('reads the persona through its commlink: monitor, programs, commcode, attributes, last action', () => {
    const facts = perceptionFacts({
      actor: guard, item: commlink, persona: true
    })
    expect(facts).toMatchObject({
      monitor: {
        damage: 4, boxes: 10
      }, programs: ['Marteau'], deviceRating: 3, commcode: '555-0199', iconType: 'persona', grid: 'local',
      lastAction: {
        key: 'hackOnTheFly'
      },
    })
    expect(answerOf({
      key: 'attribute', param: 'firewall'
    }, facts).value).toBe(3)
    expect(answerOf({
      key: 'marks'
    }, facts).value).toBe(2)
  })

  it('reads a slaved earpiece as a device: no program, no commcode, Data Processing and Firewall only', () => {
    const facts = perceptionFacts({
      actor: guard, item: earpiece, persona: false
    })
    expect(facts.iconType).toBe('device')
    expect(facts.programs).toEqual([])
    expect(answerOf({
      key: 'commcode'
    }, facts).missing).toBe(true)
    expect(answerOf({
      key: 'attribute', param: 'sleaze'
    }, facts).missing).toBe(true)
    expect(answerOf({
      key: 'attribute', param: 'dataProcessing'
    }, facts).value).toBe(2)
    expect(answerOf({
      key: 'lastAction'
    }, facts).missing).toBe(true)
  })

  it('counts the hits of the attacker\'s card, the net hits of the defense card', () => {
    expect(cardBudget({
      test: {
        type: 'matrixAction'
      }, roll: {
        hits: 4
      }
    })).toBe(4)
    expect(cardBudget({
      test: {
        type: 'matrixDefense'
      }, previousMessage: {
        hits: 4
      }, roll: {
        hits: 1
      }
    })).toBe(3)
  })
})

// DjamZ, 07/10 (lot 8): the gamemaster's window opens only for an answer she types
describe('the gamemaster\'s window after a Matrix Perception', () => {
  it('stays shut when the system works out every answer', () => {
    expect(needsGMWindow([{
      key: 'monitor'
    }, {
      key: 'programs'
    }, {
      key: 'attribute', param: 'firewall'
    }, {
      key: 'silentNearby'
    }])).toBe(false)
  })

  it('opens for a file or "in this host", unless a provider answered it', () => {
    for (const key of ['fileEdited', 'fileBomb', 'fileProtection', 'silentInHost']){
      expect(needsGMWindow([{
        key: 'monitor'
      }, {
        key
      }])).toBe(true)
    }
    expect(needsGMWindow([{
      key: 'silentInHost'
    }], {
      silentInHost: 'Oui, deux'
    })).toBe(false)
    expect(needsGMWindow([{
      key: 'silentInHost'
    }], {
      silentInHost: '  '
    })).toBe(true)
  })
})