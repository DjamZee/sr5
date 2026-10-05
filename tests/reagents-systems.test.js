import {
  describe, it, expect, afterEach
} from "vitest"
import {
  reagentSystem, spendableStock, tierStock, effectiveDrachms, stockAfterSpending, harvestYield, harvestZones,
  refineOutcome, reagentWorkChanges, reagentWorkUpdate, reagentLimit, drainReduction, tierDrainReduction,
  reagentTestKind, reagentChoices, normalizeTier, bindingCost, applyReagentDrainReduction
} from "../modules/system/reagents.js"

const spell = {
  type: "spell", typeSub: ""
}
const ritual = {
  type: "ritual", typeSub: ""
}
const binding = {
  type: "skillDicePool", typeSub: "binding"
}

describe("reagent system setting", () => {
  afterEach(() => {
    delete globalThis.game
  })

  it("falls back on the core rules without a setting", () => {
    expect(reagentSystem()).toBe("core")
  })

  it("reads the world setting, and refuses an unknown value", () => {
    globalThis.game = {
      settings: {
        get: () => "forbiddenArcana"
      }
    }
    expect(reagentSystem()).toBe("forbiddenArcana")
    globalThis.game.settings.get = () => "nope"
    expect(reagentSystem()).toBe("core")
  })
})

describe("stocks", () => {
  const magic = {
    reagents: 12, reagentsRefined: 3, reagentsRadical: "abc", orichalcum: 1
  }

  it("keeps the old counter as the raw stock", () => {
    expect(tierStock(magic, "raw")).toBe(12)
    expect(tierStock({
      reagents: -4
    }, "raw")).toBe(0)
  })

  it("spends the raw stock alone in the core rules, every tier otherwise", () => {
    expect(spendableStock(magic, "core")).toBe(12)
    expect(spendableStock(magic, "shadowSpells")).toBe(15)
  })

  it("never brings a stock under 0", () => {
    expect(stockAfterSpending(3, 5)).toBe(0)
    expect(stockAfterSpending(10, 4)).toBe(6)
  })

  it("offers only the raw tier in the core rules", () => {
    expect(normalizeTier("radical", "core")).toBe("raw")
    expect(normalizeTier("radical", "forbiddenArcana")).toBe("radical")
    expect(reagentChoices(magic, "core").tiers.map(t => t.key)).toEqual(["raw"])
    expect(reagentChoices(magic, "shadowSpells").tiers.map(t => t.stock)).toEqual([12, 3, 0])
  })
})

describe("another tradition's reagents (SR5 p. 320)", () => {
  it("work at half their Power", () => {
    expect(effectiveDrachms(10, true)).toBe(5)
    expect(effectiveDrachms(5, true)).toBe(2)
    expect(effectiveDrachms(5, false)).toBe(5)
  })
})

describe("harvest (SR5 p. 320, Forbidden Arcana p. 181)", () => {
  it("gives a drachm per 2, 4 or 6 hits", () => {
    expect(harvestYield(5, "tradition")).toBe(2)
    expect(harvestYield(5, "other")).toBe(1)
    expect(harvestYield(5, "overharvested")).toBe(1)
    expect(harvestYield(5, "overharvestedOther")).toBe(0)
  })

  it("offers the overharvested area with Forbidden Arcana only", () => {
    expect(harvestZones("core")).toEqual(["tradition", "other"])
    expect(harvestZones("forbiddenArcana")).toHaveLength(4)
  })

  it("adds the harvest to the raw stock", () => {
    const changes = reagentWorkChanges({
      type: "reagentHarvest", hits: 4, zone: "tradition"
    })
    expect(changes).toEqual({
      raw: 2
    })
    expect(reagentWorkUpdate({
      reagents: 3
    }, changes)).toEqual({
      "system.magic.reagents": 5
    })
  })
})

