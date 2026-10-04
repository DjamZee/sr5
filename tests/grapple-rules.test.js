import {
  describe, it, expect
} from 'vitest'

import {
  subdueTakesHold, grappleHoldOf, grappleEscapeThreshold, canStartHold
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
