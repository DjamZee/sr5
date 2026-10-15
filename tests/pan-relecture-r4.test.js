import {
  describe, it, expect
} from 'vitest'
import {
  layoutCrown, lineBoxOf, crownScaleOf
} from '../modules/canvas/pan-crown/pan-layout.js'

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