describe("refining (Street Grimoire p. 211)", () => {
  it("turns 10 drachms into 1 of the next tier on 3 hits", () => {
    expect(refineOutcome(3)).toEqual({
      success: true, consumed: 10, gained: 1
    })
  })

  it("eats one drachm per missing hit on a failure, all ten on a critical glitch", () => {
    expect(refineOutcome(1).consumed).toBe(2)
    expect(refineOutcome(0, true).consumed).toBe(10)
  })

  it("moves the stocks", () => {
    const changes = reagentWorkChanges({
      type: "reagentRefine", hits: 4, from: "refined"
    })
    expect(reagentWorkUpdate({
      reagentsRefined: 12, reagentsRadical: 0
    }, changes)).toEqual({
      "system.magic.reagentsRefined": 2, "system.magic.reagentsRadical": 1
    })
  })
})

describe("limit", () => {
  it("core and Shadow Spells: the drachms spent are the limit", () => {
    for (const system of ["core", "shadowSpells"]) {
      expect(reagentLimit({
        system, test: spell, tier: "refined", effective: 6, spent: 6, baseLimit: 4, magic: 6
      })).toEqual({
        base: 6, bonus: 0, unlimited: false
      })
    }
  })

  it("Forbidden Arcana: +1 for raw, +5 for refined, once per test, on top of the drachms (arbitrage de DjamZ)", () => {
    expect(reagentLimit({
      system: "forbiddenArcana", test: spell, tier: "raw", effective: 6, spent: 6, baseLimit: 4, magic: 6
    })).toEqual({
      base: 6, bonus: 1, unlimited: false
    })
    expect(reagentLimit({
      system: "forbiddenArcana", test: spell, tier: "refined", effective: 2, spent: 2, baseLimit: 4, magic: 6
    }).bonus).toBe(5)
  })

  it("Forbidden Arcana: the bonus never exceeds Magic", () => {
    expect(reagentLimit({
      system: "forbiddenArcana", test: spell, tier: "refined", effective: 2, spent: 2, baseLimit: 4, magic: 3
    }).bonus).toBe(3)
  })

  it("Forbidden Arcana: radical reagents lift the limit", () => {
    expect(reagentLimit({
      system: "forbiddenArcana", test: spell, tier: "radical", effective: 1, spent: 1, baseLimit: 4, magic: 6
    }).unlimited).toBe(true)
  })

  it("a ritual and a binding keep their limit", () => {
    for (const test of [ritual, binding]) expect(reagentLimit({
      system: "core", test, tier: "raw", effective: 50, spent: 50, baseLimit: 5, magic: 6
    }).base).toBe(5)
  })
})

describe("Drain (Forbidden Arcana p. 181)", () => {
  it("each tier takes off its own Drain", () => {
    expect(tierDrainReduction("raw", "ritual")).toBe(1)
    expect(tierDrainReduction("raw", "spell")).toBe(0)
    expect(tierDrainReduction("refined", "spell")).toBe(2)
    expect(tierDrainReduction("refined", "binding")).toBe(1)
    expect(tierDrainReduction("radical", "spell")).toBe(4)
    expect(tierDrainReduction("radical", "summoning")).toBe(2)
  })

  it("only with Forbidden Arcana, within what the limit bonus left of Magic", () => {
    expect(drainReduction({
      system: "shadowSpells", tier: "radical", testKind: "spell", spent: 1, magic: 6
    })).toBe(0)
    expect(drainReduction({
      system: "forbiddenArcana", tier: "refined", testKind: "spell", spent: 1, magic: 6, limitBonusUsed: 5
    })).toBe(1)
  })

  it("tells the test kind apart", () => {
    expect(reagentTestKind(spell)).toBe("spell")
    expect(reagentTestKind(binding)).toBe("binding")
  })

  it("shows the reduction among the Drain modifiers", () => {
    globalThis.game = {
      i18n: {
        localize: k => k
      }
    }
    const magic = {
      drain: {
        value: 6, modifiers: {
        }
      }
    }
    applyReagentDrainReduction(magic, 2, "radical")
    expect(magic.drain.value).toBe(4)
    expect(magic.drain.modifiers.reagentTier.value).toBe(-2)
    delete globalThis.game
  })
})

describe("binding (SR5 p. 304)", () => {
  it("costs Force x 25 drachms", () => {
    expect(bindingCost(4)).toBe(100)
  })
})
