import {
  describe, it, expect
} from 'vitest'
import {
  layoutCrown, lineRadiusOf, lineBoxOf, PAN_LAYOUT
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

// A name 160 px wide under a token of 100 px
const nameBox = {
  x0: -80, x1: 80, y0: 52, y1: 72
}
const r = PAN_LAYOUT.iconRadius
const onName = ({
  x, y
}) => x > nameBox.x0 - r && x < nameBox.x1 + r && y > nameBox.y0 - r && y < nameBox.y1 + r

describe('relecture djamz.13, passe 2: the picture as shown', () => {
  it('a picture bigger than its cell, a big ring: the lines start at its edge, not inside it', () => {
    expect(lineRadiusOf({
      w: 100, h: 100, scaleX: 1.6, scaleY: 1.6
    })).toBe(80)
    expect(lineBoxOf({
      w: 100, h: 100, scaleX: 1.6, scaleY: 1.6
    })).toEqual({
      hw: 80, hh: 80
    })
  })
  it('a picture at 0.6: the crown hugs it', () => {
    const graph = graphOf(0, 1)
    const small = layoutCrown(graph, {
      tokenRadius: lineRadiusOf({
        w: 100, h: 100, scaleX: 0.6, scaleY: 0.6
      }), angle: -Math.PI / 2
    })
    const icon = small.icons.find(i => i.node.uuid === 'd0')
    expect(Math.hypot(icon.x, icon.y)).toBeCloseTo(30 + PAN_LAYOUT.deviceGap)
  })
})

describe('relecture djamz.13, passe 2: the name stays clear', () => {
  for (const [slaves, loose, angle] of [[6, 14, -Math.PI / 4], [0, 20, -Math.PI / 2], [8, 12, Math.PI / 2], [4, 10, 0]]) {
    it(`${slaves} slaves and ${loose} loose devices, master at ${angle.toFixed(2)} rad`, () => {
      const {
        icons, lines
      } = layoutCrown(graphOf(slaves, loose), {
        tokenRadius: 50, angle, nameBox
      })
      expect(icons).toHaveLength(1 + slaves + loose)
      for (const icon of icons) expect(onName(icon)).toBe(false)
      // A line from the token never goes down through the name
      for (const line of lines.filter(l => Math.hypot(l.from.x, l.from.y) <= 51)) {
        const crosses = line.to.y > nameBox.y0 && line.to.x > nameBox.x0 - r && line.to.x < nameBox.x1 + r
        expect(crosses).toBe(false)
      }
      // No two icons on top of each other
      for (let i = 0; i < icons.length; i++) for (let j = i + 1; j < icons.length; j++) {
        expect(Math.hypot(icons[i].x - icons[j].x, icons[i].y - icons[j].y)).toBeGreaterThan(2 * r)
      }
    })
  }
})
