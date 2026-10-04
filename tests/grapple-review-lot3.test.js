import {
  describe, it, expect
} from 'vitest'

import {
  staleHoldWarning, isClinchFirearm, clinchAttackPenalty
} from '../modules/rolls/roll-helpers/grapple-rules.js'
import {
  SR5
} from '../modules/config.js'

const clinch = [{
  flags: {
    sr5: {
      grapple: {
        role: "held", kind: "clinch", partner: "a", hold: 3, holdId: "c1"
      }
    }
  }
}]

describe('"Let go" on an old clinch card (review of lot 3, point 1)', () => {
  it('works on the clinch it was posted for', () => {
    expect(staleHoldWarning({
      kind: "clinch", holdId: "c1"
    }, "c1")).toBe(null)
  })
  it('counter-proof: is refused once a subdue replaced the clinch', () => {
    expect(staleHoldWarning({
      kind: "subdue", holdId: "s1"
    }, "c1")).toBe("SR5.WARN_GrappleHoldChanged")
  })
})

describe('the firearms of the clinch penalty (point 2, SR5 p. 135 and 427)', () => {
  it('include tasers, pistols, rifles and heavy weapons', () => {
    for (const type of ["taser", "heavyPistol", "holdOut", "assaultRifle", "shotgun", "submachineGun", "grenadeLauncher", "assaultCannon", "missileLauncher"]){
      expect(isClinchFirearm(type), type).toBe(true)
    }
  })
  it('counter-proof: leave out bows, crossbows, throwing and exotic ranged weapons', () => {
    for (const type of ["bow", "lightCrossbow", "mediumCrossbow", "heavyCrossbow", "throwing", "exoticRangedWeapon"]){
      expect(isClinchFirearm(type), type).toBe(false)
    }
  })
  it('gives a taser the penalty of the hold', () => {
    expect(clinchAttackPenalty(clinch, {
      category: "rangedWeapon", isFirearm: isClinchFirearm("taser")
    })).toBe(-3)
  })
  it('counts every type of the ranged weapon list one way or the other', () => {
    expect(Object.keys(SR5.rangedWeaponTypes).filter(t => !isClinchFirearm(t)).sort())
      .toEqual(["bow", "exoticRangedWeapon", "heavyCrossbow", "lightCrossbow", "mediumCrossbow", "throwing"])
  })
})

describe('the attack card names the grappling attacks (point 3)', () => {
  it('has a label for subdue and strengthen the hold', () => {
    expect(SR5.calledShotsAll.subdue).toBe("SR5.CS_Subdue")
    expect(SR5.calledShotsAll.strengthenHold).toBe("SR5.CS_StrengthenHold")
  })
})
