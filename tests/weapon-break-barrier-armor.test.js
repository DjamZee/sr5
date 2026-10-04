import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/rolls/roll-message.js', () => ({
  SR5_RollMessage: {
    generateChatButton: (cls, action, label) => ({
      cls, action, label
    }),
  },
}))
vi.mock('../modules/entities/helpers.js', () => ({
  SR5_EntityHelpers: {
  },
}))

const {
  default: resistanceResultInfo, weaponBreakFails
} = await import('../modules/rolls/roll-test-case/test-ResistanceResult.js')

// SR5 p. 198 and Run & Gun p. 125: the weapon resists as a barrier
describe('Break weapon: the modified DV must beat the Armor modified by AP', () => {
  it('fails when the DV is lower than or equal to the Armor', () => {
    expect(weaponBreakFails({
      damage: 8, armor: 8
    })).toBe(true)
    expect(weaponBreakFails({
      damage: 9, armor: 8
    })).toBe(false)
  })

  it('lowers the Armor by the AP', () => {
    expect(weaponBreakFails({
      damage: 8, armor: 8, armorPenetration: -2
    })).toBe(false)
    expect(weaponBreakFails({
      damage: 1, armor: 2, armorPenetration: -4
    })).toBe(false)
  })

  it('ends the test on a heavy weapon (Structure 6, Armor 8) hit by DV 7, which used to be damaged', async () => {
    const info = vi.fn()
    globalThis.ui = {
      notifications: {
        info
      }
    }
    globalThis.game = {
      i18n: {
        localize: k => k, format: k => k
      }, messages: {
        get: () => null
      }
    }
    const cardData = {
      previousMessage: {
        hits: 0
      }, roll: {
        hits: 2
      }, damage: {
        value: 7
      }, combat: {
        structure: 6, barrierArmor: 8, armorPenetration: 0
      }, target: {
      }, magic: {
        drain: {
          value: 0
        }
      }, chatCard: {
        buttons: {
        }
      }, effects: {
      },
    }
    await resistanceResultInfo(cardData, "weaponResistance")
    expect(info).toHaveBeenCalledWith("SR5.INFO_BarrierArmorGreaterThanDV")
    expect(cardData.chatCard.buttons.actionEnd).toBeDefined()
  })
})

// N86: a weapon that cannot lose Accuracy or Reach used to file its button under the "undefined" key
describe('Break weapon: no applicable effect', () => {
  it('files the "no effect" button under a named key', async () => {
    globalThis.ui = {
      notifications: {
        info: vi.fn()
      }
    }
    globalThis.game = {
      i18n: {
        localize: k => k, format: k => k
      }, messages: {
        get: () => null
      }
    }
    const cardData = {
      previousMessage: {
        hits: 0
      }, roll: {
        hits: 0
      }, damage: {
        value: 9
      }, combat: {
        barrierArmor: 2, armorPenetration: 0
      }, target: {
      }, magic: {
        drain: {
          value: 0
        }
      }, chatCard: {
        buttons: {
        }
      }, effects: {
      },
    }
    await resistanceResultInfo(cardData, "weaponResistance")
    expect(Object.keys(cardData.chatCard.buttons)).not.toContain("undefined")
    expect(cardData.chatCard.buttons.noEffectApplicable.label).toBe("SR5.NoEffectApplicable")
  })
})
