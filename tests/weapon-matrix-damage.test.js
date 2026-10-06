import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// DSP weapons (Street Lethal p. 56-57): "Cette arme inflige des dommages matriciels […] résistés avec Indice
// d'Appareil + Firewall". A third weapon damage type, "matrix" (decision H6 of DjamZ): the hit is defended as any
// weapon, then resisted and applied through the matrix chain, on the device in reach; nothing without one.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    generateChatButton: (testType, actionType, label) => ({
      testType, actionType, label
    }),
    updateChatButtonHelper: vi.fn(),
  },
}))

globalThis.fromUuid = vi.fn(async () => null)
const {
  WEAPON_MATRIX_DAMAGE, hasMatrixMonitorInReach, weaponMatrixResistance
} = await import('../modules/rolls/roll-helpers/weapon-matrix-damage.js')
const {
  default: matrixResistanceInfo
} = await import('../modules/rolls/roll-test-case/test-MatrixResistance.js')
const {
  default: attackInfo
} = await import('../modules/rolls/roll-test-case/test-Attack.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const {
  SR5
} = await import('../modules/config.js')

const button = SR5_RollMessage.generateChatButton
const device = (isActive = true, type = 'commlink') => ({
  type: 'itemDevice', system: {
    isActive, type
  }
})
const character = (items = [], type = 'actorPc') => ({
  id: 'target', type, name: 'Cible', items, system: {
    matrix: {
      userMode: 'hotsim', deviceSubType: '', programs: {
      }
    }
  }
})
// A decker shooting: his programs must play no part in a weapon's pulse
const shooter = {
  id: 'shooter', name: 'Tireur', system: {
    matrix: {
      programs: {
        lockdown: {
          isActive: true
        }, biofeedback: {
          isActive: true
        }, blackout: {
          isActive: false
        }
      }, deviceSubType: '',
    }
  }
}
const card = (extra = {
}) => ({
  previousMessage: {
    actorId: 'shooter', messageId: 'attack'
  }, target: {
  }, damage: {
    type: WEAPON_MATRIX_DAMAGE, value: 17, matrix: {
      base: 17, value: 0
    }
  }, roll: {
    hits: 4
  }, chatCard: {
    buttons: {
    }
  }, ...extra,
})

beforeEach(() => {
  game.i18n.format = vi.fn(k => k)
  game.i18n.localize = vi.fn(k => k)
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
})

describe('the weapon damage types', () => {
  it('a weapon may deal matrix damage; the other lists (toxins, astral, choice dialog) stay as they were', () => {
    expect(Object.keys(SR5.weaponDamageTypes)).toEqual(['stun', 'physical', 'matrix'])
    expect(Object.keys(SR5.damageTypes)).toEqual(['stun', 'physical'])
    expect(SR5.damageTypesShort.matrix).toBe('SR5.DamageTypeMatrixShort')
  })
})

describe('what a DSP pulse reaches', () => {
  it('the active device of a character, a technomancer\'s living persona, a drone, a device', () => {
    expect(hasMatrixMonitorInReach(character([device()]))).toBe(true)
    expect(hasMatrixMonitorInReach(character([device(true, 'livingPersona')]))).toBe(true)
    expect(hasMatrixMonitorInReach(character([device()], 'actorGrunt'))).toBe(true)
    expect(hasMatrixMonitorInReach(character([], 'actorDrone'))).toBe(true)
    expect(hasMatrixMonitorInReach(character([], 'actorDevice'))).toBe(true)
  })
  it('nothing without an active device, nor a spirit, a sprite or an agent', () => {
    expect(hasMatrixMonitorInReach(character([]))).toBe(false)
    expect(hasMatrixMonitorInReach(character([device(false)]))).toBe(false)
    for (const type of ['actorSpirit', 'actorSprite', 'actorAgent']) expect(hasMatrixMonitorInReach(character([device()], type))).toBe(false)
  })
})

describe('after the defense', () => {
  it('the matrix resistance, with the damage value of the hit, no Body, no armor', () => {
    const cardData = card()
    weaponMatrixResistance(cardData, character([device()]), button)
    expect(cardData.damage.matrix.value).toBe(17)
    expect(cardData.chatCard.buttons.matrixResistance.actionType).toBe('matrixResistance')
    expect(cardData.chatCard.buttons.resistanceCard).toBeUndefined()
  })
  it('no device in reach: the test ends, nothing to resist', () => {
    const cardData = card()
    weaponMatrixResistance(cardData, character([]), button)
    expect(cardData.chatCard.buttons.matrixResistance).toBeUndefined()
    expect(cardData.chatCard.buttons.actionEnd.label).toBe('SR5.WeaponMatrixDamageNoDevice')
  })
})

describe('the resistance card', () => {
  it('neither biofeedback nor link lock from the shooter\'s programs, the damage to apply', async () => {
    globalThis.game.messages = new Map()
    const target = character([device()])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'shooter' ? shooter : target)
    const cardData = card()
    await matrixResistanceInfo(cardData, 'target')
    expect(cardData.damage.matrix.value).toBe(13)
    expect(cardData.chatCard.buttons.takeMatrixDamage).toBeDefined()
    expect(cardData.chatCard.buttons.attackerDoBiofeedbackDamage).toBeUndefined()
    expect(cardData.chatCard.buttons.linkLock).toBeUndefined()
  })
  it('a matrix attack still gets them', async () => {
    globalThis.game.messages = new Map()
    const target = character([device()])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'shooter' ? shooter : target)
    const cardData = card()
    cardData.damage.type = ''
    cardData.target.itemUuid = 'deck'
    globalThis.fromUuid = vi.fn(async () => ({
      type: 'itemDevice'
    }))
    await matrixResistanceInfo(cardData, 'target')
    expect(cardData.chatCard.buttons.linkLock).toBeDefined()
    expect(cardData.chatCard.buttons.attackerDoBiofeedbackDamage).toBeDefined()
    globalThis.fromUuid = vi.fn(async () => null)
  })
  it('a DSP grenade keeps its button for the other devices in the blast; a defense card loses it', async () => {
    const target = character([device()])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'shooter' ? shooter : target)
    for (const [testType, removed] of [['opposedTest', false], ['nonOpposedTest', true]]) {
      SR5_RollMessage.updateChatButtonHelper.mockClear()
      globalThis.game.messages = new Map([['attack', {
        flags: {
          sr5data: {
            chatCard: {
              buttons: {
                matrixResistance: {
                  testType
                }
              }
            }
          }
        }
      }]])
      await matrixResistanceInfo(card(), 'target')
      expect(SR5_RollMessage.updateChatButtonHelper.mock.calls.length > 0).toBe(removed)
    }
  })
})

describe('a DSP grenade', () => {
  it('offers the matrix resistance to each target, not the damage resistance', async () => {
    const cardData = {
      test: {
        typeSub: 'grenade'
      }, combat: {
        choke: {
        }, grenade: {
          isGrenade: true
        }
      }, damage: {
        type: WEAPON_MATRIX_DAMAGE, base: 10, value: 0, matrix: {
          value: 0
        }
      }, roll: {
        hits: 3
      }, chatCard: {
        buttons: {
        }
      },
    }
    await attackInfo(cardData)
    expect(cardData.damage.matrix.value).toBe(10)
    expect(cardData.chatCard.buttons.matrixResistance.testType).toBe('opposedTest')
    expect(cardData.chatCard.buttons.resistanceCard).toBeUndefined()
  })
})
