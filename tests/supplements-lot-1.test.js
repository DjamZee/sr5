import {
  describe, it, expect
} from "vitest"
import {
  addictionPools, worsenAddiction, burnoutAttribute, addictionLevelIndex
} from "../modules/rolls/roll-helpers/addiction.js"
import {
  targetMetatypeMet, tickByTargetMetatype, extractSituational, METATYPE_FAMILIES
} from "../modules/rolls/roll-helpers/situational.js"
import {
  isMilkBrick, milkBrickRemoves
} from "../modules/entities/items/milkBrick.js"
import {
  SR5
} from "../modules/config.js"

describe("Addiction test (SR5 p. 415-416)", () => {
  it("tests a both addiction with both pools, the others with their own", () => {
    expect(addictionPools("physiological")).toEqual(["physiological"])
    expect(addictionPools("psychological")).toEqual(["psychological"])
    expect(addictionPools("both")).toEqual(["physiological", "psychological"])
    expect(addictionPools("")).toEqual([])
  })

  it("goes up one level per failure, from none to burnout", () => {
    expect(worsenAddiction("")).toEqual({
      level: "mild", attributeLoss: false
    })
    expect(worsenAddiction(undefined).level).toBe("mild")
    expect(worsenAddiction("mild").level).toBe("moderate")
    expect(worsenAddiction("moderate").level).toBe("severe")
    expect(worsenAddiction("severe")).toEqual({
      level: "burnout", attributeLoss: false
    })
  })

  it("at burnout, stays there and costs an attribute point instead", () => {
    expect(worsenAddiction("burnout")).toEqual({
      level: "burnout", attributeLoss: true
    })
  })

  it("an unknown level counts as none", () => {
    expect(addictionLevelIndex("nonsense")).toBe(0)
  })

  it("takes the point from the higher attribute, the tie by the kind of addiction", () => {
    expect(burnoutAttribute(5, 3, "psychological")).toBe("body")
    expect(burnoutAttribute(3, 5, "physiological")).toBe("willpower")
    expect(burnoutAttribute(4, 4, "physiological")).toBe("body")
    expect(burnoutAttribute(4, 4, "psychological")).toBe("willpower")
    expect(burnoutAttribute(4, 4, "both")).toBe("either")
  })

  it("every level has a label", () => {
    for (let level of ["", "mild", "moderate", "severe", "burnout"]) expect(SR5.addictionLevels[level]).toBeTruthy()
  })
})

describe("Target's metatype condition (The Complete Trog p. 179)", () => {
  const scary = {
    targetMetatype: "trog", targetMetatypeMode: "isNot"
  }

  it("Scary Trog: met against a human, an elf, a dwarf, not against an ork or a troll", () => {
    for (let m of ["human", "elf", "dwarf"]) expect(targetMetatypeMet(scary, m, METATYPE_FAMILIES)).toBe(true)
    for (let m of ["ork", "troll"]) expect(targetMetatypeMet(scary, m, METATYPE_FAMILIES)).toBe(false)
  })

  it("is a single metatype when the key is not a family", () => {
    expect(targetMetatypeMet({
      targetMetatype: "elf", targetMetatypeMode: "is"
    }, "elf", {
    })).toBe(true)
  })

  it("says nothing without a condition, or without a metatype to read", () => {
    expect(targetMetatypeMet({
    }, "human", METATYPE_FAMILIES)).toBeNull()
    expect(targetMetatypeMet(scary, "", METATYPE_FAMILIES)).toBeNull()
  })

  it("ticks the matching box, on the dice pool, and leaves the others", () => {
    const effects = [{
      source: "Trog effrayant", value: 3, situational: true, targetMetatype: "trog", targetMetatypeMode: "isNot"
    }, {
      source: "Autre", value: 1, situational: true
    }]
    const rollData = {
      dicePool: {
        composition: [], modifiers: [{
          type: "situational:0", source: "Trog effrayant", value: 0
        }, {
          type: "situational:1", source: "Autre", value: 0
        }]
      },
      limit: {
        modifiers: {
        }
      },
    }
    rollData.situational = extractSituational(rollData, effects, []).offers
    expect(rollData.situational.find(o => o.label === "Trog effrayant").targetMetatype).toBe("trog")
    tickByTargetMetatype(rollData, "human", METATYPE_FAMILIES)
    expect(rollData.situational.find(o => o.label === "Trog effrayant").checked).toBe(true)
    expect(rollData.situational.find(o => o.label === "Autre").checked).toBeUndefined()
    expect(rollData.dicePool.modifiers).toEqual([{
      type: "situational_dicePool_0", label: "Trog effrayant", value: 3
    }])
  })

  it("ticks nothing against a troll", () => {
    const rollData = {
      dicePool: {
        modifiers: []
      }, limit: {
        modifiers: {
        }
      },
      situational: [{
        key: "situational_dicePool_0", kind: "dicePool", label: "Trog effrayant", value: 3, targetMetatype: "trog", targetMetatypeMode: "isNot"
      }],
    }
    tickByTargetMetatype(rollData, "troll", METATYPE_FAMILIES)
    expect(rollData.dicePool.modifiers).toEqual([])
    expect(rollData.situational[0].checked).toBeUndefined()
  })
})

describe("Brick of milk (No Future p. 154)", () => {
  it("removes the Nausea of CS / tear gas and Pepper Punch", () => {
    expect(milkBrickRemoves("toxinEffectNausea", "csTearGas")).toBe(true)
    expect(milkBrickRemoves("toxinEffectNausea", "pepperPunch")).toBe(true)
    expect(milkBrickRemoves("toxinEffectNausea", "nauseaGas")).toBe(false)
  })

  it("removes the Disorientation of CS / tear gas only", () => {
    expect(milkBrickRemoves("toxinEffectDisorientation", "csTearGas")).toBe(true)
    expect(milkBrickRemoves("toxinEffectDisorientation", "pepperPunch")).toBe(false)
  })

  it("removes an effect of unknown origin, and never another effect", () => {
    expect(milkBrickRemoves("toxinEffectNausea", "")).toBe(true)
    expect(milkBrickRemoves("toxinEffectDisorientation", "custom")).toBe(true)
    expect(milkBrickRemoves("toxinEffectParalysis", "csTearGas")).toBe(false)
  })

  it("is known by its system effect", () => {
    expect(isMilkBrick({
      system: {
        systemEffects: [{
          category: "specificItem", value: "milkBrick"
        }]
      }
    })).toBe(true)
    expect(isMilkBrick({
      system: {
        systemEffects: [{
          category: "specificItem", value: "medkit"
        }]
      }
    })).toBe(false)
  })
})
