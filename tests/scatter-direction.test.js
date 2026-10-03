import {
  describe, it, expect
} from "vitest"
import {
  SR5_CombatHelpers
} from "../modules/rolls/roll-helpers/combat.js"

// A stand-in for Foundry's SquareGrid, limited to what scatterOffset uses.
//
// Its numbers were checked against the real thing inside Foundry 13.351 (SquareGrid with
// size 100, distance 1.5) before this file was written: for a 6 m translation at 45 degrees,
// getTranslatedPoint returns (400, 400) under EQUIDISTANT and (282.843, 282.843) under EXACT,
// and measurePath reads both back as 6.
const DIAGONALS = {
  EQUIDISTANT: 0, EXACT: 1, RECTILINEAR: 3
}

class FakeSquareGrid {
  constructor({
    size, distance, diagonals
  }){
    this.size = size
    this.distance = distance
    this.diagonals = diagonals
  }

  // Pixels per scene unit.
  get #scale(){
    return this.size / this.distance
  }

  #diagonalCost(){
    if (this.diagonals === DIAGONALS.EQUIDISTANT) return 1
    if (this.diagonals === DIAGONALS.EXACT) return Math.SQRT2
    if (this.diagonals === DIAGONALS.RECTILINEAR) return 2
    throw new Error(`unsupported diagonal rule ${this.diagonals}`)
  }

  // Same formula as SquareGrid#getTranslatedPoint in Foundry 13.351 (common/grid/square.mjs), for the three
  // rules below: the scatter now follows the line of fire, so any angle can come up, not only multiples of 45.
  getTranslatedPoint(origin, direction, distance){
    const radians = direction * Math.PI / 180
    const dx = Math.cos(radians)
    const dy = Math.sin(radians)
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    let s = distance / this.distance
    if (this.diagonals === DIAGONALS.EQUIDISTANT) s /= Math.max(adx, ady)
    else if (this.diagonals === DIAGONALS.EXACT) s /= Math.max(adx, ady) + (Math.SQRT2 - 1) * Math.min(adx, ady)
    else if (this.diagonals === DIAGONALS.RECTILINEAR) s /= adx + ady
    else throw new Error(`unsupported diagonal rule ${this.diagonals}`)
    s *= this.size
    return {
      x: origin.x + dx * s,
      y: origin.y + dy * s,
    }
  }

  measurePath([a, b]){
    const dx = Math.abs(b.x - a.x) / this.#scale
    const dy = Math.abs(b.y - a.y) / this.#scale
    const diagonalSteps = Math.min(dx, dy)
    const straightSteps = Math.abs(dx - dy)
    return {
      distance: diagonalSteps * this.#diagonalCost() + straightSteps
    }
  }
}

// What the old code did, kept so the test states what it is guarding against: the four diagonals
// halved each axis, which divides each component by 2 instead of dividing the norm by sqrt(2).
function legacyOffset(grid, direction, distance){
  const gridUnit = grid.size / (grid.distance || 1)
  const full = distance * gridUnit
  const half = full / 2
  switch(direction){
    case 1: return {
      x: 0, y: full
    }
    case 2: return {
      x: -half, y: half
    }
    case 3: return {
      x: -full, y: 0
    }
    case 4: return {
      x: -half, y: -half
    }
    case 5: return {
      x: 0, y: -full
    }
    case 6: return {
      x: half, y: -half
    }
    case 7: return {
      x: full, y: 0
    }
    case 8: return {
      x: half, y: half
    }
  }
}

const SCALES = [
  {
    label: "1 m per square", size: 100, distance: 1
  },
  {
    label: "1.5 m per square", size: 100, distance: 1.5
  },
  {
    label: "5 m per square", size: 100, distance: 5
  },
  {
    label: "1.5 m per square, 70 px squares", size: 70, distance: 1.5
  },
]

const RULES = [
  {
    label: "equidistant diagonals", diagonals: DIAGONALS.EQUIDISTANT
  },
  {
    label: "exact diagonals", diagonals: DIAGONALS.EXACT
  },
  {
    label: "rectilinear diagonals", diagonals: DIAGONALS.RECTILINEAR
  },
]

const ORIGIN = {
  x: 0, y: 0
}
// Fire angles in screen degrees: east, south, north, and the south-east diagonal.
const FIRE_ANGLES = [0, 90, -90, 45]

const CARDINALS = [1, 3, 5, 7]
const DIAGONAL_ROLLS = [2, 4, 6, 8]

