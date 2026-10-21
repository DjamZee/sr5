import {
  describe, it, expect, afterEach
} from "vitest"
import {
  ESSENCE_COST_HOOK
} from "../modules/system/implant-essence.js"
import {
  SR5_UtilityItem, sheetLine
} from "../modules/entities/items/utilityItem.js"
import {
  SR5Shop
} from "../modules/interface/shop.js"

// Câblage Maison, lot 4 (Gaspard#5127, 21/10; voie A d'Élise): the sheet asks sr5.essenceCostFor too (context "sheet"),
// the shop says "shop". Without a subscriber the sheet gives exactly what it gave before.

const savedHooks = globalThis.Hooks
afterEach(() => {
  globalThis.Hooks = savedHooks
})

function subscribe(fn) {
  const calls = []
  globalThis.Hooks = {
    callAll: (hook, data) => {
      calls.push({
        hook, data
      })
      fn?.(data)
    }
  }
  return calls
}

const implant = (type, base, grade = "standard", extra = {
}) => ({
  type, grade, isRatingBased: false, itemRating: 0, category: "",
  essenceCost: {
    base, modifiers: [], multiplier: ""
  },
  price: {
    base: 1000, modifiers: [], multiplier: ""
  },
  availability: {
    base: 4, modifiers: [], multiplier: ""
  },
  capacity: {
    base: 0, modifiers: [], multiplier: ""
  },
  capacityTaken: {
    base: 0, modifiers: [], multiplier: ""
  },
  ...extra,
})
const withEffect = (name, value) => ({
  name, type: "itemQuality", system: {
    isActive: true, systemEffects: [{
      category: "specialCase", value
    }]
  }
})
const bioCyber = withEffect("Biocompatibilité (cyberware)", "biocompatibilityCyberware")
const sensitive = withEffect("Système sensible", "doubleEssenceCost")
const adapsine = withEffect("Adapsine", "adapsine")

const doc = {
  name: "Réflexes câblés (1)", uuid: "Actor.a.Item.i", flags: {
    "un-module": {
      marque: true
    }
  }, _stats: {
    compendiumSource: "Compendium.x.y.Item.z"
  }
}
const onSheet = (data, items = [], item = doc) => {
  SR5_UtilityItem._handleAugmentation(data, {
    items
  }, item)
  return data.essenceCost.value
}

// Bodies and implants the sheet prices: grades, rating, Biocompatibilité, Système sensible, Adapsine, tattoo
const CASES = [
  ["cyberware standard", () => implant("cyberware", 2), []],
  ["cyberware alphaware", () => implant("cyberware", 1.5, "alphaware"), []],
  ["cyberware deltaware", () => implant("cyberware", 0.3, "deltaware"), []],
  ["bioware betaware", () => implant("bioware", 0.25, "betaware"), []],
  ["by rating", () => implant("cyberware", 0.1, "standard", {
    isRatingBased: true, itemRating: 3
  }), []],
  ["Biocompatibilité", () => implant("cyberware", 1, "alphaware"), [bioCyber]],
  ["Système sensible", () => implant("cyberware", 0.2), [sensitive]],
  ["under Adapsine", () => implant("cyberware", 1, "alphaware", {
    underAdapsine: true
  }), [adapsine]],
  ["genetech", () => implant("genetech", 0.15), []],
  ["tattoo of grey mana", () => implant("cyberware", 0.1, "alphaware", {
    reversibleEssence: true
  }), []],
]

