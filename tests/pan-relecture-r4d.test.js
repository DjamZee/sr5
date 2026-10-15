import {
  describe, it, expect
} from 'vitest'
import {
  maskBoundsOf
} from '../modules/canvas/pan-crown/pan-layout.js'

describe('relecture djamz.13 (R4d): the mask of the lines covers all of them', () => {
  it('holds every end of a line and the whole picture, a pad around, in whole pixels', () => {
    const b = maskBoundsOf([-30.2, 180.6, 12], [-220.4, 40, 95.5], 160, 160, 24)
    expect(b).toEqual({
      x: -104, y: -245, w: 309, h: 365
    })
    for (const x of [-30.2, 180.6, 12, -80, 80]) {
      expect(x).toBeGreaterThanOrEqual(b.x)
      expect(x).toBeLessThanOrEqual(b.x + b.w)
    }
  })
  it('a small crown still covers the picture', () => {
    expect(maskBoundsOf([5], [5], 100, 60, 0)).toEqual({
      x: -50, y: -30, w: 100, h: 60
    })
  })
  it('is the same for the same lines: the mask is not made again after a move', () => {
    expect(maskBoundsOf([10, 200], [0, -150], 100, 100, 24)).toEqual(maskBoundsOf([10, 200], [0, -150], 100, 100, 24))
  })
})
