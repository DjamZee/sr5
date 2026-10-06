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
  })
})
