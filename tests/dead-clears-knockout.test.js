import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// A grunt knocked out then finished off was both Unconscious and Dead: death takes off the knockout the damage laid
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

function grunt(effects){
  return {
    id: 'g', name: 'Brute', system: {
    },
    effects,
    createEmbeddedDocuments: vi.fn(async () => {}),
    deleteEmbeddedDocuments: vi.fn(async () => {}),
  }
}
const effect = (id, status, origin) => ({
  id, origin, statuses: new Set([status])
})

describe('createDeadEffect', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.ui = {
      notifications: {
        info: vi.fn()
      }
    }
    globalThis.game ??= {
    }
    globalThis.game.i18n = {
      localize: (k) => k
    }
    vi.spyOn(SR5_EntityHelpers, 'displayName').mockReturnValue('Brute')
    vi.spyOn(SR5_ActorHelper, 'dropSpoilsOnDeath').mockImplementation(async () => {})
  })

  it('takes off the knockout laid by the damage', async () => {
    const actor = grunt([effect('ko', 'unconscious', 'unconscious')])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    await SR5_ActorHelper.createDeadEffect('g')
    expect(actor.createEmbeddedDocuments).toHaveBeenCalled()
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', ['ko'])
  })

  it('leaves an Unconscious status the GM set by hand', async () => {
    const actor = grunt([effect('hand', 'unconscious', undefined)])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    await SR5_ActorHelper.createDeadEffect('g')
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })

  it('does nothing on an actor already dead', async () => {
    const actor = grunt([effect('ko', 'unconscious', 'unconscious'), effect('d', 'dead', 'dead')])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    await SR5_ActorHelper.createDeadEffect('g')
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled()
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
