import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// N69: when the device aimed at was deleted between the defense and Apply, applyDamageToDecK fell back
// on the active device and damaged it in silence. Now it warns and damages no device.

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

function target() {
  const deck = {
    type: 'itemDevice', name: 'Cyberdeck', uuid: 'Actor.a.Item.deck',
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
    deck, actor: {
      id: 'a', name: 'Cible', items: [deck],
      system: {
        activeSpecialAttribute: 'resonance', matrix: {
          userMode: 'ar', programs: {
            virtualMachine: {
              isActive: false
            }
          }
        }
      },
      rollTest: vi.fn(), takeDamage: vi.fn(),
    }
  }
}

beforeEach(() => {
  globalThis.game = {
    i18n: {
      localize: k => k, format: k => k
    }, user: {
      isGM: true
    }
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.fromUuid = vi.fn(async () => null)
})

describe('matrix damage aimed at a deleted device', () => {
  it('warns and damages no other device', async () => {
    const {
      actor, deck
    } = target()
    await SR5_MatrixHelpers.applyDamageToDecK(actor, {
      damage: {
        matrix: {
          value: 5
        }
      }, target: {
        itemUuid: 'Actor.a.Item.gone'
      }
    }, null, false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_MatrixDamageDeviceMissing')
    expect(deck.update).not.toHaveBeenCalled()
    expect(actor.takeDamage).not.toHaveBeenCalled()
  })
})
