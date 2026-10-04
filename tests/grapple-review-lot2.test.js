import {
  describe, it, expect
} from 'vitest'

import {
  canUseHoldCard, staleHoldWarning, isHeldBy, tokenForBaseActor
} from '../modules/rolls/roll-helpers/grapple-rules.js'

const heldBy = (partner, holdId) => [{
  flags: {
    sr5: {
      grapple: {
        role: "held", kind: "subdue", partner, hold: 3, holdId
      }
    }
  }
}]

describe('the buttons of a hold card (review of lot 2, point 1)', () => {
  it('are for the GM and the owner of the one who holds', () => {
    expect(canUseHoldCard(true, false)).toBe(true)
    expect(canUseHoldCard(false, true)).toBe(true)
  })
  it('counter-proof: not for another player', () => {
    expect(canUseHoldCard(false, false)).toBe(false)
  })
})

describe('an old "apply the hold" button (point 2)', () => {
  it('applies to the hold it was rolled against', () => {
    expect(staleHoldWarning({
      holdId: "h1"
    }, "h1")).toBe(null)
  })
  it('counter-proof: is refused once a newer hold took its place', () => {
    expect(staleHoldWarning({
      holdId: "h2"
    }, "h1")).toBe("SR5.WARN_GrappleHoldChanged")
  })
  it('counter-proof: says so when the hold is gone', () => {
    expect(staleHoldWarning(null, "h1")).toBe("SR5.WARN_GrappleNoHold")
  })
})

describe('strengthening against the right fighter (point 3)', () => {
  it('needs the defender to be held by the attacker', () => {
    expect(isHeldBy(heldBy("attacker"), "attacker")).toBe(true)
  })
  it('counter-proof: not by someone else', () => {
    expect(isHeldBy(heldBy("someoneElse"), "attacker")).toBe(false)
  })
})

describe('an unlinked token rolled from its base actor (point 4)', () => {
  it('puts the hold on the controlled token of that actor', () => {
    expect(tokenForBaseActor({
      isToken: false, actorLink: false, tokenIds: ["t1", "t2"], controlledIds: ["t2"]
    })).toBe("t2")
  })
  it('or on its only token on the scene', () => {
    expect(tokenForBaseActor({
      isToken: false, actorLink: false, tokenIds: ["t1"], controlledIds: []
    })).toBe("t1")
  })
  it('counter-proof: leaves a linked actor, a token actor, or an undecidable case alone', () => {
    expect(tokenForBaseActor({
      isToken: false, actorLink: true, tokenIds: ["t1"]
    })).toBe(null)
    expect(tokenForBaseActor({
      isToken: true, actorLink: false, tokenIds: ["t1"]
    })).toBe(null)
    expect(tokenForBaseActor({
      isToken: false, actorLink: false, tokenIds: ["t1", "t2"], controlledIds: []
    })).toBe(null)
  })
})
