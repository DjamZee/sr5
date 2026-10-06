import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// An AI on a device shares its matrix monitor, and is dissipated when it fills or the device is
// bricked (Data Trails p. 161). The device went to 14/10 and the AI stayed up, with a dumpshock card
// on top. Now: the monitor stops at its boxes, the AI is dissipated, and no dumpshock (DjamZ, 04/10).

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
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

function target(depth) {
  const device = {
    type: 'itemDevice', name: 'Commlink', uuid: 'Actor.a.Item.cl',
    system: {
      isActive: true, type: 'commlink', conditionMonitors: {
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
    device, actor: {
      id: 'a', name: 'Cible', isToken: false,
      items: [device],
      system: {
        activeSpecialAttribute: depth ? 'depth' : 'magic',
        matrix: {
          userMode: 'hotsim', programs: {
            virtualMachine: {
              isActive: false
            }
          }
        },
      },
      rollTest: vi.fn(),
      takeDamage: vi.fn(),
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
  vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockImplementation(() => ({
    owner: {
    }, roll: {
    }, damage: {
    }
  }))
  ui.notifications = {
    info: vi.fn(), warn: vi.fn()
  }
  vi.spyOn(SR5_ActorHelper, 'createDeadEffect').mockImplementation(async () => {})
})

describe('Device of an AI bricked (Data Trails p. 161)', () => {
  it('dissipates the AI, keeps the monitor at its boxes, and rolls no dumpshock', async () => {
    const {
      actor, device
    } = target(true)
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card(14), null, false)
    const written = device.update.mock.calls[0][0].system
    expect(written.conditionMonitors.matrix.actual.base).toBe(10)
    expect(written.isActive).toBe(false)
    //14 boxes on a monitor of 10: 4 of overflow, the hint of the GM's dissipation card
    expect(SR5_ActorHelper.createDeadEffect).toHaveBeenCalledWith('a', {
      surplus: 4, itemUuid: 'Actor.a.Item.cl'
    })
    expect(actor.rollTest).not.toHaveBeenCalled()
  })

  it('asks the GM to dissipate the AI when a player deals the damage', async () => {
    const {
      SR5_SocketHandler
    } = await import('../modules/socket.js')
    SR5_SocketHandler.emitForGM.mockClear()
    game.user = {
      isGM: false
    }
    //A GM connected to relay to (with none, nothing is written: matrix-card lot)
    const users = game.users
    game.users = {
      activeGM: {
        id: 'gm', isGM: true
      }
    }
    const {
      actor
    } = target(true)
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card(14), null, false)
    game.users = users
    expect(SR5_ActorHelper.createDeadEffect).not.toHaveBeenCalled()
    expect(SR5_SocketHandler.emitForGM).toHaveBeenCalledWith('createDeadEffect', {
      actorId: 'a', itemUuid: 'Actor.a.Item.cl', surplus: 4,
    })
  })

  it('leaves an AI whose device is not full alone', async () => {
    const {
      actor
    } = target(true)
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card(4), null, false)
    expect(SR5_ActorHelper.createDeadEffect).not.toHaveBeenCalled()
  })

  it('still gives a hacker in VR a dumpshock and no death', async () => {
    const {
      actor
    } = target(false)
    await SR5_MatrixHelpers.applyDamageToDecK(actor, card(14), null, false)
    expect(actor.rollTest).toHaveBeenCalled()
    expect(SR5_ActorHelper.createDeadEffect).not.toHaveBeenCalled()
  })
})
