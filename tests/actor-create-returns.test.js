import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Measured in game (matrice-sr5, tab « CI »): SR5Actor.create started Foundry's creation without waiting for it, and
// gave back nothing; a module that made a device could not tell which actor it had made.
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))
vi.mock('../modules/system/effectsList.js', async (importOriginal) => ({
  ...(await importOriginal()),
  _getSRStatusEffect: vi.fn(async (origin) => ({
    name: origin, statuses: [origin]
  })),
}))

const {
  SR5Actor
} = await import('../modules/entities/actors/entityActor.js')

describe('SR5Actor.create', () => {
  beforeEach(() => {
    globalThis.CONFIG.ActiveEffect = {
      documentClass: class {
        constructor(data) {
          this.data = data
        }
        toObject() {
          return {
            ...this.data
          }
        }
      },
    }
    // The Foundry parent of SR5Actor: what super.create reaches
    Object.getPrototypeOf(SR5Actor).create = vi.fn(async (data) => {
      await new Promise(r => setTimeout(r, 5))
      return {
        id: 'made', name: data.name, items: data.items, effects: data.effects
      }
    })
  })

  it('returns the device it creates, with its device item and its matrix initiative effect', async () => {
    const actor = await SR5Actor.create({
      name: 'CI', type: 'actorDevice', system: {
        matrix: {
          deviceType: 'ice', deviceSubType: 'iceKiller'
        }
      }
    })
    expect(actor?.id).toBe('made')
    expect(actor.items.map(i => i.type)).toEqual(['itemDevice'])
    expect(actor.effects.map(e => e.name)).toEqual(['matrixInit'])
  })

  it('returns the actor of a type with no creation of its own', async () => {
    const actor = await SR5Actor.create({
      name: 'Coffre', type: 'actorStorage'
    })
    expect(actor?.id).toBe('made')
  })

  it('returns a copy that already has its items', async () => {
    const actor = await SR5Actor.create({
      name: 'Copie', type: 'actorDevice', items: []
    })
    expect(actor?.id).toBe('made')
  })
})
