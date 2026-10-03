import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

globalThis.ui = {
  notifications: {
    info: vi.fn(), warn: vi.fn()
  }
}
globalThis.fromUuid = vi.fn(async () => null)
const testCases = await import('../modules/rolls/roll-test-case/index.js')
const prepareCases = await import('../modules/rolls/roll-prepare-case/index.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')

let actor
beforeEach(() => {
  vi.restoreAllMocks()
  game.user = {
    isGM: true
  }
  actor = {
    id: 'a1', name: 'IA', type: 'actorPc', isOwner: true, items: [],
    system: {
      matrix: {
        overwatchScore: 0,
        actions: {
          dataSpike: {
            increaseOverwatchScore: true,
            defense: {
              modifiers: [{
                source: 'SR5.Intuition', type: 'linkedAttribute', value: 4
              }]
            }
          }
        },
        programs: {
          biofeedback: {
            isActive: false
          },
          blackout: {
            isActive: false
          }
        },
        userMode: 'ar',
      },
      specialAttributes: {
      },
      specialProperties: {
      },
    },
    update: vi.fn(async function (data) {
      this.system = data.system
    }),
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(() => actor)
  vi.spyOn(SR5_RollMessage, 'generateChatButton').mockImplementation((_t, action, label) => label ?? action)
  vi.spyOn(SR5_RollMessage, 'updateChatButtonHelper').mockImplementation(async () => {})
})

describe('Emulate on a Matrix Search (Data Trails p. 159)', () => {
  function searchCard(hits) {
    return {
      roll: {
        hits
      },
      edge: {
      },
      test: {
        type: 'matrixAction', typeSub: 'matrixSearch', title: 'Test'
      },
      threshold: {
        value: 2, type: 'generalInformation'
      },
      matrix: {
        emulateRating: 3
      },
      chatCard: {
        buttons: {
        }
      },
      previousMessage: {
      },
    }
  }

  it('raises the Overwatch Score and names Emulate in the title', async () => {
    vi.spyOn(SR5_MatrixHelpers, 'getMatrixSearchDuration').mockResolvedValue('1 min')
    const raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
    const card = searchCard(3)
    await testCases.matrixActionInfo(card, 'a1')
    expect(raise).toHaveBeenCalledWith(3, 'a1')
    expect(card.test.title).toBe('SR5.MatrixActionTestSR5.Colons SR5.MatrixActionMatrixSearch (2) (SR5.MatrixActionEmulate 3)')
    expect(card.chatCard.buttons.matrixSearchSuccess).toBeDefined()
  })

  it('keeps Emulate in the rebuilt title on Second Chance, without raising the score again', async () => {
    vi.spyOn(SR5_MatrixHelpers, 'getMatrixSearchDuration').mockResolvedValue('1 min')
    const raise = vi.spyOn(SR5_ActorHelper, 'overwatchIncrease').mockImplementation(async () => {})
    const card = searchCard(1)
    await testCases.matrixActionInfo(card, 'a1')
    card.roll.hits = 3
    await testCases.matrixActionInfo(card, 'a1')
    expect(raise).toHaveBeenCalledTimes(1)
    expect(card.test.title).toBe('SR5.MatrixActionTestSR5.Colons SR5.MatrixActionMatrixSearch (2) (SR5.MatrixActionEmulate 3)')
  })
})

describe('The Overwatch Score never goes below 0 (SR5 p. 231)', () => {
  it('a decrease larger than the score stops at 0', async () => {
    await SR5_ActorHelper.overwatchIncrease(-4, 'a1')
    expect(actor.system.matrix.overwatchScore).toBe(0)
  })

  it('a decrease within the score still lowers it', async () => {
    actor.system.matrix.overwatchScore = 10
    await SR5_ActorHelper.overwatchIncrease(-4, 'a1')
    expect(actor.system.matrix.overwatchScore).toBe(6)
  })

  it('the GM side of the socket stops at 0 too', async () => {
    actor.system.matrix.overwatchScore = 1
    await SR5_ActorHelper._socketOverwatchIncrease({
      data: {
        defenseHits: -3, actorId: 'a1'
      }
    })
    expect(actor.system.matrix.overwatchScore).toBe(0)
  })
})

describe('Object resistance keeps the button of an area spell only', () => {
  async function resist(area) {
    game.messages = {
      get: () => ({
        flags: {
          sr5data: {
            test: {
              type: 'spell'
            }, magic: {
              spell: {
                area
              }
            }, owner: {
            }
          }
        }
      })
    }
    await testCases.objectResistanceResultInfo({
      previousMessage: {
        messageId: 'm1', hits: 0
      },
      roll: {
        hits: 2
      },
      chatCard: {
        buttons: {
        }
      },
    })
    return SR5_RollMessage.updateChatButtonHelper.mock.calls.length > 0
  }

  it('removes the button of a spell without area', async () => {
    expect(await resist(0)).toBe(true)
  })

  it('keeps it on an area spell, other objects in the area may still resist', async () => {
    expect(await resist(3)).toBe(false)
  })

  it('removes it whenever the area is not positive', async () => {
    expect(await resist(-1)).toBe(true)
  })
})

describe('Matrix defense of an AI without a device (Data Trails p. 157)', () => {
  const chatData = {
    roll: {
      hits: 3
    },
    target: {
    },
    matrix: {
      mark: 1, actionType: 'attack'
    },
    owner: {
      actorId: 'b1', messageId: 'm1'
    },
    previousMessage: {
    },
  }

  function emptyRollData() {
    return {
      test: {
      }, dicePool: {
      }, target: {
      }, combat: {
        activeDefenses: {
        }
      }, matrix: {
      }, previousMessage: {
      }
    }
  }

  it('prepares the defense with no targeted device', async () => {
    const rollData = await prepareCases.matrixDefense(emptyRollData(), 'dataSpike', actor, chatData)
    expect(rollData.target.itemUuid).toBeUndefined()
    expect(rollData.dicePool.base).toBe(4)
  })

  it('still targets the active device when there is one', async () => {
    actor.items = [{
      type: 'itemDevice', uuid: 'Actor.a1.Item.d1', system: {
        isActive: true
      }
    }]
    const rollData = await prepareCases.matrixDefense(emptyRollData(), 'dataSpike', actor, chatData)
    expect(rollData.target.itemUuid).toBe('Actor.a1.Item.d1')
  })

  it('names the AI on the mark button when the attacker wins', async () => {
    const card = {
      roll: {
        hits: 0
      },
      target: {
      },
      matrix: {
        mark: 1
      },
      test: {
        typeSub: 'hackOnTheFly'
      },
      previousMessage: {
        actorId: 'b1', hits: 3
      },
      owner: {
        speakerActor: 'Decker'
      },
      damage: {
        matrix: {
        }
      },
      chatCard: {
        buttons: {
        }
      },
    }
    const format = vi.spyOn(game.i18n, 'format')
    await testCases.matrixDefenseInfo(card, 'a1')
    expect(format).toHaveBeenCalledWith('SR5.AttackerPlaceMarkTo', expect.objectContaining({
      item: 'IA'
    }))
  })
})
