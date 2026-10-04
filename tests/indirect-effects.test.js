import {
  describe, it, expect
} from "vitest"
import {
  isIndirect, indirectEffectOf, rollKinds, auraReaches, gatherIndirectOffers, applyOffer
} from "../modules/rolls/roll-helpers/indirect.js"

const SOCIAL = {
  con: "", negotiation: ""
}
const LABELS = {
  targeter: "cible", aura: "zone", neutral: "Effet extérieur"
}

// "Rascal" is a GM-made example (no book has it): -2 dice to the matrix tests aimed at its bearer
const rascal = indirectEffectOf({
  target: "indirect.matrix.test", type: "value", value: -2
}, "Rascal", -2)
// Concealment (SR5 p. 398): -Magic dice to Perception tests to locate the bearer
const concealment = indirectEffectOf({
  target: "indirect.perception.test", type: "value", value: -5
}, "Dissimulation", -5)

describe("indirect effects: reading the item's effect", () => {
  it("is recognised by its target, never applied to the bearer's own sheet", () => {
    expect(isIndirect({
      target: "indirect.matrix.test"
    })).toBe(true)
    expect(isIndirect({
      target: "system.skills.perception.test"
    })).toBe(false)
    expect(isIndirect({
    })).toBe(false)
  })
  it("reaches whoever targets the bearer by default", () => {
    expect(rascal).toMatchObject({
      applyTo: "targeter", rolls: "matrix", kind: "dicePool", value: -2
    })
  })
  it("can be an aura on the limit, for allies", () => {
    let e = indirectEffectOf({
      target: "indirect.perception.limit", applyTo: "aura", auraRange: "10", auraWho: "allies"
    }, "Tacnet", 1)
    expect(e).toMatchObject({
      applyTo: "aura", kind: "limit", range: "10", who: "allies"
    })
  })
  it("refuses an unknown target", () => {
    expect(indirectEffectOf({
      target: "indirect.flying.test"
    }, "x", 1)).toBeNull()
  })
})

describe("indirect effects: the rolls concerned", () => {
  it("sorts attacks by weapon category, a grenade being ranged", () => {
    expect(rollKinds({
      type: "attack", typeSub: "meleeWeapon"
    }).has("meleeAttack")).toBe(true)
    expect(rollKinds({
      type: "attack", typeSub: "grenade"
    }).has("rangedAttack")).toBe(true)
  })
  it("knows matrix, perception and social tests", () => {
    expect(rollKinds({
      type: "matrixAction", typeSub: "bruteForce"
    }).has("matrix")).toBe(true)
    expect(rollKinds({
      type: "skillDicePool", typeSub: "perception"
    }).has("perception")).toBe(true)
    expect(rollKinds({
      type: "skillDicePool", typeSub: "con"
    }, SOCIAL).has("social")).toBe(true)
  })
  it("does not count a defense as aimed at its attacker", () => {
    expect(rollKinds({
      type: "matrixDefense"
    }).has("aimed")).toBe(false)
    expect(rollKinds({
      type: "attack"
    }).has("aimed")).toBe(true)
  })
})

describe("indirect effects: whoever targets me", () => {
  it("gives the hacker aiming at Rascal's bearer a ticked -2 box naming both", () => {
    let offers = gatherIndirectOffers({
      kinds: rollKinds({
        type: "matrixAction"
      }), target: {
        name: "Kiko", effects: [rascal]
      }, labels: LABELS
    })
    expect(offers).toEqual([expect.objectContaining({
      label: "Rascal (cible : Kiko)", value: -2, checked: true, hidden: false
    })])
  })
  it("leaves the other rolls alone", () => {
    let offers = gatherIndirectOffers({
      kinds: rollKinds({
        type: "attack", typeSub: "rangedWeapon"
      }), target: {
        name: "Kiko", effects: [rascal]
      }, labels: LABELS
    })
    expect(offers).toEqual([])
  })
  it("does nothing without a target", () => {
    expect(gatherIndirectOffers({
      kinds: rollKinds({
        type: "matrixAction"
      }), target: null, labels: LABELS
    })).toEqual([])
  })
  it("leaves a defense alone, whose target is the attacker", () => {
    expect(gatherIndirectOffers({
      kinds: rollKinds({
        type: "matrixDefense"
      }), target: {
        name: "Kiko", effects: [rascal]
      }, labels: LABELS
    })).toEqual([])
  })
  it("hides the source on demand, or the box altogether", () => {
    let kinds = rollKinds({
      type: "skillDicePool", typeSub: "perception"
    })
    let [neutral] = gatherIndirectOffers({
      kinds, target: {
        name: "Esprit", effects: [concealment]
      }, display: "neutral", labels: LABELS
    })
    expect(neutral.label).toBe("Effet extérieur")
    let [hidden] = gatherIndirectOffers({
      kinds, target: {
        name: "Esprit", effects: [concealment]
      }, display: "hidden", labels: LABELS
    })
    expect(hidden.hidden).toBe(true)
  })
})

describe("indirect effects: auras", () => {
  const aura = (who, range = "10") => indirectEffectOf({
    target: "indirect.all.test", applyTo: "aura", auraRange: range, auraWho: who
  }, "Aura", 1)
  it("reach within the radius in meters, bounds included", () => {
    expect(auraReaches(aura("all"), 10, 1, -1, false)).toBe(true)
    expect(auraReaches(aura("all"), 10.5, 1, -1, false)).toBe(false)
    expect(auraReaches(aura("all", ""), 500, 1, -1, false)).toBe(true)
  })
  it("sort allies and enemies by token disposition", () => {
    expect(auraReaches(aura("allies"), 1, 1, 1, false)).toBe(true)
    expect(auraReaches(aura("allies"), 1, 1, -1, false)).toBe(false)
    expect(auraReaches(aura("enemies"), 1, 1, -1, false)).toBe(true)
    expect(auraReaches(aura("enemies"), 1, 1, 0, false)).toBe(false)
  })
  it("reach their bearer, unless they are for enemies", () => {
    expect(auraReaches(aura("allies"), 0, 1, 1, true)).toBe(true)
    expect(auraReaches(aura("enemies"), 0, 1, 1, true)).toBe(false)
  })
  it("apply to any roll, aimed or not", () => {
    let offers = gatherIndirectOffers({
      kinds: rollKinds({
        type: "defense"
      }), auras: [{
        name: "Chef", effects: [aura("allies")], distance: 3, disposition: 1
      }], rollerDisposition: 1, labels: LABELS
    })
    expect(offers[0].label).toBe("Aura (zone : Chef)")
  })
})

describe("indirect effects: ticked beforehand", () => {
  it("are counted in the pool or on the limit under the box's key, so that unticking removes them", () => {
    let rollData = {
      dicePool: {
        modifiers: []
      }, limit: {
        modifiers: {
        }
      }
    }
    let [dice] = gatherIndirectOffers({
      kinds: rollKinds({
        type: "matrixAction"
      }), target: {
        name: "Kiko", effects: [rascal]
      }, labels: LABELS
    })
    applyOffer(rollData, dice)
    expect(rollData.dicePool.modifiers).toEqual([{
      type: dice.key, label: dice.label, value: -2
    }])
    applyOffer(rollData, {
      ...dice, kind: "limit", key: "k"
    })
    expect(rollData.limit.modifiers.k.value).toBe(-2)
  })
})
