import {
  describe, it, expect, vi, afterEach
} from 'vitest'

// The sheets' switch reads the drones once per sheet drawn, not game.actors once per item; the noise of a Matrix
// action is measured from the acting token itself (relecture de Fleur)

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

const {
  matrixTargetDistance
} = await import('../modules/rolls/roll-helpers/matrix-distance.js')

describe('matrixTargetDistance: the noise is measured from the acting token itself', () => {
  const scene = {
    grid: {
      units: 'm'
    }
  }
  const grid = {
    measurePath: ([a, b]) => ({
      distance: Math.abs(b.x - a.x) / 100
    })
  }
  const token = (x, actor, document = {
  }, controlled = false) => ({
    center: {
      x, y: 0
    }, actor, controlled, document: {
      parent: scene, actorId: actor.baseId ?? actor.id, ...document
    }
  })
  const canvasWith = placeables => ({
    scene, grid, tokens: {
      placeables
    }
  })

  it('never measures from another unlinked token of the same model', () => {
    const guardA = {
      id: 'guard', baseId: 'guard', isToken: true
    }
    const guardB = {
      id: 'guard', baseId: 'guard', isToken: true
    }
    const target = token(5000, {
      id: 'target'
    })
    const farGuard = token(0, guardB, {
      actorLink: false
    })
    const nearGuard = token(4900, guardA, {
      actorLink: false
    })
    guardA.token = nearGuard.document
    // B stands first on the scene: the alpha measured from it, 50 m off
    expect(matrixTargetDistance(guardA, canvasWith([farGuard, nearGuard, target]), new Set([target]))).toBeCloseTo(1)
  })

  it('measures a world actor from its linked token, or the unlinked one the user controls', () => {
    const decker = {
      id: 'decker'
    }
    const target = token(1000, {
      id: 'target'
    })
    const synthetic = {
      id: 'decker', isToken: true
    }
    expect(matrixTargetDistance(decker, canvasWith([token(0, synthetic, {
      actorLink: false
    }), token(800, decker, {
      actorLink: true
    }), target]), new Set([target]))).toBeCloseTo(2)
    expect(matrixTargetDistance(decker, canvasWith([token(0, synthetic, {
      actorLink: false
    }, true), target]), new Set([target]))).toBeCloseTo(10)
    // an unlinked token of it nobody controls: no distance, the dialog keeps its default band
    expect(matrixTargetDistance(decker, canvasWith([token(0, synthetic, {
      actorLink: false
    }), target]), new Set([target]))).toBeNull()
  })
})

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
