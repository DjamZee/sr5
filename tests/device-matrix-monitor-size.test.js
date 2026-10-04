import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// A device is bricked when its matrix monitor is full (SR5 p. 228). applyDamageToDecK read the
// size of the monitor on a copy of the item, which holds the source where it is 0: the first box
// bricked any device, and a dumpshock followed in VR. The size is now read on the prepared item.

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

/** A commlink as Foundry gives it: prepared monitor of 10, a copy that holds the source (size 0) */
function hacker(damage = 0) {
  const prepared = {
    isActive: true, type: 'commlink', conditionMonitors: {
      matrix: {
        value: 10, actual: {
          base: damage, value: damage, modifiers: []
        }
      }
    }
  }
  const device = {
    type: 'itemDevice', name: 'Commlink', uuid: 'Actor.h.Item.cl', system: prepared,
    toJSON: () => ({
      type: 'itemDevice', name: 'Commlink', system: {
        ...prepared, conditionMonitors: {
          matrix: {
            value: 0, actual: {
              base: damage, value: 0, modifiers: []
            }
          }
        }
      }
    }),
    update: vi.fn(async () => {}),
  }
  return {
    device, actor: {
      id: 'h', name: 'Hackeuse', items: [device],
      system: {
        activeSpecialAttribute: 'magic', matrix: {
          userMode: 'hotsim', programs: {
            virtualMachine: {
              isActive: false
            }
          }
        }
      },
      rollTest: vi.fn(),
    }
  }
}

const card = value => ({
  damage: {
    matrix: {
      value
    }
  }, target: {
  }
})

beforeEach(() => {
  vi.restoreAllMocks()
  game.user = {
    isGM: true
  }
  ui.notifications = {
    info: vi.fn(), warn: vi.fn()
  }
  vi.spyOn(foundry.utils, 'duplicate').mockImplementation(o => JSON.parse(JSON.stringify(o.toJSON ? o.toJSON() : o)))
})

describe('Matrix monitor of a device (SR5 p. 228)', () => {
  it('does not brick a device that still has boxes', async () => {
    const {
      actor, device
    } = hacker()
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card(1), null, false)
    const written = device.update.mock.calls[0][0].system
    expect(written.conditionMonitors.matrix.actual.base).toBe(1)
    expect(written.isActive).toBe(true)
    expect(actor.rollTest).not.toHaveBeenCalled()
  })

  it('bricks it once full, keeps no box beyond, and gives a dumpshock in VR', async () => {
    const {
      actor, device
    } = hacker(9)
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card(5), null, false)
    const written = device.update.mock.calls[0][0].system
    expect(written.conditionMonitors.matrix.actual.base).toBe(10)
    expect(written.isActive).toBe(false)
    expect(actor.rollTest).toHaveBeenCalled()
  })
})
