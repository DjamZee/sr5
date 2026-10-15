import {
  describe, it, expect
} from 'vitest'
import {
  layoutCrown, lineBoxOf, crownScaleOf, crownAngle, crownReachOf
} from '../modules/canvas/pan-crown/pan-layout.js'

describe('relecture djamz.13: a crown stays in its scene', () => {
  const rect = {
    x: 500, y: 500, width: 2000, height: 2000
  }
  const center = {
    x: 1500, y: 1500
  }
  it('opens away from the center while it fits', () => {
    expect(crownAngle({
      x: 1000, y: 1500
    }, center, rect, crownReachOf(50))).toBeCloseTo(Math.PI)
  })
  it('turns inward for a big token in a corner', () => {
    const at = {
      x: 650, y: 650
    }
    const reach = crownReachOf(150, Math.sqrt(3))
    const a = crownAngle(at, center, rect, reach)
    const x = at.x + Math.cos(a) * reach, y = at.y + Math.sin(a) * reach
    expect(x).toBeGreaterThanOrEqual(rect.x)
    expect(y).toBeGreaterThanOrEqual(rect.y)
  })
  it('keeps the old behaviour without a scene', () => {
    expect(crownAngle({
      x: 0, y: 0
    }, {
      x: 10, y: 0
    })).toBeCloseTo(Math.PI)
  })
})

const graph = () => ({
  master: null, nodes: [{
    uuid: 'd', mode: 'active'
  }], links: [{
    from: 'owner', to: 'd'
  }]
})

describe('relecture djamz.13: the lines leave the edge of a square picture', () => {
  it('takes the half sides of the picture, a margin added; none for a round one', () => {
    expect(lineBoxOf({
      w: 100, h: 100 
    }, 3)).toEqual({
      hw: 53, hh: 53 
    })
    expect(lineBoxOf({
      w: 100, h: 100, scaleX: 0.5, scaleY: 0.5 
    })).toEqual({
      hw: 25, hh: 25 
    })
    expect(lineBoxOf({
      w: 100, h: 100, round: true 
    })).toBeNull()
  })

  it('starts a diagonal line at the corner of the square, not inside it', () => {
    const {
      lines 
    } = layoutCrown(graph(), {
      tokenRadius: 50, angle: -Math.PI / 4, lineBox: {
        hw: 50, hh: 50 
      }
    })
    // The loose device goes opposite the angle: on the diagonal, the line leaves the corner (50, 50)
    expect(Math.abs(lines[0].from.x)).toBeCloseTo(50)
    expect(Math.abs(lines[0].from.y)).toBeCloseTo(50)
  })

  it('keeps the circle without a box', () => {
    const {
      lines 
    } = layoutCrown(graph(), {
      tokenRadius: 50, angle: -Math.PI / 4, lineRadius: 50
    })
    expect(Math.hypot(lines[0].from.x, lines[0].from.y)).toBeCloseTo(50)
  })
})

describe('relecture djamz.13: a crown at the size of its token', () => {
  it('does not change for a token of one cell', () => {
    expect(crownScaleOf(100, 100, 100)).toBe(1)
    expect(crownScaleOf(200, 200, 200)).toBe(2)
  })

  it('grows by the square root of the size, up to twice', () => {
    expect(crownScaleOf(100, 200, 200)).toBeCloseTo(Math.SQRT2)
    expect(crownScaleOf(100, 300, 300)).toBeCloseTo(Math.sqrt(3))
    expect(crownScaleOf(100, 600, 600)).toBe(2)
    expect(crownScaleOf(100, 50, 50)).toBe(1)
  })
})
