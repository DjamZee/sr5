import {
  describe, it, expect, vi
} from 'vitest'

// SR5 p. 241: a Snoop that gets through lets the hacker view what the snooped device sends.
// On a drone or a device, the defense card offers to see through it.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    generateChatButton: (type, action, label) => ({
      type, action, label
    }),
    updateChatButtonHelper: () => {},
  },
}))
vi.mock('../modules/rolls/roll-helpers/matrix.js', () => ({
  SR5_MatrixHelpers: {
  },
}))

const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  default: matrixDefenseInfo
} = await import('../modules/rolls/roll-test-case/test-MatrixDefense.js')

const snoopCard = (attackerHits, defenderHits) => ({
  test: {
    typeSub: 'snoop'
  },
  previousMessage: {
    hits: attackerHits, actorId: 'h1'
  },
  roll: {
    hits: defenderHits
  },
  target: {
  },
  matrix: {
    actionType: 'sleaze', mark: 1
  },
  owner: {
  },
  damage: {
    isAttack: false, matrix: {
    }
  },
  chatCard: {
    buttons: {
    }
  },
})

const icon = type => ({
  id: 'd1', name: 'Caméra du hall', type, system: {
    matrix: {
      deviceType: 'device', programs: {
        biofeedback: {
          isActive: false
        }, blackout: {
          isActive: false
        }
      }
    }
  }
})

describe('Snoop on a drone or a device (SR5 p. 241)', () => {
  it('a Snoop that gets through a camera offers to see through it', async () => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'd1' ? icon('actorDevice') : icon('actorPc')))
    const card = snoopCard(4, 1)
    await matrixDefenseInfo(card, 'd1')
    expect(card.chatCard.buttons.snoopVision?.action).toBe('snoopVision')
  })

  it('on a drone as well', async () => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'd1' ? icon('actorDrone') : icon('actorPc')))
    const card = snoopCard(4, 1)
    await matrixDefenseInfo(card, 'd1')
    expect(card.chatCard.buttons.snoopVision).toBeDefined()
  })

  it('a persona sends no picture to the map: no button', async () => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(() => icon('actorPc'))
    const card = snoopCard(4, 1)
    await matrixDefenseInfo(card, 'd1')
    expect(card.chatCard.buttons.snoopVision).toBeUndefined()
  })

  it('a Snoop that fails gives nothing to see', async () => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'd1' ? icon('actorDevice') : icon('actorPc')))
    const card = snoopCard(1, 3)
    await matrixDefenseInfo(card, 'd1')
    expect(card.chatCard.buttons.snoopVision).toBeUndefined()
  })
})
