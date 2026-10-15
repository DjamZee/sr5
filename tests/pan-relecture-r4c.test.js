import {
  describe, it, expect
} from 'vitest'
import {
  layoutCrown, lineRadiusOf, pictureEdgeAlong, PAN_LAYOUT
} from '../modules/canvas/pan-crown/pan-layout.js'

// A master with `slaves` slaves, and `loose` devices slaved to nothing
const graphOf = (slaves, loose) => ({
  master: 'm',
  nodes: [{
    uuid: 'm', kind: 'master'
  }, ...Array.from({
    length: slaves
  }, (_, i) => ({
    uuid: `s${i}`, kind: 'slave'
  })), ...Array.from({
    length: loose
  }, (_, i) => ({
    uuid: `d${i}`, kind: 'device'
  }))],
  links: [{
    from: 'owner', to: 'm'
  }, ...Array.from({
    length: slaves
  }, (_, i) => ({
    from: 'm', to: `s${i}`
  })), ...Array.from({
    length: loose
  }, (_, i) => ({
    from: 'owner', to: `d${i}`
  }))]
})

const nameBox = {
  x0: -80, x1: 80, y0: 52, y1: 72
}

// A round picture in a square texture: opaque inside the circle of radius n/2
const roundAlpha = n => Uint8Array.from({
  length: n * n
}, (_, i) => {
  const x = (i % n) + 0.5 - n / 2, y = Math.floor(i / n) + 0.5 - n / 2
  return Math.hypot(x, y) <= n / 2 ? 255 : 0
})

// The three cases of the passe 2: a picture at 0.6, a normal token, a ring at 1.4 with 20 devices
const CASES = [
  ['picture at 0.6', 0.6, 6, 4, false],
  ['normal token', 1, 6, 3, false],
  ['ring at 1.4, 20 devices', 1.4, 5, 15, true],
  ['ring at 1.4, 20 slaves', 1.4, 20, 0, true],
]

describe('relecture djamz.13, passe 2 (R4c): each line ends on its icon', () => {
  for (const [label, scale, slaves, loose, round] of CASES) for (const angle of [-Math.PI / 2, 0, Math.PI * 0.75]) {
    it(`${label}, master at ${angle.toFixed(2)} rad`, () => {
      const tokenRadius = lineRadiusOf({
        w: 100, h: 100, scaleX: scale, scaleY: scale
      })
      const alpha = roundAlpha(64)
      const box = {
        hw: tokenRadius, hh: tokenRadius
      }
      const lineEdge = round ? () => tokenRadius * 0.86 : dir => pictureEdgeAlong(alpha, 64, dir, box)
      const {
        icons, lines
      } = layoutCrown(graphOf(slaves, loose), {
        tokenRadius, angle, nameBox, lineEdge
      })
      expect(icons).toHaveLength(1 + slaves + loose)
      const byUuid = new Map(icons.map(i => [i.node.uuid, i]))
      for (const line of lines) {
        const icon = byUuid.get(line.uuid)
        expect(Math.hypot(line.to.x - icon.x, line.to.y - icon.y)).toBeLessThan(1)
      }
      // A line of the token starts at the picture's edge (round: its radius), never further
      for (const line of lines.filter(l => !icons.some(i => i.x === l.from.x && i.y === l.from.y))) {
        expect(Math.hypot(line.from.x, line.from.y)).toBeLessThanOrEqual(tokenRadius + 1)
      }
      const r = PAN_LAYOUT.iconRadius
      // Many loose devices: no line of the token through another icon
      if (loose) for (const line of lines.filter(l => l.uuid.startsWith('d'))) {
        for (const icon of icons.filter(i => i.node.uuid !== line.uuid)) {
          const dx = line.to.x - line.from.x, dy = line.to.y - line.from.y
          const t = Math.max(0, Math.min(1, ((icon.x - line.from.x) * dx + (icon.y - line.from.y) * dy) / (dx * dx + dy * dy)))
          expect(Math.hypot(line.from.x + t * dx - icon.x, line.from.y + t * dy - icon.y)).toBeGreaterThan(r)
        }
      }
      // No icon on another
      for (let i = 0; i < icons.length; i++) for (let j = i + 1; j < icons.length; j++) {
        expect(Math.hypot(icons[i].x - icons[j].x, icons[i].y - icons[j].y)).toBeGreaterThan(2 * r)
      }
    })
  }
})

describe('relecture djamz.13, passe 2 (R4c): the edge of a round picture in a square texture', () => {
  const alpha = roundAlpha(64)
  const box = {
    hw: 50, hh: 50
  }
  it('on the axes, the side of the box', () => {
    expect(pictureEdgeAlong(alpha, 64, {
      x: 1, y: 0
    }, box)).toBeGreaterThan(47)
  })
  it('on a diagonal, the circle and not the corner of the box', () => {
    const d = pictureEdgeAlong(alpha, 64, {
      x: Math.SQRT1_2, y: Math.SQRT1_2
    }, box)
    expect(d).toBeGreaterThan(46)
    expect(d).toBeLessThan(53)
  })
  it('a square picture keeps its corner', () => {
    const full = new Uint8Array(64 * 64).fill(255)
    expect(pictureEdgeAlong(full, 64, {
      x: Math.SQRT1_2, y: Math.SQRT1_2
    }, box)).toBeCloseTo(50 * Math.SQRT2, 0)
  })
})
