import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const handlers = {
}
globalThis.Hooks = {
  on: (name, fn) => {
    handlers[name] = fn
  },
  once: () => {},
}

const {
  SR5StorageLockRights
} = await import('../modules/interface/storage-lock-rights.js')
// The rewrite runs in the actor's _preUpdate since the ownership window updates with noHook (Hilde)
handlers.preUpdateActor = (actor, changes, options) => SR5StorageLockRights.hold(actor, changes, options)

// Zélia's review of the lock: an update that shuts the storage AND changes rights skipped the
// atomic close, so the rights it granted held until the sync came back
describe("the GM's update that shuts a storage", () => {
  let storage
  beforeEach(() => {
    game.user = {
      id: 'gm', isGM: true
    }
    // No character put it down: no key holder
    game.actors = {
      get: () => null
    }
    globalThis.canvas = {
      scene: null
    }
    game.scenes = []
    game.users = [{
      id: 'gm', isGM: true
    }, {
      id: 'p1', isGM: false
    }]
    storage = {
      type: 'actorStorage',
      system: {
        lock: {
          type: 'mechanical', locked: false
        }
      },
      ownership: {
        default: 0, gm: 3, p1: 3
      },
      getFlag: () => undefined,
    }
  })

  it('holds the others at Limited in that very update when it also changes rights', () => {
    const changes = {
      system: {
        lock: {
          locked: true
        }
      },
      ownership: {
        p2: 3
      },
    }
    handlers.preUpdateActor(storage, changes, {
    })
    expect(changes.ownership).toMatchObject({
      gm: 3, p1: 1, p2: 1
    })
    expect(changes.flags.sr5.lockOwnership).toEqual({
      p1: 3, p2: 3
    })
  })

  it('keeps a key sent back to the default sent back', () => {
    const changes = {
      system: {
        lock: {
          locked: true
        }
      },
      ownership: {
        '-=p1': null
      },
    }
    handlers.preUpdateActor(storage, changes, {
    })
    expect(changes.ownership['-=p1']).toBe(null)
    expect(changes.ownership.p1).toBeUndefined()
  })

  it('shuts atomically without a change of rights, as before', () => {
    const changes = {
      system: {
        lock: {
          locked: true
        }
      }
    }
    handlers.preUpdateActor(storage, changes, {
    })
    expect(changes.ownership).toMatchObject({
      p1: 1
    })
  })
})
