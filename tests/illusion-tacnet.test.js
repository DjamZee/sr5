import {
  describe, it, expect
} from "vitest"
import {
  illusionResistanceAttributes, isFooledBy, ledgerAfterCast, ledgerAfterResistance, ledgerWithout,
  unpiercedIllusions, blindFireOffer, BLIND_FIRE
} from "../modules/rolls/roll-helpers/illusion.js"
import {
  tacnetCapacity, tacnetMembers, ledgerAfterJoin, ledgerAfterLeave, tacnetBonus, isTacticsKnowledge, tacnetOffer
} from "../modules/rolls/roll-helpers/tacnet.js"
import {
  rollKinds
} from "../modules/rolls/roll-helpers/indirect.js"

const ranged = rollKinds({
  type: "attack", typeSub: "rangedWeapon"
})
const melee = rollKinds({
  type: "attack", typeSub: "meleeWeapon"
})
const spell = rollKinds({
  type: "spell"
})
const guard = {
  uuid: "Actor.guard", type: "actorGrunt"
}
const drone = {
  uuid: "Actor.drone", type: "actorDrone"
}

function cast(kind = "invisibility", spellType = "mana", threshold = 3){
  return ledgerAfterCast({
  }, {
    spellUuid: "Spell.inv", kind, spellType, threshold, subjectUuid: "Actor.sam", subjectName: "Sam", messageId: "m1"
  })
}

describe("illusions: the resistance (SR5 p. 292)", () => {
  it("is Logic + Willpower against a mana illusion, Intuition + Logic against a physical one", () => {
    expect(illusionResistanceAttributes("mana")).toEqual(["logic", "willpower"])
    expect(illusionResistanceAttributes("physical")).toEqual(["intuition", "logic"])
  })
  it("a mana illusion never fools a drone or a device, a physical one does", () => {
    expect(isFooledBy("mana", "actorDrone")).toBe(false)
    expect(isFooledBy("mana", "actorDevice")).toBe(false)
    expect(isFooledBy("mana", "actorPc")).toBe(true)
    expect(isFooledBy("physical", "actorDrone")).toBe(true)
  })
})

describe("illusions: the GM's ledger (SR5 p. 294)", () => {
  it("keeps the caster's hits as the threshold, and nobody has seen through yet", () => {
    expect(cast()["Spell.inv"]).toMatchObject({
      threshold: 3, subjectUuid: "Actor.sam", pierced: []
    })
  })
  it("records nothing for a missed casting or an unknown kind", () => {
    expect(cast("invisibility", "mana", 0)).toEqual({
    })
    expect(cast("silence")).toEqual({
    })
  })
  it("a resistance reaching the threshold sees through; one below does not", () => {
    let {
      ledger, pierced
    } = ledgerAfterResistance(cast(), "Spell.inv", guard.uuid, 2)
    expect(pierced).toBe(false)
    expect(ledger["Spell.inv"].pierced).toEqual([])
    ;({
      ledger, pierced
    } = ledgerAfterResistance(ledger, "Spell.inv", guard.uuid, 3))
    expect(pierced).toBe(true)
    expect(ledger["Spell.inv"].pierced).toEqual([guard.uuid])
  })
  it("a new casting starts again: those who had seen through must resist anew (Q3 of 06/10)", () => {
    const {
      ledger
    } = ledgerAfterResistance(cast(), "Spell.inv", guard.uuid, 5)
    const again = ledgerAfterCast(ledger, {
      spellUuid: "Spell.inv", kind: "invisibility", spellType: "mana", threshold: 4, subjectUuid: "Actor.sam"
    })
    expect(again["Spell.inv"]).toMatchObject({
      threshold: 4, pierced: []
    })
  })
  it("a resistance against a spell the GM never recorded changes nothing", () => {
    const result = ledgerAfterResistance({
    }, "Spell.x", guard.uuid, 6)
    expect(result.known).toBe(false)
    expect(result.ledger).toEqual({
    })
  })
  it("forgets the spells no longer sustained", () => {
    expect(ledgerWithout(cast(), () => false)).toEqual({
    })
    expect(Object.keys(ledgerWithout(cast(), () => true))).toEqual(["Spell.inv"])
  })
})

describe("illusions: blind fire at the attack (SR5 p. 180, 294)", () => {
  it("an attack against an invisible subject not seen through gets -6, ticked beforehand", () => {
    const offer = blindFireOffer(unpiercedIllusions(cast(), "Actor.sam", guard), ranged, "Sam", "Tir au jugé, Invisibilité")
    expect(offer).toMatchObject({
      value: BLIND_FIRE, checked: true, blindFire: true, label: "Tir au jugé, Invisibilité (Sam)"
    })
    expect(BLIND_FIRE).toBe(-6)
  })
  it("in melee too (Q5 of 06/10); not on a spell", () => {
    const illusions = unpiercedIllusions(cast(), "Actor.sam", guard)
    expect(blindFireOffer(illusions, melee, "Sam", "x")).not.toBeNull()
    expect(blindFireOffer(illusions, spell, "Sam", "x")).toBeNull()
  })
  it("nothing once the observer has seen through, nor while the spell is dropped", () => {
    const {
      ledger
    } = ledgerAfterResistance(cast(), "Spell.inv", guard.uuid, 3)
    expect(unpiercedIllusions(ledger, "Actor.sam", guard)).toEqual([])
    expect(unpiercedIllusions(cast(), "Actor.sam", guard, () => false)).toEqual([])
  })
  it("a drone is not blinded by a mana Invisibility, but is by a physical one", () => {
    expect(unpiercedIllusions(cast("invisibility", "mana"), "Actor.sam", drone)).toEqual([])
    expect(unpiercedIllusions(cast("invisibility", "physical"), "Actor.sam", drone)).toHaveLength(1)
  })
  it("a Mask changes no dice, and two Invisibilities count -6 once", () => {
    expect(blindFireOffer(unpiercedIllusions(cast("mask"), "Actor.sam", guard), ranged, "Sam", "x")).toBeNull()
    const two = [{
      kind: "invisibility"
    }, {
      kind: "invisibility"
    }]
    expect(blindFireOffer(two, ranged, "Sam", "x").value).toBe(-6)
  })
  it("the attack on someone else is not touched", () => {
    expect(unpiercedIllusions(cast(), "Actor.other", guard)).toEqual([])
  })
})