describe("the sheet without a subscriber (non-regression)", () => {
  it("gives the same cost with no Hooks, with Hooks and no subscriber, and with a subscriber that does nothing", () => {
    for (const [label, make, items] of CASES) {
      globalThis.Hooks = undefined
      const none = onSheet(make(), items)
      subscribe()
      const silent = onSheet(make(), items)
      subscribe(data => (data.cost = Number(data.cost)))
      const idle = onSheet(make(), items)
      expect([label, silent, idle]).toEqual([label, none, none])
    }
  })
  it("still gives the book's values", () => {
    globalThis.Hooks = undefined
    expect(onSheet(implant("cyberware", 2))).toBe(2)
    expect(onSheet(implant("cyberware", 1.5, "alphaware"))).toBe(1.2)
    expect(onSheet(implant("cyberware", 1, "alphaware"), [bioCyber])).toBe(0.7)
    expect(onSheet(implant("cyberware", 0.2), [sensitive])).toBe(0.4)
    expect(onSheet(implant("cyberware", 1, "alphaware", {
      underAdapsine: true
    }), [adapsine])).toBe(0.7)
  })
  it("does not ask without a body, nor for an accessory", () => {
    const calls = subscribe(data => (data.cost = 0))
    const data = implant("cyberware", 2)
    SR5_UtilityItem._handleAugmentation(data)
    expect(data.essenceCost.value).toBe(2)
    expect(onSheet(implant("cyberware", 2, "standard", {
      isAccessory: true
    }))).toBe(2)
    expect(calls).toEqual([])
  })
})

describe("the sheet asks sr5.essenceCostFor", () => {
  it("in the context \"sheet\", with the implant's name, uuid, flags and origin", () => {
    const calls = subscribe()
    const body = {
      items: []
    }
    SR5_UtilityItem._handleAugmentation(implant("cyberware", 2), body, doc)
    expect(calls).toHaveLength(1)
    const {
      hook, data
    } = calls[0]
    expect(hook).toBe(ESSENCE_COST_HOOK)
    expect(data.context).toBe("sheet")
    expect(data.actor).toBe(body)
    expect(data.cost).toBe(2)
    expect(data.item).toMatchObject({
      type: "itemAugmentation", name: doc.name, uuid: doc.uuid, quantity: 1, flags: doc.flags, _stats: doc._stats,
      system: {
        type: "cyberware", grade: "standard", essenceCost: {
          base: 2, value: 2
        }
      }
    })
  })
  it("counts the subscriber's cost, before the final rounding", () => {
    subscribe(data => (data.cost = data.cost / 2))
    expect(onSheet(implant("cyberware", 2))).toBe(1)
    expect(onSheet(implant("cyberware", 0.3))).toBe(0.15)
    // Biocompatibilité rounds down to the tenth after the house rule: 0.8 × 0.9 = 0.72, halved 0.36 → 0.3
    expect(onSheet(implant("cyberware", 1, "alphaware"), [bioCyber])).toBe(0.3)
  })
  it("hands a copy: a subscriber writing the line changes nothing on the implant", () => {
    subscribe(data => {
      data.item.system.essenceCost.base = 99
      data.item.flags["un-module"].marque = false
    })
    const data = implant("cyberware", 2)
    expect(onSheet(data)).toBe(2)
    expect(data.essenceCost.base).toBe(2)
    expect(doc.flags["un-module"].marque).toBe(true)
  })
  it("keeps the book's cost when a subscriber throws or sets nonsense", () => {
    subscribe(() => {
      throw new Error("module")
    })
    expect(onSheet(implant("cyberware", 2))).toBe(2)
    subscribe(data => (data.cost = -1))
    expect(onSheet(implant("cyberware", 2))).toBe(2)
  })
  it("sheetLine copies no data model: plain values only", () => {
    const line = sheetLine(implant("bioware", 0.5, "betaware"), null)
    expect(line).toMatchObject({
      name: "", uuid: null, flags: {
      }, _stats: {
      }
    })
    expect(() => structuredClone(line)).not.toThrow()
  })
})

describe("the till says \"shop\"", () => {
  it("in essenceAllows", async () => {
    const calls = subscribe()
    const line = {
      type: "itemAugmentation", name: "Réflexes câblés (1)", system: {
        type: "cyberware", grade: "standard", essenceCost: {
          value: 2, base: 2
        }
      }, grade: "standard", quantity: 1
    }
    await SR5Shop.essenceAllows({
      name: "Essai", items: [], flags: {
      }, system: {
        essence: {
          value: 6
        }
      }
    }, [line], {
      isGM: false, warn: () => {}
    })
    expect(calls.map(c => c.data.context)).toEqual(["shop"])
  })
})
