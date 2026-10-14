import {
  describe, it, expect, vi
} from "vitest"

//drug-clock.js imports drug-crash.js, which reaches the roll code: only the two functions it calls are needed
vi.mock("../modules/entities/items/drug-crash.js", () => ({
  endDrugRise: vi.fn(), resetDrugPhase: vi.fn()
}))

const {
  phaseEnd, crashParts, crashPartOver, phaseStartFlags, drugStatusChanges
} = await import("../modules/system/drug-clock.js")
const {
  drugEffectApplies
} = await import("../modules/entities/items/drug-phase.js")
const {
  crashSinceIntake
} = await import("../modules/entities/items/drug-stat.js")
const {
  secondTreatmentOf
} = await import("../modules/entities/items/drug-damage.js")
const {
  attributeTestsState, scopeMatches, PHYSICAL_ACTIONS
} = await import("../modules/rolls/roll-helpers/situational.js")
const {
  replaceLowers
} = await import("../modules/entities/actors/effect-replace.js")

const H = 3600
const drug = (key, extra = {
}) => ({
  systemEffects: [{
    category: "drug", value: key
  }], ...extra
})

describe("the tail of a crash (eX, galak, Chrome Flesh p. 186)", () => {
  //Body 5: disorientation 3 h, -2 social Limit 5 h
  const longTail = {
    phase: "crash", handleShot: {
      durationContrecoup: 3, durationContrecoupType: "hour", socialLimitContrecoup: 5
    }
  }
  //Body 3: disorientation 5 h, -2 social Limit 3 h
  const shortTail = {
    phase: "crash", handleShot: {
      durationContrecoup: 5, durationContrecoupType: "hour", socialLimitContrecoup: 3
    }
  }
  const flags = {
    crashStart: 1000
  }

  it("keeps the drug in its crash until the longer part is over", () => {
    expect(phaseEnd(longTail, flags)).toBe(1000 + 5 * H)
    expect(phaseEnd(shortTail, flags)).toBe(1000 + 5 * H)
  })

  it("tells which part ends first, and only once its time has come", () => {
    expect(crashParts(longTail, flags)).toEqual({
      mainEnd: 1000 + 3 * H, tailEnd: 1000 + 5 * H
    })
    expect(crashPartOver(longTail, flags, 1000 + 2 * H)).toBe(null)
    expect(crashPartOver(longTail, flags, 1000 + 3 * H)).toBe("main")
    expect(crashPartOver(shortTail, flags, 1000 + 3 * H)).toBe("tail")
  })

  it("leaves a drug without tail as it was", () => {
    const plain = {
      phase: "crash", handleShot: {
        durationContrecoup: 2, durationContrecoupType: "hour"
      }
    }
    expect(crashParts(plain, flags)).toBe(null)
    expect(phaseEnd(plain, flags)).toBe(1000 + 2 * H)
  })

  it("drops the effects of the part the GM ended, and only in the crash", () => {
    const tail = {
      phase: "crash", tail: true
    }
    const main = {
      phase: "crash"
    }
    expect(drugEffectApplies(tail, "crash", {
    })).toBe(true)
    expect(drugEffectApplies(main, "crash", {
      crashPartOver: "main"
    })).toBe(false)
    expect(drugEffectApplies(tail, "crash", {
      crashPartOver: "main"
    })).toBe(true)
    expect(drugEffectApplies(tail, "crash", {
      crashPartOver: "tail"
    })).toBe(false)
    expect(drugEffectApplies(main, "crash", {
      crashPartOver: "tail"
    })).toBe(true)
    expect(drugEffectApplies({
      phase: "rise"
    }, "rise", {
      crashPartOver: "main"
    })).toBe(true)
  })

  it("forgets the part over when the drug changes phase", () => {
    expect(phaseStartFlags("rise", "crash", 50, 40)).toMatchObject({
      crashPartOver: null, crashPartNotified: false
    })
    expect(phaseStartFlags("crash", "", 50)).toMatchObject({
      crashPartOver: null, crashPartNotified: false
    })
  })
})

describe("Wudu'aku: 24 hours from the intake (Chrome Flesh p. 193)", () => {
  it("gives the crash what is left once the speed and the effect are over", () => {
    expect(crashSinceIntake({
      sinceIntake: 1440, speed: 7, speedType: "SR5.Minutes", duration: 9, durationType: "hour"
    })).toEqual({
      durationContrecoup: 1440 - 7 - 540, durationContrecoupType: "minute"
    })
  })
  it("never goes below zero", () => {
    expect(crashSinceIntake({
      sinceIntake: 60, speed: 1, speedType: "SR5.Hours", duration: 2, durationType: "hour"
    }).durationContrecoup).toBe(0)
  })
})

describe("P4MO: a second treatment while the first is in effect (Chrome Flesh p. 187)", () => {
  const fluo = (id, phase) => ({
    id, type: "itemDrug", system: drug("oxygenatedFluorocarbons", {
      phase
    })
  })
  it("deals 15P unresisted when another treatment is in its rise", () => {
    const taken = fluo("b", "")
    expect(secondTreatmentOf(taken, {
      items: [fluo("a", "rise"), taken]
    })).toMatchObject({
      value: 15, type: "physical", resist: "none", itemId: "b"
    })
  })
  it("deals nothing after the effect, nor for another drug", () => {
    const taken = fluo("b", "")
    expect(secondTreatmentOf(taken, {
      items: [fluo("a", "crash")]
    })).toBe(null)
    expect(secondTreatmentOf({
      id: "c", system: drug("jazz")
    }, {
      items: [fluo("a", "rise")]
    })).toBe(null)
  })
})

describe("Trance: paralysed during its crash (Chrome Flesh p. 192)", () => {
  const trance = (id, phase) => ({
    id, type: "itemDrug", system: drug("trance", {
      phase
    })
  })
  it("adds one status per Trance in its crash and removes the others", () => {
    const status = (id, drugId) => ({
      id, flags: {
        sr5: {
          drugStatus: drugId
        }
      }
    })
    const a = trance("a", "crash"), b = trance("b", "rise")
    expect(drugStatusChanges([a, b], [])).toEqual({
      create: [a], remove: []
    })
    expect(drugStatusChanges([a, b], [status("s1", "a"), status("s2", "b"), {
      id: "other", flags: {
      }
    }])).toEqual({
      create: [], remove: ["s2"]
    })
  })
})

describe("Dopadrine: -1 die to physical actions (Chrome Flesh p. 186)", () => {
  it("applies once to a test linked to one or more physical attributes", () => {
    expect(scopeMatches(PHYSICAL_ACTIONS, ["agility"])).toBe(true)
    expect(scopeMatches(PHYSICAL_ACTIONS, ["logic", "intuition"])).toBe(false)
    const effect = {
      scope: PHYSICAL_ACTIONS, source: "Dopadrine", value: -1, index: 0
    }
    expect(attributeTestsState([effect], ["body", "strength"]).always).toHaveLength(1)
  })
})

describe("Little Smoke: brought down to 1, never up (Chrome Flesh p. 192)", () => {
  it("replaces only a value above the one given", () => {
    expect(replaceLowers({
      base: 4, modifiers: []
    }, 1)).toBe(true)
    expect(replaceLowers({
      base: 0, modifiers: []
    }, 1)).toBe(false)
    expect(replaceLowers({
      base: 1, modifiers: [{
        value: 2
      }]
    }, 1)).toBe(true)
  })
})
