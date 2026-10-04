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
  })
})
