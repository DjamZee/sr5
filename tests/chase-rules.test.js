import {
  describe, it, expect
} from 'vitest'
import {
  chaseRanges, normalizeRange, rangeDistance, shiftRange, terrainList, normalizeTerrain, terrainValue,
  kindOfCategory, effectiveSpeed, speedBounds, clampSpeed, chaseThreshold, isFastest, pairKey, markControlled,
  endOfTurn, chaseEndReason
} from '../modules/system/chase-rules.js'

// Vehicle chases (R12, part 1): the core book's chase (SR5 p. 199-205) by default, Rigger 5.0's advanced driving
// rules (p. 175-185) when the world setting is on.

describe('engagement ranges', () => {
  it('the core book has four ranges, Rigger 5.0 adds Contact, and Spotting with an aircraft (SR5 p. 204, R5 p. 176)', () => {
    expect(chaseRanges(false)).toEqual(['short', 'medium', 'long', 'extreme'])
    expect(chaseRanges(false, true)).toEqual(['short', 'medium', 'long', 'extreme'])
    expect(chaseRanges(true)).toEqual(['contact', 'short', 'medium', 'long', 'extreme'])
    expect(chaseRanges(true, true)).toEqual(['contact', 'short', 'medium', 'long', 'extreme', 'spotting'])
  })

  it('gives the distances of the environment (SR5 p. 204) or of Rigger 5.0 (p. 176)', () => {
    expect(rangeDistance('medium', false, 'speed')).toEqual([11, 50])
    expect(rangeDistance('medium', false, 'handling')).toEqual([6, 20])
    expect(rangeDistance('contact', true)).toEqual([0, 2])
    expect(rangeDistance('contact', false)).toBeNull()
  })

  it('closes and opens the range, never nearer than the nearest', () => {
    expect(shiftRange('long', -1, false)).toEqual({
      range: 'medium', escaped: false
    })
    expect(shiftRange('short', -2, false)).toEqual({
      range: 'short', escaped: false
    })
    expect(shiftRange('short', -2, true)).toEqual({
      range: 'contact', escaped: false
    })
    expect(shiftRange('medium', 2, false)).toEqual({
      range: 'extreme', escaped: false
    })
  })

  it('past Extreme the pursued gets away (SR5 p. 205, R5 p. 177); an aircraft still keeps Spotting (R5 p. 177)', () => {
    expect(shiftRange('extreme', 1, false)).toEqual({
      range: 'extreme', escaped: true
    })
    expect(shiftRange('long', 3, true)).toEqual({
      range: 'extreme', escaped: true
    })
    expect(shiftRange('extreme', 1, true, true)).toEqual({
      range: 'spotting', escaped: false
    })
    expect(shiftRange('spotting', 1, true, true)).toEqual({
      range: 'spotting', escaped: true
    })
  })

  it('a range the rule set no longer has moves to the nearest it has', () => {
    expect(normalizeRange('contact', false)).toBe('short')
    expect(normalizeRange('spotting', true, false)).toBe('extreme')
    expect(normalizeRange(undefined, false)).toBe('medium')
    expect(normalizeRange('long', true)).toBe('long')
  })
})

describe('terrain', () => {
  it('keeps the two lists apart: « Restreint » is +3 in the core book, +2 in Rigger 5.0 (SR5 p. 201, R5 p. 175)', () => {
    expect(terrainValue('restricted', false)).toBe(3)
    expect(terrainValue('r5Restricted', true)).toBe(2)
    expect(terrainList(false).map(t => [t.key, t.value])).toEqual([
      ['clear', 0], ['normal', 1], ['limited', 2], ['restricted', 3]
    ])
    expect(terrainList(true).map(t => [t.key, t.value])).toEqual([
      ['r5Open', 0], ['r5Light', 1], ['r5Restricted', 2], ['r5Obstructed', 3], ['r5Tight', 4], ['r5Impossible', 6]
    ])
    // No key is shared: the core book's « Restreint » is never read as Rigger 5.0's
    const book = terrainList(false).map(t => t.key)
    expect(terrainList(true).some(t => book.includes(t.key))).toBe(false)
    // A core « Restreint » left in the register is worth Rigger 5.0's « Exigu » once the setting is checked
    expect(terrainValue('restricted', true)).toBe(4)
  })

  it('switching rule sets moves the terrain to the same place, by the printed examples', () => {
    // Core « Restreint » (+3: dense forests, swamps) is Rigger 5.0's « Exigu » (+4), not its « Restreint » (+2)
    expect(normalizeTerrain('restricted', true)).toBe('r5Tight')
    expect(normalizeTerrain('limited', true)).toBe('r5Restricted')
    expect(normalizeTerrain('r5Restricted', false)).toBe('limited')
    expect(normalizeTerrain('r5Impossible', false)).toBe('restricted')
    expect(normalizeTerrain('', true)).toBe('r5Open')
    expect(normalizeTerrain(undefined, false)).toBe('clear')
  })
})

describe('speed', () => {
  it('Rigger 5.0: up by the Acceleration, down by one, within the Speed attribute (R5 p. 176)', () => {
    expect(speedBounds(3, 2, 6, true)).toEqual({
      min: 2, max: 5
    })
    expect(speedBounds(5, 2, 6, true)).toEqual({
      min: 4, max: 6
    })
    expect(speedBounds(0, 1, 4, true)).toEqual({
      min: 0, max: 1
    })
  })

  it('the core book tracks no current Speed: anything up to the attribute', () => {
    expect(speedBounds(3, 2, 6, false)).toEqual({
      min: 0, max: 6
    })
  })

  it('clamps the Speed the gamemaster types', () => {
    expect(clampSpeed(9, {
      min: 2, max: 5
    })).toBe(5)
    expect(clampSpeed(-1, {
      min: 2, max: 5
    })).toBe(2)
    expect(clampSpeed('4', {
      min: 2, max: 5
    })).toBe(4)
  })

  it('makes Speeds comparable by kind (R5 p. 184)', () => {
    expect(effectiveSpeed(2, 'rotor')).toBe(6)
    expect(effectiveSpeed(5, 'water')).toBe(4)
    expect(kindOfCategory('fixedWingAircraft')).toBe('jet')
    expect(kindOfCategory('car')).toBe('ground')
    expect(kindOfCategory(undefined)).toBe('ground')
  })
})

