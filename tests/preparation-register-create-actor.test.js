import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// The register's writes, in the order the active GM makes them
const ledger = vi.hoisted(() => ({
  register: {
  }
}))
vi.mock('../modules/system/gm-ledger.js', () => ({
  updateLedger: vi.fn(async (_key, change) => {
    const next = change(structuredClone(ledger.register))
    if (next) ledger.register = next
  })
}))

const hooks = {
}
globalThis.Hooks = {
  on: (name, fn) => {
    hooks[name] = fn
  }, once: () => {
  }
}
class FakeActor {}
globalThis.Actor = FakeActor
const warn = vi.fn()
globalThis.ui = {
  notifications: {
    warn
  }
}

const {
  registerPreparationRegisterHooks, REGISTER_STARTED
} = await import('../modules/system/preparation-register.js')
registerPreparationRegisterHooks()

const actorWith = values => {
  const actor = new FakeActor()
  const doc = {
    documentName: 'Item', type: 'itemPreparation', uuid: 'Actor.a.Item.p', name: 'Boule de foudre', parent: actor,
    system: {
      potency: 4, ...values
    }, update: vi.fn()
  }
  actor.items = [doc]
  return {
    actor, doc
  }
}

beforeEach(() => {
  ledger.register = {
    [REGISTER_STARTED]: true
  }
  warn.mockClear()
  globalThis.game = {
    users: {
      activeGM: {
        isSelf: true
      }, get: id => ({
        gm: {
          isGM: true, name: 'MJ'
        }, pl: {
          isGM: false, name: 'Clo'
        }
      })[id]
    },
    time: {
      worldTime: 1000
    },
    i18n: {
      format: k => k, localize: k => k
    },
  }
})

// A compendium actor's preparations fire no createItem: they must reach the register from createActor
describe('an actor created with its preparations', () => {
  it('by the gamemaster: the register takes them as they stand, without a warning', async () => {
    const values = {
      createdAt: 50, initialPotency: 6, fullPotencyMultiplier: 3, decayRate: 'day'
    }
    const {
      actor, doc
    } = actorWith(values)
    await hooks.createActor(actor, {
    }, 'gm')
    expect(ledger.register['Actor.a.Item.p']).toEqual(values)
    expect(doc.update).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('by a player: the book\'s reading, put back without a warning', async () => {
    const {
      actor, doc
    } = actorWith({
      createdAt: 50, initialPotency: 6, fullPotencyMultiplier: 3, decayRate: 'day'
    })
    await hooks.createActor(actor, {
    }, 'pl')
    expect(ledger.register['Actor.a.Item.p']).toEqual({
      createdAt: 1000, initialPotency: 4, fullPotencyMultiplier: 2, decayRate: 'hour'
    })
    expect(doc.update).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('on another gamemaster\'s client: nothing', async () => {
    game.users.activeGM.isSelf = false
    const {
      actor
    } = actorWith({
    })
    await hooks.createActor(actor, {
    }, 'gm')
    expect(ledger.register['Actor.a.Item.p']).toBeUndefined()
  })
})
