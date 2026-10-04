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
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const prepareCases = await import('../modules/rolls/roll-prepare-case/index.js')
const {
  matrixActionInfo
} = await import('../modules/rolls/roll-test-case/index.js')

/** An AI (Depth 4), with or without an active commlink */
function ai({
  device = false
} = {
}) {
  return {
    id: 'a1', type: 'actorPc', name: 'IA', isOwner: true,
    items: device ? [{
      type: 'itemDevice', name: 'Commlink', system: {
        isActive: true, type: 'commlink', deviceRating: 3, pan: {
        }
      }
    }] : [],
    system: {
      activeSpecialAttribute: 'depth',
      specialAttributes: {
        depth: {
          augmented: {
            value: 4
          }
        }
      },
      matrix: {
        noise: {
          value: 0
        },
        attributes: {
          sleaze: {
            value: 0
          }
        },
        actions: {
          snoop: {
            source: 'core', actionType: 'complex', increaseOverwatchScore: true, neededMarks: 1,
            test: {
              modifiers: []
            }, limit: {
              linkedAttribute: 'sleaze', value: 0, modifiers: []
            }
          }
        }
      },
    },
  }
}

beforeEach(() => {
  game.user = {
    isGM: true, targets: new Set()
  }
  game.settings.get = vi.fn(() => null)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Matrix actions of an AI without a device (Data Trails p. 157 and 159)', () => {
  it('lists its matrix actions on the sheet, as with a device', () => {
    const generated = []
    for (const name of ['generateMatrixAttributes', 'generateMatrixResistances', 'generateMatrixActionsDefenses', 'updateInitiativeMatrix', 'generateDevicelessAIMatrixResistance']) {
      vi.spyOn(SR5_CharacterUtility, name).mockImplementation(() => {})
    }
    vi.spyOn(SR5_CharacterUtility, 'generateMatrixActions').mockImplementation(actor => generated.push(actor.name))
    SR5Actor.prototype.updateItems.call({
    }, ai())
    expect(generated).toEqual(['IA'])
  })

  it('rolls through Emulate only, offered at Depth', async () => {
    const rollData = {
      test: {
      }, dicePool: {
        modifiers: []
      }, limit: {
      }, matrix: {
      }, dialogSwitch: {
      }, combat: {
        actions: []
      }, target: {
      }, threshold: {
      }, owner: {
      }
    }
    await prepareCases.matrixAction(rollData, 'snoop', ai())
    expect(rollData.dialogSwitch.emulate).toBe(true)
    expect(rollData.matrix.emulateRequired).toBe(true)
    expect(rollData.matrix.emulateDefault).toBe(4)
    expect(rollData.matrix.emulateAttributeValue).toBe(0)
  })

  it('leaves Emulate optional for an AI loaded on a device', async () => {
    const rollData = {
      test: {
      }, dicePool: {
        modifiers: []
      }, limit: {
      }, matrix: {
      }, dialogSwitch: {
      }, combat: {
        actions: []
      }, target: {
      }, threshold: {
      }, owner: {
      }
    }
    await prepareCases.matrixAction(rollData, 'snoop', ai({
      device: true
    }))
    expect(rollData.dialogSwitch.emulate).toBe(true)
    expect(rollData.matrix.emulateRequired).toBeUndefined()
  })
})

describe('Emulating for a legal action (Data Trails p. 157)', () => {
  /** An Emulate card (rating 3) with 2 hits */
  async function card(legal) {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(ai())
    const raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
    await matrixActionInfo({
      roll: {
        hits: 2
      }, edge: {
      }, test: {
        type: 'matrixAction', typeSub: 'snoop', title: 'Test'
      }, matrix: {
        emulateRating: 3, emulateLegal: legal
      }, chatCard: {
        buttons: {
        }
      }, previousMessage: {
      }, owner: {
      }
    }, 'a1')
    return raise
  }

  it('raises the Overwatch Score by the rating when illegal', async () => {
    expect(await card(false)).toHaveBeenCalledWith(3, 'a1')
  })

  it('raises nothing when the player ticked it legal', async () => {
    expect(await card(true)).not.toHaveBeenCalled()
  })
})
