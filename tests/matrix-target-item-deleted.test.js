import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

//The matrix card as a GM wrote it: its reading again is tested in matrix-card.test.js
vi.mock('../modules/rolls/roll-helpers/matrix-card.js', () => ({
  trustedMatrixAction: async chatData => ({
    hits: chatData?.roll?.hits, actionType: chatData?.matrix?.actionType
  }),
  cardStandsFor: async () => true,
  trustedDefenderDamage: async (id, claimed) => claimed,
  damageReachable: () => true,
  tellMatrixCard: async () => {},
}))

// N67: the item a card aims at may be deleted before the next button is clicked. fromUuid() then
// returns null and reading .system threw. Every reader now warns and stops, opening no dialog.

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
  SR5_ThirdPartyHelpers
} = await import('../modules/rolls/roll-helpers/thirdparty.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  default: matrixResistance
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixResistance.js')

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

const gone = {
  itemUuid: 'Actor.a.Item.gone', actorId: 'a'
}

describe('a targeted item deleted before the next button', () => {
  it('matrix resistance warns and opens no dialog', async () => {
    const actor = {
      system: {
        matrix: {
          resistances: {
            matrixDamage: {
              modifiers: []
            }
          }
        }
      }
    }
    const rollData = {
      test: {
      }, dicePool: {
        modifiers: []
      }, target: {
      }, matrix: {
      }, damage: {
        matrix: {
        }
      }, previousMessage: {
      }
    }
    const chatData = {
      target: gone, damage: {
        matrix: {
          value: 4
        }
      }, matrix: {
      }
    }
    await expect(matrixResistance(rollData, actor, chatData)).resolves.toBeUndefined()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_MatrixResistanceDeviceMissing')
  })

  it('a Flicker IC warns instead of throwing', async () => {
    const target = {
      system: {
        matrix: {
          isLinkLocked: true
        }
      }
    }
    await SR5_MatrixHelpers.applyIceEffect({
      test: {
        typeSub: 'iceFlicker'
      }, target: gone
    }, {
      id: 'ice'
    }, target)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetItemMissing')
  })

  it.each([
    ['desactivateFocus', c => SR5_ThirdPartyHelpers.desactivateFocus(c)],
    ['reduceTransferedEffect', c => SR5_ThirdPartyHelpers.reduceTransferedEffect(c)],
    ['applyEffectToItem', c => SR5_ThirdPartyHelpers.applyEffectToItem(c, 'decreaseAccuracy')],
  ])('%s warns instead of throwing', async (_, run) => {
    await expect(run({
      target: gone, roll: {
        netHits: 2
      }
    })).resolves.not.toThrow()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetItemMissing')
  })

  it.each([
    ['counterspelling', 'spell'],
    ['disenchanting', 'spell'],
    ['killComplexForm', 'resonanceAction'],
  ])('%s resistance warns and opens no dialog', async (typeSub, type) => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue({
      id: 'a', type: 'actorPc', system: {
      }
    })
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
      previousMessage: {
      }, test: {
      }, dicePool: {
      }, target: {
      }, magic: {
      }
    })
    await expect(SR5_ThirdPartyHelpers.createItemResistance({
      test: {
        type, typeSub
      }, target: gone, owner: {
        actorId: 'o'
      }, roll: {
        hits: 3
      }
    }, 'm')).resolves.toBeUndefined()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_TargetItemMissing')
  })
})
