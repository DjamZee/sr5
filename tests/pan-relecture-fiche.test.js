import {
  describe, it, expect, vi, afterEach
} from 'vitest'

// The sheets' switch reads the drones once per sheet drawn, not game.actors once per item (relecture de Fleur)

vi.mock('../modules/entities/actors/entityActor-helpers.js', () => ({
  SR5_ActorHelper: {
  }
}))
vi.mock('../modules/entities/helpers.js', () => ({
  SR5_EntityHelpers: {
  }
}))
vi.mock('../modules/system/srcombat.js', () => ({
  SR5Combat: {
  }
}))

const {
  knownActors
} = await import('../modules/canvas/pan-crown/pan-device-switch.js')

afterEach(() => {
  delete globalThis.game
  delete globalThis.canvas
})

describe('knownActors: the drones a deployed vehicle is looked up in', () => {
  it('keeps the drones alone, the world\'s and those of the unlinked tokens', () => {
    const drone = {
      id: 'd', type: 'actorDrone'
    }
    const tokenDrone = {
      id: 't', type: 'actorDrone', isToken: true
    }
    globalThis.game = {
      actors: [drone, {
        id: 'pc', type: 'actorPc'
      }]
    }
    globalThis.canvas = {
      tokens: {
        placeables: [{
          actor: tokenDrone, document: {
            actorLink: false
          }
        }, {
          actor: drone, document: {
            actorLink: true
          }
        }]
      }
    }
    expect(knownActors().map(a => a.id)).toEqual(['d', 't'])
  })

  it('gathers them once for a sheet drawn in one go, and again afterwards', async () => {
    let reads = 0
    globalThis.game = {
      get actors(){
        reads++
        return []
      }
    }
    const first = knownActors()
    expect(knownActors()).toBe(first)
    expect(reads).toBe(1)
    await null
    knownActors()
    expect(reads).toBe(2)
  })
})
