import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const {
  SR5_RollTest
} = await import('../modules/rolls/roll-test.js')

// SR5 p. 207: a natural recovery test heals once, when it ends. Measured in game (lot 17c): once "Soigner 4P" was
// clicked, "Nouveau jet" added a roll to the same card (6 hits) and offered "Soigner 6P", 10 boxes from 6 hits
describe('extendedRoll after the healing is applied', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.ui = {
      notifications: {
        warn: vi.fn()
      }
    }
    globalThis.game ??= {
    }
    globalThis.game.i18n = {
      localize: (k) => k
    }
  })

  it('refuses a new roll on a card whose healing was applied', async () => {
    const rollDice = vi.spyOn(SR5_RollTest, 'rollDice')
    const message = {
      flags: {
        sr5data: {
          extendedTest: false,
          test: {
            type: 'healing', typeSub: 'physical', extended: {
              roll: 2
            }
          }
        }
      }
    }
    const actor = {
      system: {
        conditionMonitors: {
          stun: {
            actual: {
              value: 0
            }
          }, physical: {
            actual: {
              value: 4
            }
          }
        }
      }
    }
    const result = await SR5_RollTest.extendedRoll(message, actor)
    expect(result).toBe(false)
    expect(rollDice).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_ExtendedTestOver')
  })
})