describe('threshold of an action against another vehicle (R5 p. 177)', () => {
  const fast = {
    id: 'a', speed: 4, kind: 'ground'
  }
  const slow = {
    id: 'b', speed: 1, kind: 'ground'
  }

  it('Terrain + the gap between the Speeds', () => {
    expect(chaseThreshold({
      terrain: 2, initiator: slow, target: fast
    })).toBe(5)
  })

  it('only the Terrain when the initiator is the fastest (R5 p. 185, Daft: Terrain 2, threshold 2)', () => {
    expect(isFastest(fast, [fast, slow])).toBe(true)
    expect(isFastest(slow, [fast, slow])).toBe(false)
    expect(chaseThreshold({
      terrain: 2, initiator: fast, target: slow, fastest: true
    })).toBe(2)
  })

  it('lowered by the control rig, never under 1 (SR5 p. 200, 268)', () => {
    expect(chaseThreshold({
      terrain: 2, initiator: slow, target: fast, controlRig: 2
    })).toBe(3)
    expect(chaseThreshold({
      terrain: 1, initiator: fast, target: slow, fastest: true, controlRig: 3
    })).toBe(1)
    expect(chaseThreshold({
      terrain: 0, initiator: fast, target: slow, fastest: true, controlRig: 3
    })).toBe(0)
  })

  it('an aircraft counts its Speed three times (R5 p. 184)', () => {
    expect(chaseThreshold({
      terrain: 0, initiator: {
        speed: 4, kind: 'ground'
      }, target: {
        speed: 2, kind: 'rotor'
      }
    })).toBe(2)
  })
})

describe('out of control (SR5 p. 203, R5 p. 176)', () => {
  const vehicle = {
    id: 'v', controlled: false, outOfControl: false, uncontrolledTurns: 0, autopilot: false
  }

  it('a controlled vehicle stays under control, and the check is cleared for the next turn', () => {
    const {
      vehicle: next, event
    } = endOfTurn({
      ...vehicle, controlled: true
    })
    expect(event).toBeNull()
    expect(next).toMatchObject({
      controlled: false, outOfControl: false, uncontrolledTurns: 0
    })
  })

  it('a first turn without control: out of control, −2 dice aboard', () => {
    const {
      vehicle: next, event
    } = endOfTurn(vehicle, {
      hasAutopilot: true
    })
    expect(event).toBe('outOfControl')
    expect(next).toMatchObject({
      outOfControl: true, uncontrolledTurns: 1
    })
  })

  it('a second one: the autopilot takes over at the end of that turn', () => {
    const first = endOfTurn(vehicle, {
      hasAutopilot: true
    }).vehicle
    const {
      vehicle: next, event
    } = endOfTurn(first, {
      hasAutopilot: true
    })
    expect(event).toBe('autopilot')
    expect(next).toMatchObject({
      outOfControl: false, autopilot: true
    })
    // Driven by its autopilot, it stays under control the turns after
    expect(endOfTurn(next, {
      hasAutopilot: true
    }).event).toBeNull()
  })

  it('without autopilot, it goes on straight, out of control, said once', () => {
    const first = endOfTurn(vehicle).vehicle
    const second = endOfTurn(first)
    expect(second.event).toBe('adrift')
    expect(second.vehicle).toMatchObject({
      outOfControl: true, uncontrolledTurns: 2
    })
    const third = endOfTurn(second.vehicle)
    expect(third.event).toBeNull()
    expect(third.vehicle.outOfControl).toBe(true)
  })

  it('a vehicle on autopilot is driven by it: never out of control', () => {
    expect(endOfTurn(vehicle, {
      hasAutopilot: true, onAutopilot: true
    }).event).toBeNull()
  })

  it('the Control action lifts the −2 at once (R5 p. 176: until a control action is taken)', () => {
    expect(markControlled({
      ...vehicle, outOfControl: true, uncontrolledTurns: 2, autopilot: true
    })).toMatchObject({
      controlled: true, outOfControl: false, uncontrolledTurns: 0, autopilot: false
    })
  })
})

describe('end of the chase', () => {
  it('a destroyed vehicle leaves the chase in both rule sets', () => {
    expect(chaseEndReason({
      monitorFull: true, handling: 3, speed: 2, acceleration: 1
    }, false)).toBe('destroyed')
    expect(chaseEndReason({
      monitorFull: true
    }, true)).toBe('destroyed')
  })

  it('Rigger 5.0: Handling 0 pins it, Speed and Acceleration both 0 immobilize it (R5 p. 175)', () => {
    expect(chaseEndReason({
      handling: 0, speed: 3, acceleration: 2
    }, true)).toBe('pinned')
    expect(chaseEndReason({
      handling: 3, speed: 0, acceleration: 0
    }, true)).toBe('immobilized')
    expect(chaseEndReason({
      handling: 3, speed: 0, acceleration: 2
    }, true)).toBeNull()
  })

  it('the core book knows neither', () => {
    expect(chaseEndReason({
      handling: 0, speed: 0, acceleration: 0
    }, false)).toBeNull()
  })
})

describe('pairs', () => {
  it('one key whichever vehicle comes first', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'))
  })
})