describe("SR5_CombatHelpers.scatterOffset — SR5 p. 183", () => {
  for (const scale of SCALES){
    for (const rule of RULES){
      it(`lands at the announced distance for every 2D6 result and line of fire (${scale.label}, ${rule.label})`, () => {
        const grid = new FakeSquareGrid({
          ...scale, diagonals: rule.diagonals
        })
        for (const distance of [1, 6, 13]){
          for (const fire of FIRE_ANGLES){
            for (let direction = 2; direction <= 12; direction++){
              const offset = SR5_CombatHelpers.scatterOffset(grid, direction, distance, fire)
              const read = grid.measurePath([ORIGIN, offset]).distance
              expect(read, `2D6 = ${direction}, fire ${fire} deg, ${distance} m`).toBeCloseTo(distance, 6)
            }
          }
        }
      })
    }
  }
})

// The bearing an offset points at, in screen degrees within [0, 360).
function bearing(o){
  return ((Math.atan2(o.y, o.x) * 180 / Math.PI) % 360 + 360) % 360
}

describe("Scatter Diagram — SR5 p. 183: the 2D6 turns with the line of fire", () => {
  const grid = new FakeSquareGrid({
    size: 100, distance: 1.5, diagonals: DIAGONALS.EQUIDISTANT
  })

  // Expected turn from the line of fire for each 2D6, as read off the diagram: right of the attacker is
  // clockwise on screen. 3 and 11 are drawn at 129.5 deg; 135 is the reading kept.
  const TURN = {
    2: 180, 3: -135, 4: -90, 5: -60, 6: -30, 7: 0, 8: 30, 9: 60, 10: 90, 11: 135, 12: 180
  }

  for (const fire of FIRE_ANGLES){
    it(`points each result where the diagram says, firing at ${fire} deg`, () => {
      for (let roll = 2; roll <= 12; roll++){
        const o = SR5_CombatHelpers.scatterOffset(grid, roll, 6, fire)
        const expected = ((fire + TURN[roll]) % 360 + 360) % 360
        const got = bearing(o)
        const gap = Math.min(Math.abs(got - expected), 360 - Math.abs(got - expected))
        expect(gap, `2D6 = ${roll}, fire ${fire} deg`).toBeLessThan(1e-6)
      }
    })
  }

  it("7 carries on beyond the target, 2 and 12 come back toward the attacker", () => {
    // Attacker west of the target, firing east: 7 goes further east, 2 and 12 go back west.
    const fire = SR5_CombatHelpers.fireAngle({
      x: 0, y: 0
    }, {
      x: 1000, y: 0
    })
    expect(fire).toBe(0)
    expect(SR5_CombatHelpers.scatterOffset(grid, 7, 6, fire).x).toBeCloseTo(400, 6)
    expect(SR5_CombatHelpers.scatterOffset(grid, 2, 6, fire).x).toBeCloseTo(-400, 6)
    expect(SR5_CombatHelpers.scatterOffset(grid, 12, 6, fire).x).toBeCloseTo(-400, 6)
    // Firing north (toward smaller y), 7 goes further north and 10 to the attacker's right, east.
    const north = SR5_CombatHelpers.fireAngle({
      x: 0, y: 1000
    }, {
      x: 0, y: 0
    })
    expect(SR5_CombatHelpers.scatterOffset(grid, 7, 6, north).y).toBeCloseTo(-400, 6)
    expect(SR5_CombatHelpers.scatterOffset(grid, 10, 6, north).x).toBeCloseTo(400, 6)
    expect(SR5_CombatHelpers.scatterOffset(grid, 4, 6, north).x).toBeCloseTo(-400, 6)
  })

  it("has no line of fire without an attacker, and then reads 7 as east", () => {
    expect(SR5_CombatHelpers.fireAngle(undefined, {
      x: 5, y: 5
    })).toBe(0)
    expect(SR5_CombatHelpers.fireAngle({
      x: 5, y: 5
    }, {
      x: 5, y: 5
    })).toBe(0)
  })
})

describe("SR5_CombatHelpers.scatterOffset — the old 1d8 compass", () => {

  it("the old code was wrong on the four diagonals under either reading, and right on the four cardinals", () => {
    const grid = new FakeSquareGrid({
      size: 100, distance: 1.5, diagonals: DIAGONALS.EQUIDISTANT
    })
    for (const direction of CARDINALS){
      const before = legacyOffset(grid, direction, 6)
      expect(grid.measurePath([ORIGIN, before]).distance).toBeCloseTo(6, 6)
    }
    for (const direction of DIAGONAL_ROLLS){
      const before = legacyOffset(grid, direction, 6)
      // Half the announced distance by the scene's ruler...
      expect(grid.measurePath([ORIGIN, before]).distance).toBeCloseTo(3, 6)
      // ...and 4.24 m as the crow flies, so short under the other reading too.
      const asCrowFlies = Math.hypot(before.x, before.y) / (grid.size / grid.distance)
      expect(asCrowFlies).toBeCloseTo(6 / Math.SQRT2, 6)
    }
  })
})
