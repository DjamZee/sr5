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
}))

// config.js writes CONFIG.statusEffects while it is being imported
globalThis.CONFIG ??= {
}
const {
  default: matrixDefense
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixDefense.js')

// N62: a device deleted between the attack card and the defense button gave fromUuid() null, and reading
// .system on it threw. The defense must warn and abort (undefined: the caller opens no dialog)
describe('matrix defense against a deleted device', () => {
  beforeEach(() => {
    globalThis.game = {
      i18n: {
        localize: k => k, format: k => k
      }
    }
    globalThis.ui = {
      notifications: {
        warn: vi.fn(), info: vi.fn()
      }
    }
    globalThis.fromUuid = vi.fn(async () => null)
  })

  it('warns instead of throwing', async () => {
    const actor = {
      type: 'actorPc', system: {
        matrix: {
          actions: {
            dataSpike: {
              defense: {
                modifiers: [], dicePool: 6
              }
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
      }
    }
    const chatData = {
      roll: {
        hits: 3
      }, target: {
        itemUuid: 'Actor.a.Item.gone'
      }
    }
    await expect(matrixDefense(rollData, 'dataSpike', actor, chatData)).resolves.toBeUndefined()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_MatrixTargetDeviceMissing')
  })
})
