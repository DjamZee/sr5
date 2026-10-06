import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Popup with Cybercombat + Logic "also inflicts matrix damage equal to the hits" (Kill Code p. 45):
// no Attack base and no +2 per mark, unlike Data Spike (SR5 p. 242). The card dealt 4 hits + 2 for
// one mark = 6 while the prepared roll carried the Attack (7) as a base that nothing used.

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
vi.mock('../modules/rolls/roll-helpers/mark.js', () => ({
  SR5_MarkHelpers: {
    findMarkValue: vi.fn(async () => 1),
  },
}))

globalThis.fromUuid = vi.fn(async () => null)
const {
  default: matrixDefenseInfo
} = await import('../modules/rolls/roll-test-case/test-MatrixDefense.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

function persona(id, {
  hammer = false
} = {
}) {
  return {
    id, type: 'actorPc', name: id, items: [],
    system: {
      matrix: {
        attributes: {
          attack: {
            value: 7
          }
        },
        programs: {
          mugger: {
            isActive: false
          }, guard: {
            isActive: false
          }, hammer: {
            isActive: hammer
          }, biofeedback: {
            isActive: false
          }, blackout: {
            isActive: false
          }
        },
      },
    },
  }
}

function card(typeSub) {
  return {
    test: {
      typeSub
    }, roll: {
      hits: 1
    }, previousMessage: {
      hits: 5, actorId: 'hacker'
    }, target: {
    }, matrix: {
      actionType: 'attack'
    }, damage: {
      matrix: {
        base: 7
      }
    }, owner: {
      speakerActor: 'hacker'
    }, chatCard: {
      buttons: {
      }
    },
  }
}

beforeEach(() => {
  game.i18n.format = vi.fn(k => k)
})

describe('Popup (Cybercombat) matrix damage, Kill Code p. 45', () => {
  it('deals the net hits alone, without Attack nor marks', async () => {
    const hacker = persona('hacker'), target = persona('target')
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'hacker' ? hacker : target)
    const c = card('popupCybercombat')
    await matrixDefenseInfo(c, 'target')
    expect(c.damage.matrix.value).toBe(4)
    expect(c.damage.matrix.modifiers.markQty).toBe(0)
  })

  it('keeps Hammer, which adds to any matrix damage (SR5 p. 247)', async () => {
    const hacker = persona('hacker', {
        hammer: true
      }), target = persona('target')
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'hacker' ? hacker : target)
    const c = card('popupCybercombat')
    await matrixDefenseInfo(c, 'target')
    expect(c.damage.matrix.value).toBe(6)
  })

  it('leaves Data Spike with its Attack base and +2 per mark (SR5 p. 242)', async () => {
    const hacker = persona('hacker'), target = persona('target')
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'hacker' ? hacker : target)
    const c = card('dataSpike')
    await matrixDefenseInfo(c, 'target')
    expect(c.damage.matrix.value).toBe(7 + 4 + 2)
  })
})
