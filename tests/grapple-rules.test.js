import {
  describe, it, expect
} from 'vitest'

import {
  subdueTakesHold, grappleHoldOf, grappleEscapeThreshold, canStartHold,
  strengthenedHold, holdsTarget, isSubdued, grapplingCalledShots, crushDamage,
  clinchTakesHold, clinchAttackPenalty, clinchCancelsReach, holdReplacesClinch, holdKindOn,
  isHeldBy, holdAfterReversal
} from '../modules/rolls/roll-helpers/grapple-rules.js'

// Run & Gun p. 126 and 138, Renversement de situation; p. 148-149, Contre-prise
describe('reversal', () => {
  it('is offered to the fighter held by the target, with the technique, in melee', () => {
    expect(grapplingCalledShots({
      unarmed: true, holdKind: null, heldByTarget: true, canReverse: true
    })).toEqual(["subdue", "reversal"])
    expect(grapplingCalledShots({
      unarmed: false, melee: true, holdKind: null, heldByTarget: true, canReverse: true
    })).toEqual(["reversal"])
  })
  it('is not offered without the technique, outside a hold, or at range', () => {
    expect(grapplingCalledShots({
      unarmed: true, holdKind: null, heldByTarget: true, canReverse: false
    })).toEqual(["subdue"])
    expect(grapplingCalledShots({
      unarmed: true, holdKind: null, heldByTarget: false, canReverse: true
    })).toEqual(["subdue"])
    expect(grapplingCalledShots({
      unarmed: false, melee: false, holdKind: null, heldByTarget: true, canReverse: true
    })).toEqual([])
  })
  it('knows who is held by whom', () => {
    expect(isHeldBy(clinch("held", "a", 2), "a")).toBe(true)
    expect(isHeldBy(clinch("holder", "b", 2), "b")).toBe(false)
    expect(isHeldBy(clinch("held", "a", 2), "z")).toBe(false)
  })
  it('gives the new hold the net hits, at least 1 (pending the ruling of DjamZ, Q7-Q8)', () => {
    expect(holdAfterReversal(3)).toBe(3)
    expect(holdAfterReversal(0)).toBe(1)
  })
})

const clinch = (role, partner, hold) => [{
  flags: {
    sr5: {
      grapple: {
        role, kind: "clinch", partner, hold
      }
    }
  }
}]

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
      unarmed: true, holdKind: null
    })).toEqual(["subdue"])
  })
  it('offers to strengthen the hold against the subdued partner', () => {
    expect(grapplingCalledShots({
      unarmed: true, holdKind: "subdue"
    })).toEqual(["strengthenHold"])
  })
  it('offers to subdue the clinched partner (Run & Gun p. 134)', () => {
    expect(grapplingCalledShots({
      unarmed: true, holdKind: "clinch"
    })).toEqual(["subdue"])
  })
  it('offers nothing with a weapon', () => {
    expect(grapplingCalledShots({
      unarmed: false, holdKind: "subdue"
    })).toEqual([])
  })
})

// Run & Gun p. 133-134, Saisie
describe('clinch', () => {
  it('holds with at least one net hit', () => {
    expect(clinchTakesHold(1)).toBe(true)
    expect(clinchTakesHold(0)).toBe(false)
  })
  it('gives melee weapons a penalty equal to their Reach, for both fighters', () => {
    expect(clinchAttackPenalty(clinch("holder", "b", 3), {
      category: "meleeWeapon", reach: 2
    })).toBe(-2)
    expect(clinchAttackPenalty(clinch("held", "a", 3), {
      category: "meleeWeapon", reach: 1
    })).toBe(-1)
  })
  it('gives firearms a penalty equal to the net hits of the clinch', () => {
    expect(clinchAttackPenalty(clinch("held", "a", 3), {
      category: "rangedWeapon", isFirearm: true
    })).toBe(-3)
  })
  it('leaves other weapons and fighters out of a clinch alone', () => {
    expect(clinchAttackPenalty(clinch("held", "a", 3), {
      category: "rangedWeapon", isFirearm: false
    })).toBe(0)
    expect(clinchAttackPenalty(held(3), {
      category: "meleeWeapon", reach: 2
    })).toBe(0)
  })
  it('cancels Reach between the two fighters only', () => {
    expect(clinchCancelsReach(clinch("held", "a", 3), "a")).toBe(true)
    expect(clinchCancelsReach(clinch("held", "a", 3), "z")).toBe(false)
  })
  it('lets the clincher subdue their partner, replacing the clinch', () => {
    expect(holdKindOn(clinch("holder", "b", 2), "b")).toBe("clinch")
    expect(holdReplacesClinch(clinch("holder", "b", 2), "b", "subdue")).toBe(true)
    expect(holdReplacesClinch(clinch("held", "a", 2), "a", "subdue")).toBe(false)
    expect(holdReplacesClinch(holder, "b", "subdue")).toBe(false)
  })
})

describe('crushDamage', () => {
  it('deals Strength as Stun damage (Wombat: 5S)', () => {
    expect(crushDamage(5)).toEqual({
      value: 5, type: "stun"
    })
  })
})
