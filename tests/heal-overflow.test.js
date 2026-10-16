import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

// SR5 p. 171, 209: Physical overflow boxes lie beyond the monitor, a heal takes them off first
function patient(physical, overflow, sourceOverflow = overflow){
  const system = {
    conditionMonitors: {
      stun: {
        value: 10, actual: {
          base: 0, value: 0
        }
      },
      physical: {
        value: 8, aggravated: 0, actual: {
          base: physical, value: physical
        }
      },
      overflow: {
        value: 4, actual: {
          base: overflow, value: overflow
        }
      },
    }
  }
  const actor = {
    system,
    _source: {
      system: {
        conditionMonitors: {
          overflow: {
            actual: {
              base: sourceOverflow
            }
          }
        }
      }
    },
    update: vi.fn(async () => {}),
  }
  actor.toObject = () => JSON.parse(JSON.stringify({
    system
  }))
  return actor
}

function healPhysical(actor, hits){
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
  return SR5_ActorHelper.heal('a', {
    test: {
      typeSub: 'physical'
    }, roll: {
      netHits: hits
    }
  })
}

describe('heal and the Physical overflow', () => {
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
    vi.spyOn(foundry.utils, 'deepClone').mockImplementation((a) => a)
    vi.spyOn(SR5_ActorHelper, 'clearDamageKnockout').mockImplementation(async () => {})
  })

  it('heals the overflow first: 8/8 + 3, healed 5, leaves 6/8 and no overflow', async () => {
    const actor = patient(8, 3)
    await healPhysical(actor, 5)
    const update = actor.update.mock.calls[0][0]
    expect(update['system.conditionMonitors.overflow.actual.base']).toBe(0)
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(6)
  })

  it('a heal smaller than the overflow leaves the Physical monitor full', async () => {
    const actor = patient(8, 3)
    await healPhysical(actor, 2)
    const update = actor.update.mock.calls[0][0]
    expect(update['system.conditionMonitors.overflow.actual.base']).toBe(1)
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(8)
  })

  it('spends an overflow the preparation hides but the source still holds', async () => {
    const actor = patient(7, 0, 5)
    await healPhysical(actor, 2)
    const update = actor.update.mock.calls[0][0]
    expect(update['system.conditionMonitors.overflow.actual.base']).toBe(0)
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(5)
  })

  it('never touches the overflow on a Stun heal', async () => {
    const actor = patient(8, 3)
    actor.system.conditionMonitors.stun.actual = {
      base: 4, value: 4
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    await SR5_ActorHelper.heal('a', {
      test: {
        typeSub: 'stun'
      }, roll: {
        netHits: 2
      }
    })
    expect(actor.update.mock.calls[0][0]).not.toHaveProperty('system.conditionMonitors.overflow.actual.base')
  })
})
