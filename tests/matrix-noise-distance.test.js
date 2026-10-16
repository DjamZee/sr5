import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes CONFIG.statusEffects at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_ConverterHelpers
} from '../modules/rolls/roll-helpers/converter.js'
import {
  matrixTargetDistance, matrixTargetBand
} from '../modules/rolls/roll-helpers/matrix-distance.js'

// SR5 p. 232: the noise of a Matrix action by the distance to its target, each band holding its upper bound.
// The matrix dialog opened from the PAN crown offered "10 km to 100 km" for a target 9 m away (07/10): nothing
// measured the distance, and the list, sorted alphabetically, showed whichever band came first.

describe('matrixDistanceToBand', () => {
  it('puts each distance in its band of the SR5 p. 232 table, bounds included', () => {
    const band = SR5_ConverterHelpers.matrixDistanceToBand
    expect(band(0)).toBe("upTo100m")
    expect(band(9)).toBe("upTo100m")
    expect(band(100)).toBe("upTo100m")
    expect(band(100.5)).toBe("upTo1km")
    expect(band(150)).toBe("upTo1km")
    expect(band(1000)).toBe("upTo1km")
    expect(band(1001)).toBe("upTo10km")
    expect(band(10000)).toBe("upTo10km")
    expect(band(10001)).toBe("upTo100km")
    expect(band(100000)).toBe("upTo100km")
    expect(band(100001)).toBe("farAway")
  })

  it('gives no band to a distance that was not measured', () => {
    const band = SR5_ConverterHelpers.matrixDistanceToBand
    expect(band(null)).toBe(null)
    expect(band(undefined)).toBe(null)
    expect(band(NaN)).toBe(null)
    expect(band(-1)).toBe(null)
  })

  it('gives each band the noise of the table', () => {
    const mod = SR5_ConverterHelpers.matrixDistanceToMod
    expect(["upTo100m", "upTo1km", "upTo10km", "upTo100km", "farAway"].map(mod)).toEqual([0, -1, -3, -5, -8])
  })
})

describe('matrixTargetDistance', () => {
  // A scene of 1.5 m squares of 100 px: the grid measures in squares x 1.5, as Foundry does
  const scene = {
    grid: {
      units: "m"
    }
  }
  const grid = {
    measurePath: ([a, b]) => ({
      distance: Math.hypot(b.x - a.x, b.y - a.y) / 100 * 1.5
    })
  }
  const actor = {
    id: "hacker", type: "actorPc"
  }
  const token = (x, a, onScene = scene, controlled = false) => ({
    center: {
      x, y: 50
    }, actor: a, controlled, document: {
      parent: onScene, actorId: a.id
    }
  })
  const me = token(50, actor)
  const at9m = token(650, {
    id: "target", type: "actorPc"
  })
  const at150m = token(10050, {
    id: "far", type: "actorPc"
  })
  const canvasWith = placeables => ({
    scene, grid, tokens: {
      placeables
    }
  })

  it('measures 9 m to a token six squares away, and gives the first band', () => {
    expect(matrixTargetDistance(actor, canvasWith([me, at9m]), new Set([at9m]))).toBeCloseTo(9)
    expect(matrixTargetBand(actor, canvasWith([me, at9m]), new Set([at9m]))).toBe("upTo100m")
  })

  it('gives the second band at 150 m', () => {
    expect(matrixTargetBand(actor, canvasWith([me, at150m]), new Set([at150m]))).toBe("upTo1km")
  })

  it('converts a scene measured in feet', () => {
    const feet = {
      grid: {
        units: "ft"
      }
    }
    const meFt = token(50, actor, feet), farFt = token(10050, {
      id: "far"
    }, feet)
    // 100 squares of "1.5" feet = 150 ft = 45.72 m
    expect(matrixTargetDistance(actor, {
      scene: feet, grid, tokens: {
        placeables: [meFt, farFt]
      }
    }, new Set([farFt]))).toBeCloseTo(45.72)
  })

  it('finds the base actor of an unlinked token by its id, and prefers the controlled token', () => {
    const synthetic = token(10050, {
      id: "hacker", type: "actorPc"
    }, scene, true)
    expect(matrixTargetDistance(actor, canvasWith([me, synthetic, at9m]), new Set([at9m]))).toBeCloseTo(141)
  })

  it('measures nothing without a single target, across scenes, without a token, or against a host', () => {
    expect(matrixTargetDistance(actor, canvasWith([me]), new Set())).toBe(null)
    expect(matrixTargetDistance(actor, canvasWith([me, at9m, at150m]), new Set([at9m, at150m]))).toBe(null)
    const elsewhere = token(650, {
      id: "other"
    }, {
      grid: {
        units: "m"
      }
    })
    expect(matrixTargetDistance(actor, canvasWith([me, elsewhere]), new Set([elsewhere]))).toBe(null)
    expect(matrixTargetDistance(actor, canvasWith([at9m]), new Set([at9m]))).toBe(null)
    const host = token(650, {
      id: "host", type: "actorDevice", system: {
        matrix: {
          deviceType: "host"
        }
      }
    })
    expect(matrixTargetDistance(actor, canvasWith([me, host]), new Set([host]))).toBe(null)
    expect(matrixTargetBand(actor, canvasWith([me]), new Set())).toBe(null)
  })

  it('is at distance 0 from itself', () => {
    expect(matrixTargetDistance(actor, canvasWith([me]), new Set([me]))).toBe(0)
  })
})
