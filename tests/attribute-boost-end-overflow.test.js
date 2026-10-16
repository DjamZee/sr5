import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// The end of Increase Attribute (Willpower) shrinks the Stun monitor under the damage it holds: the excess is
// carried as SR5 p. 171 says (half, rounded down, to Physical), instead of being clipped and lost
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

// Prepared monitors as the preparation leaves them: the stored damage clipped to the new size
function character({
  stunSize = 9, stunStored = 11, physical = 2, physicalSize = 10, overflow = 0
} = {
}) {
  const prepared = {
    stun: {
      value: stunSize, actual: {
        base: Math.min(stunStored, stunSize), value: Math.min(stunStored, stunSize), modifiers: []
      }
    },
    physical: {
      value: physicalSize, actual: {
        base: physical, value: physical, modifiers: []
      }
    },
    overflow: {
      value: 4, actual: {
        base: overflow, value: overflow, modifiers: []
      }
    },
  }
  return {
    id: 'pc', type: 'actorPc',
    _source: {
      system: {
        conditionMonitors: {
          stun: {
            actual: {
              base: stunStored
            }
          }, physical: {
            actual: {
              base: physical
            }
          }, overflow: {
            actual: {
              base: overflow
            }
          }
        }
      }
    },
    toObject: () => JSON.parse(JSON.stringify({
      system: {
        conditionMonitors: prepared
      }
    })),
    update: vi.fn(async () => {}),
  }
}

describe('settleMonitorExcess', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(SR5_ActorHelper, 'createKoEffect').mockImplementation(async () => {})
    vi.spyOn(SR5_ActorHelper, 'createDeadEffect').mockImplementation(async () => {})
  })

  it('11 Stun boxes on a monitor of 9: Stun full, 1 box carried to Physical, knocked out', async () => {
    const actor = character()
    expect(await SR5_ActorHelper.settleMonitorExcess('pc', actor)).toBe(true)
    const update = actor.update.mock.calls[0][0]
    expect(update['system.conditionMonitors.stun.actual.base']).toBe(9)
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(3)
    expect(SR5_ActorHelper.createKoEffect).toHaveBeenCalledWith('pc')
  })

  it('one box over the monitor carries nothing (rounded down), but the monitor is full', async () => {
    const actor = character({
      stunStored: 10
    })
    await SR5_ActorHelper.settleMonitorExcess('pc', actor)
    const update = actor.update.mock.calls[0][0]
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(2)
    expect(SR5_ActorHelper.createKoEffect).toHaveBeenCalled()
  })

  it('nothing to do when the damage still fits', async () => {
    const actor = character({
      stunStored: 5
    })
    expect(await SR5_ActorHelper.settleMonitorExcess('pc', actor)).toBe(false)
    expect(actor.update).not.toHaveBeenCalled()
  })

  it('Physical carried beyond its monitor fills the overflow', async () => {
    const actor = character({
      stunStored: 15, physical: 9
    })
    await SR5_ActorHelper.settleMonitorExcess('pc', actor)
    const update = actor.update.mock.calls[0][0]
    expect(update['system.conditionMonitors.physical.actual.base']).toBe(10)
    expect(update['system.conditionMonitors.overflow.actual.base']).toBe(2)
  })

  it('leaves a grunt alone (one condition monitor)', async () => {
    const actor = character()
    actor.type = 'actorGrunt'
    expect(await SR5_ActorHelper.settleMonitorExcess('pc', actor)).toBe(false)
  })
})
