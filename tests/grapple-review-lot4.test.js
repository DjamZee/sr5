import {
  describe, it, expect
} from 'vitest'

import {
  counterGrappleHold, reversalRoles, staleHoldWarning
} from '../modules/rolls/roll-helpers/grapple-rules.js'
import {
  grappleEscapeOutcome
} from '../modules/rolls/roll-helpers/grappleEscape.js'

describe('the Contre-prise path (review of lot 4, points 1 and 3, Run & Gun p. 148-149)', () => {
  it('offers the choice only after a successful escape with the technique', () => {
    expect(grappleEscapeOutcome(4, 2, true)).toBe("counterGrapple")
    expect(grappleEscapeOutcome(4, 2, false)).toBe("success")
    expect(grappleEscapeOutcome(1, 2, true)).toBe("failed")
  })
  it('gives the new hold the hits above the STORED hold', () => {
    expect(counterGrappleHold(5, 1)).toBe(4)
  })
  it('counter-proof: a threshold lowered in the dialog does not raise the new hold', () => {
    //The roller typed 0 instead of the stored 3: 5 hits make a hold of 2, not 5
    expect(counterGrappleHold(5, 3)).toBe(2)
    expect(counterGrappleHold(5, 0)).not.toBe(counterGrappleHold(5, 3))
  })
  it('is at least 1 (ruling of DjamZ, Q8)', () => {
    expect(counterGrappleHold(3, 3)).toBe(1)
  })
  it('a button left after the hold changed is refused', () => {
    expect(staleHoldWarning({
      holdId: "new"
    }, "old")).toBe("SR5.WARN_GrappleHoldChanged")
  })
})

describe('reverseHold: the roles after a reversal (point 3)', () => {
  const held = {
    role: "held", kind: "clinch", partner: "holder", hold: 2, holdId: "h"
  }
  it('makes the reverser the holder, the former holder held, in a hold of the same kind', () => {
    expect(reversalRoles(held, "reverser")).toEqual({
      holderId: "reverser", heldId: "holder", kind: "clinch"
    })
  })
  it('counter-proof: does nothing for a fighter who is not held', () => {
    expect(reversalRoles({
      ...held, role: "holder"
    }, "reverser")).toBe(null)
    expect(reversalRoles(null, "reverser")).toBe(null)
  })
})
