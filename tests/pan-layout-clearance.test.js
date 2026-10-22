import {
  describe, it, expect
} from 'vitest'

const {
  clearanceOf, fan
} = await import('../modules/canvas/pan-crown/pan-layout.js')

const naive = (angles, inner) => Math.min(...angles.flatMap(a => inner.map(b => Math.abs(a - b))))

describe("clearanceOf (couronne du PAN, mesure du 22/10)", () => {
  it("gives the least gap between the angles and the inner ones, as Math.min over every pair did", () => {
    let seed = 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 4 - 2
    for (let k = 0; k < 50; k++){
      const angles = Array.from({
        length: 1 + k % 9
      }, rand), inner = Array.from({
        length: 1 + k % 13
      }, rand)
      expect(clearanceOf(angles, inner)).toBe(naive(angles, inner))
    }
  })

  it("is Infinity with no inner arc, as before", () => {
    expect(clearanceOf([0.1, 0.2], [])).toBe(Infinity)
  })

  it("gives up at the floor: what it returns then cannot beat it", () => {
    expect(clearanceOf([0, 1], [0.05, 2], 0.1)).toBeLessThanOrEqual(0.1)
  })

  it("lays out 40 icons on staggered arcs in a few milliseconds", () => {
    const nodes = Array.from({
      length: 40
    }, (_, i) => i)
    const placed = []
    const t0 = performance.now()
    const arcs = fan(nodes, -Math.PI / 2, 120, {
      x: 0, y: 0
    }, (node, x, y) => placed.push([node, x, y]))
    expect(placed).toHaveLength(40)
    expect(arcs.length).toBeGreaterThan(2)
    // 115 ms a build before (Chrome, RTX 4060); a generous bound, for slow machines
    expect(performance.now() - t0).toBeLessThan(60)
  })
})
