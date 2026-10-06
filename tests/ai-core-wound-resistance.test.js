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

// The core damage of an AI gives wound modifiers "the same way as physical and stun damage"
// (Data Trails p. 161), and wound modifiers apply to every test except those that resist the damage
// about to be taken (SR5 p. 171). So the core penalty weighs on matrix defenses, never on matrix
// damage resistance. Pinned here: the 03/10 report that resistance ignored it was a false defect.

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
const penalty = v => ({
  actual: {
    value: v, base: v, modifiers: []
  }
})

/** An AI without a device, with 4 boxes on its core (wound modifier -1), prepared as the system does */
function woundedAI() {
  const resistances = {
  }
  for (const key of Object.keys(SR5.matrixResistances)) resistances[key] = pool()
  const actions = {
  }
  for (const key of [...Object.keys(SR5.matrixActions), 'checkOverwatchScore']) actions[key] = {
    defense: pool()
  }
  const actor = {
    type: 'actorPc', name: 'IA', items: [],
    system: {
      activeSpecialAttribute: 'depth',
      attributes: {
        intuition: value(5), willpower: value(3), logic: value(6)
      },
      specialAttributes: {
      },
      penalties: {
        condition: penalty(-1), matrix: penalty(0), magic: penalty(0), special: penalty(0)
      },
      matrix: {
        resistances, actions, deviceRating: 3, attributes: {
          firewall: {
            value: 0
          }, sleaze: {
            value: 0
          }, dataProcessing: {
            value: 0
          }, attack: {
            value: 0
          }
        }
      },
    },
  }
  SR5Actor.prototype.updateItems.call({
  }, actor)
  return actor
}

beforeEach(() => {
  game.settings.get = vi.fn((_ns, key) => key === 'sr5DevicelessAILogicDefense' ? 'highest' : null)
  for (const name of ['generateMatrixAttributes', 'generateMatrixActions', 'updateInitiativeMatrix']) {
    vi.spyOn(SR5_CharacterUtility, name).mockImplementation(() => {})
  }
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Core wound modifier of an AI (Data Trails p. 161, SR5 p. 171)', () => {
  it('is left out of the matrix damage resistance', async () => {
    const actor = woundedAI()
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
    expect(actor.system.matrix.resistances.matrixDamage.modifiers.some(m => m.type?.startsWith('penalty'))).toBe(false)
    expect(rollData.dicePool.base).toBe(5)
  })

  it('weighs on the pools that take the penalties, as for any wounded character', () => {
    const property = pool()
    SR5_CharacterUtility.applyPenalty('condition', property, woundedAI())
    expect(property.modifiers).toEqual([expect.objectContaining({
      type: 'penaltycondition', value: -1
    })])
  })
})
