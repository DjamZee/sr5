import {
  describe, it, expect
} from 'vitest'

import {
  subdueTakesHold, grappleHoldOf, grappleEscapeThreshold, canStartHold,
  strengthenedHold, holdsTarget, isSubdued, grapplingCalledShots, crushDamage
} from '../modules/rolls/roll-helpers/grapple-rules.js'

const held = (hold) => [{
  flags: {
    sr5: {
      grapple: {
        role: "held", kind: "subdue", partner: "a", hold
      }
    }
  }
}]
const holder = [{
  flags: {
    sr5: {
      grapple: {
        role: "holder", kind: "subdue", partner: "b", hold: 4
      }
    }
  }
}]

// SR5 p. 195-196, example : Wombat, Strength 5, 4 net hits, against Full Deck's Physical limit 3.
describe('subdueTakesHold', () => {
  it('holds when Strength + net hits exceed the Physical limit (Wombat)', () => {
    expect(subdueTakesHold(4, 5, 3)).toBe(true)
  })
  it('does not hold when the total only equals the limit', () => {
    expect(subdueTakesHold(1, 4, 5)).toBe(false)
  })
  it('does not hold when the attack missed', () => {
    expect(subdueTakesHold(0, 9, 1)).toBe(false)
  })
})

describe('grappleEscapeThreshold', () => {
  it('is the net hits of the hold for the held fighter (Full Deck: 4)', () => {
    expect(grappleEscapeThreshold(held(4))).toBe(4)
  })
  it('is null for the holder and for a free actor', () => {
    expect(grappleEscapeThreshold(holder)).toBe(null)
    expect(grappleEscapeThreshold([{
      flags: {
      }
    }])).toBe(null)
  })
  it('never goes below 0', () => {
    expect(grappleEscapeThreshold(held(-2))).toBe(0)
  })
})

describe('canStartHold', () => {
  it('lets two free fighters grapple', () => {
    expect(canStartHold([], [])).toBe(true)
  })
  it('refuses a second hold on a fighter already in one (ruling of DjamZ)', () => {
    expect(canStartHold([], held(2))).toBe(false)
    expect(canStartHold(holder, [])).toBe(false)
  })
  it('reads the flag of the grappling effect', () => {
    expect(grappleHoldOf(holder).partner).toBe("b")
  })
})

// SR5 p. 196 : the holder's options while keeping the hold
describe('strengthenedHold', () => {
  it('adds the attacker net hits to the hold', () => {
    expect(strengthenedHold(4, 2)).toBe(6)
  })
  it('weakens the hold when the defender gets more hits', () => {
    expect(strengthenedHold(4, -3)).toBe(1)
  })
  it('stops at 0 (ruling of DjamZ: only an escape frees)', () => {
    expect(strengthenedHold(1, -5)).toBe(0)
  })
})

describe('holdsTarget and isSubdued', () => {
  it('knows the holder of this very target', () => {
    expect(holdsTarget(holder, "b")).toBe(true)
    expect(holdsTarget(holder, "c")).toBe(false)
    expect(holdsTarget(held(2), "a")).toBe(false)
  })
  it('counts the subdued fighter as prone, not the holder', () => {
    expect(isSubdued(held(2))).toBe(true)
    expect(isSubdued(holder)).toBe(false)
  })
})

describe('grapplingCalledShots', () => {
  it('offers to subdue with an unarmed attack', () => {
    expect(grapplingCalledShots({
      unarmed: true, holdingTarget: false
    })).toEqual(["subdue"])
  })
  it('offers to strengthen the hold against the held partner', () => {
    expect(grapplingCalledShots({
      unarmed: true, holdingTarget: true
    })).toEqual(["strengthenHold"])
  })
  it('offers nothing with a weapon', () => {
    expect(grapplingCalledShots({
      unarmed: false, holdingTarget: true
    })).toEqual([])
  })
})

describe('crushDamage', () => {
  it('deals Strength as Stun damage (Wombat: 5S)', () => {
    expect(crushDamage(5)).toEqual({
      value: 5, type: "stun"
    })
  })
})