describe("RP-Tac: the roster (Run & Gun p. 119)", () => {
  it("holds Device Rating x 1.5 members, rounded down", () => {
    expect(tacnetCapacity(4)).toBe(6)
    expect(tacnetCapacity(5)).toBe(7)
    expect(tacnetCapacity(6)).toBe(9)
  })
  it("counts the bearer as a member", () => {
    expect(tacnetMembers({
      "Item.t": ["Actor.b"]
    }, "Item.t", "Actor.a")).toEqual(["Actor.a", "Actor.b"])
  })
  it("refuses a member once full, and a member already in", () => {
    let roster = {
    }
    for (let i = 1; i <= 5; i++) roster = ledgerAfterJoin(roster, "Item.t", `Actor.${i}`, {
      deviceRating: 4, bearerUuid: "Actor.a"
    }).ledger
    expect(tacnetMembers(roster, "Item.t", "Actor.a")).toHaveLength(6)
    expect(ledgerAfterJoin(roster, "Item.t", "Actor.7", {
      deviceRating: 4, bearerUuid: "Actor.a"
    }).error).toBe("full")
    expect(ledgerAfterJoin(roster, "Item.t", "Actor.1", {
      deviceRating: 4, bearerUuid: "Actor.a"
    }).error).toBe("already")
    expect(ledgerAfterJoin(roster, "Item.t", "Actor.a", {
      deviceRating: 4, bearerUuid: "Actor.a"
    }).error).toBe("already")
  })
  it("lets a member leave", () => {
    expect(ledgerAfterLeave({
      "Item.t": ["Actor.b", "Actor.c"]
    }, "Item.t", "Actor.b")).toEqual({
      "Item.t": ["Actor.c"]
    })
  })
})

describe("RP-Tac: the bonuses (Run & Gun p. 119, Street Lethal p. 176)", () => {
  const net = (level, active = true) => ({
    name: "Taka", level, active, members: ["Actor.a", "Actor.b"]
  })
  it("Perception +1 / +2 / +3 by level", () => {
    for (const level of [1, 2, 3]) expect(tacnetBonus([net(level)], "Actor.b", {
      skill: "perception"
    }).value).toBe(level)
  })
  it("Sneaking from level II, Tracking at level III only", () => {
    expect(tacnetBonus([net(1)], "Actor.b", {
      skill: "sneaking"
    })).toBeNull()
    expect(tacnetBonus([net(2)], "Actor.b", {
      skill: "sneaking"
    }).value).toBe(1)
    expect(tacnetBonus([net(3)], "Actor.b", {
      skill: "sneaking"
    }).value).toBe(2)
    expect(tacnetBonus([net(2)], "Actor.b", {
      skill: "tracking"
    })).toBeNull()
    expect(tacnetBonus([net(3)], "Actor.b", {
      skill: "tracking"
    }).value).toBe(2)
  })
  it("the combat mode: only the skill the member picked, from level II", () => {
    expect(tacnetBonus([net(2)], "Actor.b", {
      skill: "pistols", combatChoice: "pistols"
    }).value).toBe(1)
    expect(tacnetBonus([net(3)], "Actor.b", {
      skill: "pistols", combatChoice: "pistols"
    }).value).toBe(2)
    expect(tacnetBonus([net(3)], "Actor.b", {
      skill: "pistols", combatChoice: "longarms"
    })).toBeNull()
    expect(tacnetBonus([net(1)], "Actor.b", {
      skill: "pistols", combatChoice: "pistols"
    })).toBeNull()
  })
  it("the Perception bonus also goes to the unit tactics knowledge skills (Street Lethal p. 176)", () => {
    expect(isTacticsKnowledge("Tactiques d'escouade")).toBe(true)
    expect(isTacticsKnowledge("Tactiques d’unités mixtes")).toBe(true)
    expect(isTacticsKnowledge("Small Unit Tactics")).toBe(true)
    expect(isTacticsKnowledge("Histoire des corporations")).toBe(false)
    expect(tacnetBonus([net(2)], "Actor.b", {
      knowledgeName: "Tactiques d'escouade"
    }).value).toBe(2)
  })
  it("nothing for a non-member, nor from a unit switched off; the best of two networks, not their sum", () => {
    expect(tacnetBonus([net(3)], "Actor.z", {
      skill: "perception"
    })).toBeNull()
    expect(tacnetBonus([net(3, false)], "Actor.b", {
      skill: "perception"
    })).toBeNull()
    expect(tacnetBonus([net(1), net(3)], "Actor.b", {
      skill: "perception"
    }).value).toBe(3)
  })
  it("becomes a box ticked beforehand", () => {
    expect(tacnetOffer({
      value: 2
    }, "RP-Tac")).toMatchObject({
      value: 2, checked: true, kind: "dicePool", indirect: true
    })
  })
})
