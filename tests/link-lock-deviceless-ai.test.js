import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// An AI outside any device "is immune to link-locking" (Data Trails p. 157). The Lockdown program
// offered "Lock the connection" on its matrix resistance card, and applylinkLockEffect, which the
// program and every IC (Blue Goo, Tar Baby, Blaster, Black, Flicker) go through, set the lock anyway.

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
    updateChatButtonHelper: vi.fn(),
  },
}))
vi.mock('../modules/system/effectsList.js', () => ({
  _getSRStatusEffect: vi.fn(async () => ({
    name: 'linkLock'
  })),
}))

globalThis.fromUuid = vi.fn(async () => null)
const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')
const {
  default: matrixResistanceInfo
} = await import('../modules/rolls/roll-test-case/test-MatrixResistance.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

function persona({
  depth = true, device = false
} = {
}) {
  return {
    id: 'target', type: 'actorPc', name: 'IA',
    items: device ? [{
      type: 'itemDevice', system: {
        isActive: true
      }
    }] : [],
    createEmbeddedDocuments: vi.fn(async () => []),
    system: {
      activeSpecialAttribute: depth ? 'depth' : 'magic',
      matrix: {
        isLinkLocked: false, userMode: 'ar', deviceSubType: '',
      },
    },
  }
}

const decker = {
  id: 'decker', name: 'Décker', system: {
    matrix: {
      programs: {
        lockdown: {
          isActive: true
        }, biofeedback: {
          isActive: false
        }, blackout: {
          isActive: false
        }
      },
      deviceSubType: '',
      actions: {
        jackOut: {
          defense: {
            dicePool: 6
          }
        }
      },
    }
  }
}

beforeEach(() => {
  game.i18n.format = vi.fn(k => k)
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
})

describe('link lock on an AI without a device (Data Trails p. 157)', () => {
  it('sets no lock on an AI outside any device', async () => {
    const ai = persona()
    await SR5_MatrixHelpers.applylinkLockEffect(decker, ai)
    expect(ai.createEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it('still locks an AI inside a device, and anyone else', async () => {
    for (const target of [persona({
      device: true
    }), persona({
      depth: false
    })]) {
      await SR5_MatrixHelpers.applylinkLockEffect(decker, target)
      expect(target.createEmbeddedDocuments).toHaveBeenCalledTimes(2)
    }
  })

  it('offers no "Lock the connection" button against an AI outside any device', async () => {
    const card = () => ({
      previousMessage: {
        actorId: 'decker'
      }, target: {
      }, damage: {
        matrix: {
          base: 5
        }
      }, roll: {
        hits: 1
      }, chatCard: {
        buttons: {
        }
      },
    })
    for (const [target, expected] of [[persona(), false], [persona({
      device: true
    }), true]]) {
      vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'decker' ? decker : target)
      const cardData = card()
      await matrixResistanceInfo(cardData, 'target')
      expect(!!cardData.chatCard.buttons.linkLock).toBe(expected)
    }
  })
})
