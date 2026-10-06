import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Hyacinthe's review of the lot "VD des cartes", part 2 (06/10), D4 and D5: the locks of the chat buttons that write
// matrix damage, and what applyDamageToDecK answers. Each test fails when its lock is taken away

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(), emitForPlayer: vi.fn(), emit: vi.fn(),
  },
}))
const matrixCard = {
  cardStandsFor: vi.fn(), trustedDefenderDamage: vi.fn(), damageReachable: vi.fn(() => true),
}
vi.mock('../modules/rolls/roll-helpers/matrix-card.js', async (importOriginal) => ({
  ...(await importOriginal()),
  cardStandsFor: (...a) => matrixCard.cardStandsFor(...a),
  trustedDefenderDamage: (...a) => matrixCard.trustedDefenderDamage(...a),
  damageReachable: (...a) => matrixCard.damageReachable(...a),
}))

const {
  SR5_SocketHandler
} = await import('../modules/socket.js')
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  SR5_RollMessage, biofeedbackType
} = await import('../modules/rolls/roll-message.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

function device() {
  return {
    type: 'itemDevice', name: 'Deck', uuid: 'Actor.n.Item.d', id: 'd',
    system: {
      isActive: true, type: 'cyberdeck', conditionMonitors: {
        matrix: {
          value: 10, actual: {
            base: 0, value: 0, modifiers: []
          }
        }
      }
    },
    update: vi.fn(async () => {}),
  }
}
function deckOwner() {
  const deck = device()
  return {
    deck, actor: {
      id: 'n', name: 'PNJ', type: 'actorPc', isToken: false, items: [deck],
      system: {
        activeSpecialAttribute: 'magic', matrix: {
          userMode: 'ar', programs: {
            virtualMachine: {
              isActive: false
            }
          }
        }
      },
      takeDamage: vi.fn(async () => {}), rollTest: vi.fn(), testUserPermission: () => false,
    }
  }
}
const card = value => ({
  damage: {
    matrix: {
      value
    }
  }, target: {
  }, owner: {
    messageId: 'm1'
  }
})

beforeEach(() => {
  vi.restoreAllMocks()
  for (const fn of Object.values(matrixCard)) fn.mockReset()
  matrixCard.damageReachable.mockReturnValue(true)
  SR5_SocketHandler.emitForGM.mockReset()
  ui.notifications = {
    info: vi.fn(), warn: vi.fn()
  }
})

describe('applyDamageToDecK answers what happened (D5)', () => {
  it('true when the GM writes it', async () => {
    game.user = {
      isGM: true
    }
    const {
      actor, deck
    } = deckOwner()
    expect(await SR5_MatrixHelpers.applyDamageToDecK(actor, card(3), null, false, 'takeMatrixDamage')).toBe(true)
    expect(deck.update).toHaveBeenCalled()
  })
  it('"relayed" when asked of the active GM, the button named for him to spend', async () => {
    game.user = {
      isGM: false
    }
    game.users = {
      activeGM: {
        id: 'gm', isGM: true
      }
    }
    const {
      actor
    } = deckOwner()
    expect(await SR5_MatrixHelpers.applyDamageToDecK(actor, card(3), null, false, 'takeMatrixDamage')).toBe('relayed')
    expect(SR5_SocketHandler.emitForGM).toHaveBeenCalledWith('updateItem', expect.objectContaining({
      use: 'matrixDamage', messageId: 'm1', button: 'takeMatrixDamage'
    }))
  })
  it('false with no GM connected: nothing asked, the button stays', async () => {
    game.user = {
      isGM: false
    }
    game.users = {
      activeGM: null, find: () => null
    }
    const {
      actor
    } = deckOwner()
    expect(await SR5_MatrixHelpers.applyDamageToDecK(actor, card(3), null, false, 'takeMatrixDamage')).toBe(false)
    expect(SR5_SocketHandler.emitForGM).not.toHaveBeenCalled()
  })
})

describe('chat buttons that write matrix damage (D4)', () => {
  let npc, pc, message
  function click(type) {
    const button = {
      dataset: {
        action: 'nonOpposedTest', type
      }, closest: () => ({
        dataset: {
          messageId: 'm1'
        }
      })
    }
    return SR5_RollMessage.chatButtonAction({
      preventDefault() {}, currentTarget: button
    })
  }
  beforeEach(() => {
    game.user = {
      isGM: true
    }
    npc = deckOwner().actor
    pc = {
      id: 'pc', name: 'Clo', type: 'actorPc', system: {
        matrix: {
          programs: {
            biofeedback: {
              isActive: true
            }
          }
        }
      }, rollTest: vi.fn(), takeDamage: vi.fn(async () => {})
    }
    message = {
      id: 'm1', flags: {
        sr5data: {
          owner: {
            speakerId: 'n', actorId: 'n'
          }, previousMessage: {
            actorId: 'pc'
          }, target: {
          }, test: {
            type: 'matrixResistance', typeSub: 'dataSpike'
          },
          damage: {
            value: 5, matrix: {
              value: 50
            }
          }, chatCard: {
            buttons: {
            }
          },
        }
      }
    }
    game.messages = {
      get: () => message
    }
    globalThis.ChatMessage = {
      getSpeaker: () => ({
      }), create: vi.fn(async () => {})
    }
    foundry.utils.escapeHTML ??= s => String(s)
    game.users = {
      filter: () => [], activeGM: {
        id: 'gm'
      }
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => ({
      n: npc, pc
    })[id] ?? null)
    vi.spyOn(SR5_RollMessage, 'updateChatButtonHelper').mockImplementation(async () => {})
  })

  it('takeMatrixDamage writes nothing from a card that does not stand for the actor', async () => {
    const apply = vi.spyOn(SR5_MatrixHelpers, 'applyDamageToDecK').mockResolvedValue(true)
    matrixCard.cardStandsFor.mockResolvedValue(false)
    await click('takeMatrixDamage')
    expect(apply).not.toHaveBeenCalled()
    expect(SR5_RollMessage.updateChatButtonHelper).not.toHaveBeenCalled()
    matrixCard.cardStandsFor.mockResolvedValue(true)
    await click('takeMatrixDamage')
    expect(apply).toHaveBeenCalled()
    expect(SR5_RollMessage.updateChatButtonHelper).toHaveBeenCalledWith('m1', 'takeMatrixDamage')
  })
  it('takeMatrixDamage leaves the button to the GM when it is relayed (D5)', async () => {
    vi.spyOn(SR5_MatrixHelpers, 'applyDamageToDecK').mockResolvedValue('relayed')
    matrixCard.cardStandsFor.mockResolvedValue(true)
    await click('takeMatrixDamage')
    expect(SR5_RollMessage.updateChatButtonHelper).not.toHaveBeenCalled()
  })
  it('attackerDoBiofeedbackDamage rolls no resistance from a card that does not stand for the actor', async () => {
    matrixCard.cardStandsFor.mockResolvedValue(false)
    await click('attackerDoBiofeedbackDamage')
    expect(npc.rollTest).not.toHaveBeenCalled()
    matrixCard.cardStandsFor.mockResolvedValue(true)
    await click('attackerDoBiofeedbackDamage')
    expect(npc.rollTest).toHaveBeenCalledWith('resistanceCard', null, expect.anything())
  })
  it('defenderDoMatrixDamage writes the boxes read again, and leaves a relayed button to the GM (D5)', async () => {
    message.flags.sr5data.test.type = 'matrixDefense'
    message.flags.sr5data.owner = {
      speakerId: 'pc', actorId: 'pc'
    }
    message.flags.sr5data.previousMessage = {
      actorId: 'n'
    }
    matrixCard.trustedDefenderDamage.mockResolvedValue(3)
    const apply = vi.spyOn(SR5_MatrixHelpers, 'applyDamageToDecK').mockResolvedValue('relayed')
    await click('defenderDoMatrixDamage')
    expect(apply.mock.calls[0][1].damage.matrix.value).toBe(3)
    expect(SR5_RollMessage.updateChatButtonHelper).not.toHaveBeenCalled()
    matrixCard.trustedDefenderDamage.mockResolvedValue(null)
    apply.mockClear()
    await click('defenderDoMatrixDamage')
    expect(apply).not.toHaveBeenCalled()
  })
})

describe('the type of the biofeedback a defender deals back (limit 3)', () => {
  const attacker = mode => ({
    type: 'actorPc', system: {
      matrix: {
        userMode: mode
      }
    }
  })
  const defender = (bio, blackout = false) => ({
    system: {
      matrix: {
        programs: {
          biofeedback: {
            isActive: bio
          }, blackout: {
            isActive: blackout
          }
        }
      }
    }
  })
  it('is read on the sheets: Physical for Biofeedback against hot sim, Stun otherwise, none in AR', () => {
    expect(biofeedbackType(attacker('hotsim'), defender(true))).toBe('physical')
    expect(biofeedbackType(attacker('coldsim'), defender(true))).toBe('stun')
    expect(biofeedbackType(attacker('hotsim'), defender(false, true))).toBe('stun')
    expect(biofeedbackType(attacker('ar'), defender(true))).toBe(null)
    expect(biofeedbackType(attacker('hotsim'), defender(false))).toBe(null)
  })
})
