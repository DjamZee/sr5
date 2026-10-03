import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_RollTest
} = await import('../modules/rolls/roll-test.js')

// SR5 p. 207: Physical damage does not heal naturally while Stun damage remains, Stun heals first.
// First aid (p. 206) and Medicine (p. 208) are not bound by this order.
function patient(stun, physical){
  const system = {
    conditionMonitors: {
      stun: {
        value: 10, actual: {
          base: stun, value: stun
        }
      },
      physical: {
        value: 10, aggravated: 0, actual: {
          base: physical, value: physical
        }
      },
    }
  }
  const actor = {
    system,
    update: vi.fn(async () => {}),
  }
  actor.toObject = () => JSON.parse(JSON.stringify({
    system
  }))
  return actor
}

describe('stunBlocksNaturalHealing', () => {
  it('blocks natural physical healing while Stun damage remains', () => {
    expect(SR5_ActorHelper.stunBlocksNaturalHealing(patient(2, 4).system, 'healing', 'physical')).toBe(true)
  })
  it('lets natural physical healing go once Stun is healed', () => {
    expect(SR5_ActorHelper.stunBlocksNaturalHealing(patient(0, 4).system, 'healing', 'physical')).toBe(false)
  })
  it('never blocks natural Stun healing', () => {
    expect(SR5_ActorHelper.stunBlocksNaturalHealing(patient(2, 4).system, 'healing', 'stun')).toBe(false)
  })
  it('does not apply to first aid, which has no natural healing test type', () => {
    expect(SR5_ActorHelper.stunBlocksNaturalHealing(patient(2, 4).system, undefined, 'physical')).toBe(false)
  })
  it('does not apply to a single condition monitor', () => {
    expect(SR5_ActorHelper.stunBlocksNaturalHealing({
      conditionMonitors: {
        condition: {
          actual: {
            value: 3
          }
        }
      }
    }, 'healing', 'condition')).toBe(false)
  })
})

describe('heal', () => {
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
    // The actor double carries its own toObject, a structured clone would drop it
    vi.spyOn(foundry.utils, 'deepClone').mockImplementation((a) => a)
    vi.spyOn(SR5_ActorHelper, 'clearDamageKnockout').mockImplementation(async () => {})
  })

  it('refuses a natural physical healing card while Stun damage remains', async () => {
    const actor = patient(2, 4)
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    const result = await SR5_ActorHelper.heal('a', {
      test: {
        type: 'healing', typeSub: 'physical'
      }, roll: {
        netHits: 3
      }
    })
    expect(result).toBe(false)
    expect(actor.update).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_StunHealsFirst')
  })

  it('still lets first aid heal Physical boxes while Stun damage remains', async () => {
    const actor = patient(2, 4)
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    await SR5_ActorHelper.heal('a', {
      test: {
        typeSub: 'physical'
      }, roll: {
        netHits: 3
      }
    })
    expect(actor.update).toHaveBeenCalled()
    expect(actor.update.mock.calls[0][0].system.conditionMonitors.physical.actual.base).toBe(1)
  })
})

describe('extendedRoll', () => {
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

  it('refuses the next roll of a natural physical recovery while Stun damage remains', async () => {
    const rollDice = vi.spyOn(SR5_RollTest, 'rollDice')
    const message = {
      flags: {
        sr5data: {
          test: {
            type: 'healing', typeSub: 'physical', extended: {
              roll: 1
            }
          }
        }
      }
    }
    const result = await SR5_RollTest.extendedRoll(message, patient(2, 4))
    expect(result).toBe(false)
    expect(rollDice).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_StunHealsFirst')
  })
})
