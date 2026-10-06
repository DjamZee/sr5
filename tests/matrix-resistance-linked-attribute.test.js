import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

//The matrix card as a GM wrote it: its reading again is tested in matrix-card.test.js
vi.mock('../modules/rolls/roll-helpers/matrix-card.js', () => ({
  trustedMatrixAction: async chatData => ({
    hits: chatData?.roll?.hits, actionType: chatData?.matrix?.actionType
  }),
  cardStandsFor: async () => true,
  trustedDefenderDamage: async (id, claimed) => claimed,
  damageReachable: () => true,
  tellMatrixCard: async () => {},
}))

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

/** A character sheet running on one active device, prepared as the system does */
function prepared({
  deviceType = 'livingPersona', special = 'resonance', specialValue = 5, deviceRating = 3
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
    type: 'actorPc', name: 'Persona',
    items: [{
      type: 'itemDevice', name: 'Device', system: {
        isActive: true, type: deviceType, deviceRating, pan: {
        }
      }
    }],
    system: {
      activeSpecialAttribute: special,
      attributes: {
        intuition: value(5), willpower: value(3), logic: value(6)
      },
      specialAttributes: {
        resonance: value(special === 'resonance' ? specialValue : 0),
        nanite: value(special === 'nanite' ? specialValue : 0),
      },
      matrix: {
        resistances, actions, deviceRating, attributes: {
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

beforeEach(() => {
  game.settings.get = vi.fn((_ns, key) => key === 'sr5DevicelessAILogicDefense' ? 'highest' : null)
  // Leave the device-bound preparation out: only the resistance pool is measured here
  for (const name of ['generateMatrixAttributes', 'generateMatrixActions', 'updateInitiativeMatrix', 'generateResonanceMatrix']) {
    vi.spyOn(SR5_CharacterUtility, name).mockImplementation(() => {})
  }
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Matrix damage resistance of a living persona (SR5 p. 103 and 230)', () => {
  it('rolls Resonance + Firewall, as the sheet shows', async () => {
    const actor = prepared()
    expect(actor.system.matrix.resistances.matrixDamage.dicePool).toBe(9)
    const roll = await resistanceRoll(actor)
    expect(roll.base).toBe(9)
    expect(roll.composition.map(m => m.source)).toEqual(['SR5.Resonance', 'SR5.Firewall'])
  })

  it('counts Resonance once, never again among the roll modifiers', async () => {
    const roll = await resistanceRoll(prepared())
    expect(roll.modifiers).toEqual([])
  })
})

describe('Matrix damage resistance of a head case (Lockdown p. 206)', () => {
  it('rolls Nanite Volume + Firewall, as the sheet shows', async () => {
    const actor = prepared({
      deviceType: 'headcase', special: 'nanite', specialValue: 6
    })
    expect(actor.system.matrix.resistances.matrixDamage.dicePool).toBe(10)
    const roll = await resistanceRoll(actor)
    expect(roll.base).toBe(10)
    expect(roll.composition.map(m => m.source)).toEqual(['SR5.NaniteVolume', 'SR5.Firewall'])
    expect(roll.modifiers).toEqual([])
  })
})

describe('Matrix damage resistance on a commlink or a deck (SR5 p. 229)', () => {
  for (const deviceType of ['commlink', 'cyberdeck']) {
    it(`stays device rating + Firewall on a ${deviceType}`, async () => {
      const actor = prepared({
        deviceType, special: 'magic'
      })
      const roll = await resistanceRoll(actor)
      expect(actor.system.matrix.resistances.matrixDamage.dicePool).toBe(7)
      expect(roll.composition.map(m => m.source)).toEqual(['Device', 'SR5.Firewall'])
      expect(roll.base).toBe(7)
      expect(roll.modifiers).toEqual([])
    })
  }
})
