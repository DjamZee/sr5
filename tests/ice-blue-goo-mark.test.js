import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Kill Code p. 74: when Blue Goo's explosion hits, "l'avatar voit sa connexion verrouillée par le serveur", resists
// (Attack) DV, "et le serveur pose une mark sur lui". The card offered the link lock and the damage, never the mark.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    generateChatButton: (type, action, label) => ({
      type, action, label
    }),
  },
}))

globalThis.fromUuid = vi.fn(async () => null)
const {
  default: iceDefenseInfo
} = await import('../modules/rolls/roll-test-case/test-IceDefense.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')

const ice = {
  id: 'ice', name: 'Blue Goo', system: {
    matrix: {
      attributes: {
        attack: {
          value: 4
        }
      }
    }
  }
}

const decker = {
  id: 'decker', type: 'actorPc', name: 'Decker', items: [], system: {
    matrix: {
      marks: [], isLinkLocked: false, attributes: {
      }
    },
  },
}

function card(typeSub) {
  return {
    test: {
      typeSub
    }, roll: {
      hits: 0
    }, previousMessage: {
      hits: 2, actorId: 'ice'
    }, target: {
    }, damage: {
      matrix: {
        value: 0
      }
    }, matrix: {
    }, owner: {
      speakerActor: 'Blue Goo'
    }, chatCard: {
      buttons: {
      }
    },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  game.i18n.format = vi.fn(k => k)
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'ice' ? ice : decker)
  vi.spyOn(SR5_MatrixHelpers, 'updateMatrixDamage').mockImplementation(async data => data)
})

describe('Blue Goo (Kill Code p. 74)', () => {
  it('offers the mark of the server beside the link lock and the damage', async () => {
    const data = card('iceBlueGoo')
    await iceDefenseInfo(data, 'decker')
    expect(data.matrix.mark).toBe(1)
    expect(data.chatCard.buttons.attackerPlaceMark).toBeDefined()
    expect(data.chatCard.buttons.iceEffect).toBeDefined()
    expect(data.chatCard.buttons.matrixResistance).toBeDefined()
  })

  // "L'avatar doit résister une VD de (Attaque)": no net hits, no +2 per mark, unlike the IC of SR5 p. 250
  it('deals the Attack alone as the DV of its explosion', async () => {
    const data = card('iceBlueGoo')
    data.various = {
      blueGooExplosion: true
    }
    await iceDefenseInfo(data, 'decker')
    expect(SR5_MatrixHelpers.updateMatrixDamage).not.toHaveBeenCalled()
    expect(data.damage.matrix.value).toBe(4)
    expect(data.chatCard.buttons.iceEffect).toBeDefined()
    expect(data.chatCard.buttons.attackerPlaceMark).toBeDefined()
  })

  it('leaves its ordinary attack as it was', async () => {
    const data = card('iceBlueGoo')
    await iceDefenseInfo(data, 'decker')
    expect(SR5_MatrixHelpers.updateMatrixDamage).toHaveBeenCalledTimes(1)
  })

  it('marks the attack card of its explosion, and only for a Blue Goo', async () => {
    const {
      default: iceAttack
    } = await import('../modules/rolls/roll-prepare-case/rollData-IceAttack.js')
    const rollData = () => ({
      test: {
      }, dicePool: {
      }, limit: {
      }, combat: {
        actions: []
      }, damage: {
        matrix: {
        }
      }, various: {
      }
    })
    const actor = subType => ({
      system: {
        matrix: {
          deviceRating: 3, deviceSubType: subType, attributes: {
            attack: {
              value: 4
            }
          }, ice: {
            attackDicepool: 6
          }
        }
      }
    })
    expect(iceAttack(rollData(), actor('iceBlueGoo'), 'blueGooExplosion').various.blueGooExplosion).toBe(true)
    expect(iceAttack(rollData(), actor('iceBlueGoo'), null).various.blueGooExplosion).toBeUndefined()
    expect(iceAttack(rollData(), actor('iceKiller'), 'blueGooExplosion').various.blueGooExplosion).toBeUndefined()
  })

  it('leaves the other damaging ICs without a mark', async () => {
    const data = card('iceKiller')
    await iceDefenseInfo(data, 'decker')
    expect(data.chatCard.buttons.attackerPlaceMark).toBeUndefined()
  })
})
