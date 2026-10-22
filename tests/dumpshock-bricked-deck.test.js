import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// N47: the deck of a hacker in VR is bricked, and the dumpshock card never shows (SR5 p. 229).
// The card was a bare { damage } object, and the resistance card read chatData.owner.messageId on it.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')

function hacker() {
  const device = {
    type: 'itemDevice', name: 'Deck', uuid: 'Actor.h.Item.dk',
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
  return {
    id: 'h', name: 'Hackeuse', img: 'h.png', isToken: false,
    items: [device],
    system: {
      activeSpecialAttribute: 'resonance',
      matrix: {
        userMode: 'hotsim', programs: {
          virtualMachine: {
            isActive: false
          }
        },
        resistances: {
          dumpshock: {
            dicePool: 7, modifiers: []
          }
        }
      },
    },
    rollTest: vi.fn(),
  }
}

beforeEach(() => {
  game.user = {
    isGM: true, id: 'u'
  }
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
    owner: {
    }, roll: {
    }, damage: {
    }
  }))
  ui.notifications = {
    info: vi.fn(), warn: vi.fn()
  }
})

describe('Dumpshock when a deck is bricked in VR (SR5 p. 229)', () => {
  it('gives the resistance card the owner and roll it reads', async () => {
    const actor = hacker()
    await SR5_MatrixHelpers.applyDamageToDecK(actor, {
      damage: {
        matrix: {
          value: 12
        }
      }, target: {
      }
    }, null, false)
    expect(actor.rollTest).toHaveBeenCalledTimes(1)
    const [type, , chatData] = actor.rollTest.mock.calls[0]
    expect(type).toBe('resistanceCard')
    expect(chatData.damage.resistanceType).toBe('dumpshock')
    expect(chatData.owner).toBeDefined()
    expect(chatData.roll).toBeDefined()
    // SR5 p. 231: "you don't have a functional Firewall attribute any more, so only use your Willpower"
    expect(chatData.damage.bricked).toBe(true)
  })

  it('throws the character out the reboot\'s way, once the brick is written, with no second dumpshock (Fulbert#8023)', async () => {
    const actor = hacker()
    const order = []
    actor.items[0].update = vi.fn(async () => order.push('brick'))
    actor.rebootDeck = vi.fn(async () => order.push('reboot'))
    await SR5_MatrixHelpers.applyDamageToDecK(actor, {
      damage: {
        matrix: {
          value: 12
        }
      }, target: {
      }
    }, null, false)
    expect(order).toEqual(['brick', 'reboot'])
    expect(actor.rebootDeck).toHaveBeenCalledWith(null, {
      dumpshock: false, notify: false
    })
    expect(actor.rollTest).toHaveBeenCalledTimes(1)
  })

  it('leaves a character in AR, or a device not in use, as it is', async () => {
    const inAR = hacker()
    inAR.system.matrix.userMode = 'ar'
    const spare = hacker()
    spare.items[0].system.isActive = false
    const savedFromUuid = globalThis.fromUuid
    // The spare device is aimed at by its uuid
    globalThis.fromUuid = async () => spare.items[0]
    try {
      for (const [actor, target] of [[inAR, {
      }], [spare, {
        itemUuid: 'Actor.h.Item.dk'
      }]]) {
        actor.rebootDeck = vi.fn(async () => {})
        await SR5_MatrixHelpers.applyDamageToDecK(actor, {
          damage: {
            matrix: {
              value: 12
            }
          }, target
        }, null, false)
        expect(actor.rebootDeck).not.toHaveBeenCalled()
      }
    } finally {
      globalThis.fromUuid = savedFromUuid
    }
  })

  it('bricked by a player, the dumpshock is left to the GM\'s browser, never opened on the attacker\'s screen', async () => {
    game.user = {
      isGM: false, id: 'p'
    }
    game.users = {
      activeGM: {
        id: 'gm', isGM: true
      }
    }
    const {
      SR5_SocketHandler
    } = await import('../modules/socket.js')
    SR5_SocketHandler.emitForGM.mockClear()
    const actor = hacker()
    await SR5_MatrixHelpers.applyDamageToDecK(actor, {
      damage: {
        matrix: {
          value: 12
        }
      }, target: {
      }, owner: {
        messageId: 'm1'
      }
    }, null, false)
    expect(actor.rollTest).not.toHaveBeenCalled()
    const [type, data] = SR5_SocketHandler.emitForGM.mock.calls.at(-1)
    expect(type).toBe('updateItem')
    expect(data.use).toBe('matrixDamage')
    expect(data.info.isActive).toBe(false)
  })

  it('resists a bricked deck dumpshock with Willpower alone, the other dumpshocks with Willpower + Firewall', async () => {
    const {
      resistance
    } = await import('../modules/rolls/roll-prepare-case/index.js')
    const actor = hacker()
    actor.type = 'actorPc'
    actor.system.matrix.resistances.dumpshock.modifiers = [{
      source: 'Volonté', type: 'linkedAttribute', value: 4
    }, {
      source: 'Firewall', type: 'matrixAttribute', value: 3
    }]
    const pool = async (bricked) => {
      const rollData = {
        test: {
        }, dicePool: {
        }, damage: {
        }, combat: {
          grenade: {
          }
        }, threshold: {
        }, owner: {
        }, target: {
        }, magic: {
        }, matrix: {
        }, previousMessage: {
        },
      }
      const chatData = {
        damage: {
          resistanceType: 'dumpshock', ...(bricked ? {
            bricked: true
          } : {
          })
        }, combat: {
          grenade: {
          }
        }, owner: {
        }, target: {
        }, roll: {
        }, test: {
        }, previousMessage: {
        },
      }
      const prepared = await resistance(rollData, 'resistanceCard', actor, chatData)
      return [prepared.dicePool.base, prepared.dicePool.composition.map(m => m.source)]
    }
    expect(await pool(true)).toEqual([4, ['Volonté']])
    expect(await pool(false)).toEqual([7, ['Volonté', 'Firewall']])
    // A brick the GM wrote for a player: the deck is off when the window is prepared, its pool empty (instance 10)
    actor.system.matrix.resistances.dumpshock = {
      dicePool: 0, modifiers: []
    }
    actor.system.attributes = {
      willpower: {
        augmented: {
          value: 5
        }
      }
    }
    expect((await pool(true))[0]).toBe(5)
  })
})
