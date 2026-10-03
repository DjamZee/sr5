import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

globalThis.fromUuid = vi.fn(async () => null)
const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')
const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')
const {
  SR5
} = await import('../modules/config.js')
const prepareCases = await import('../modules/rolls/roll-prepare-case/index.js')

const value = v => ({
  augmented: {
    value: v
  }
})
const pool = () => ({
  base: 0, dicePool: 0, modifiers: []
})

/** A character sheet whose matrix resistances are reset, then prepared as the system does */
function prepared({
  depth = true, device = false, intuition = 5, willpower = 3
} = {
}) {
  const resistances = {
  }
  for (const key of Object.keys(SR5.matrixResistances)) resistances[key] = pool()
  const actions = {
  }
  for (const key of [...Object.keys(SR5.matrixActions), 'checkOverwatchScore']) actions[key] = {
    defense: pool()
  }
  const actor = {
    type: 'actorPc', name: 'IA',
    items: device ? [{
      type: 'itemDevice', name: 'Commlink', system: {
        isActive: true, type: 'commlink', deviceRating: 3, pan: {
        }
      }
    }] : [],
    system: {
      activeSpecialAttribute: depth ? 'depth' : 'magic',
      attributes: {
        intuition: value(intuition), willpower: value(willpower), logic: value(6)
      },
      specialAttributes: {
      },
      matrix: {
        resistances, actions, deviceRating: 3, attributes: {
          firewall: {
            value: 4
          }, sleaze: {
            value: 2
          }, dataProcessing: {
            value: 3
          }, attack: {
            value: 1
          }
        }
      },
    },
  }
  SR5Actor.prototype.updateItems.call({
  }, actor)
  return actor
}

/** The Take on damage roll of that sheet, as the chat card prepares it */
async function resistanceRoll(actor) {
  const rollData = {
    test: {
    }, dicePool: {
    }, target: {
    }, matrix: {
    }, previousMessage: {
    }, damage: {
      matrix: {
      }
    }
  }
  await prepareCases.matrixResistance(rollData, actor, {
    damage: {
      matrix: {
        value: 6
      }, type: 'matrix'
    }, target: {
    }, matrix: {
    }, previousMessage: {
    }, owner: {
    }
  })
  return rollData.dicePool
}

let mode
beforeEach(() => {
  mode = 'highest'
  game.settings.get = vi.fn((_ns, key) => key === 'sr5DevicelessAILogicDefense' ? mode : null)
  // Leave the device-bound preparation out: only the resistance pool is measured here
  for (const name of ['generateMatrixAttributes', 'generateMatrixActions', 'updateInitiativeMatrix']) {
    vi.spyOn(SR5_CharacterUtility, name).mockImplementation(() => {})
  }
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Matrix damage resistance of an AI without a device (Data Trails p. 157 and 161)', () => {
  it('resists with the higher of Willpower and Intuition by default, not with 0 dice', async () => {
    let actor = prepared()
    expect(actor.system.matrix.resistances.matrixDamage.dicePool).toBe(5)
    expect((await resistanceRoll(actor)).base).toBe(5)
    expect((await resistanceRoll(actor)).composition.map(m => m.source)).toEqual(['SR5.Intuition'])
    actor = prepared({
      willpower: 7
    })
    expect(actor.system.matrix.resistances.matrixDamage.dicePool).toBe(7)
    expect((await resistanceRoll(actor)).base).toBe(7)
  })

  it('follows the same world setting as its defense', async () => {
    mode = 'willpower'
    let actor = prepared()
    expect((await resistanceRoll(actor)).base).toBe(3)
    expect(actor.system.matrix.actions.snoop.defense.dicePool).toBe(3)
    mode = 'intuition'
    actor = prepared({
      willpower: 7
    })
    expect((await resistanceRoll(actor)).base).toBe(5)
    expect(actor.system.matrix.actions.snoop.defense.dicePool).toBe(5)
  })

  it('counts the attribute once, never again among the roll modifiers', async () => {
    const roll = await resistanceRoll(prepared())
    expect(roll.modifiers).toEqual([])
  })
})

describe('Matrix damage resistance of everyone else', () => {
  for (const [who, options] of [['an AI with a device', {
    device: true
  }], ['an ordinary character', {
    device: true, depth: false
  }]]) {
    it(`leaves ${who} on device rating + Firewall, whatever the setting`, async () => {
      for (mode of ['highest', 'intuition', 'willpower']) {
        const actor = prepared({
          ...options, willpower: 7
        })
        const roll = await resistanceRoll(actor)
        expect(actor.system.matrix.resistances.matrixDamage.dicePool).toBe(7)
        expect(roll.composition.map(m => m.source)).toEqual(['Commlink', 'SR5.Firewall'])
        expect(roll.base).toBe(7)
      }
    })
  }

  it('gives an ordinary character with no device no pool at all', async () => {
    const actor = prepared({
      depth: false
    })
    expect(actor.system.matrix.resistances.matrixDamage.dicePool).toBe(0)
    expect((await resistanceRoll(actor)).base).toBe(0)
  })
})
