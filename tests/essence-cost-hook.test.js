import {
  describe, it, expect, afterEach
} from "vitest"
import {
  essenceAfterPurchase, essenceCostFor, ESSENCE_COST_HOOK
} from "../modules/system/implant-essence.js"
import {
  SR5Shop
} from "../modules/interface/shop.js"

// Lot C0-bis of the character creator: the till counts the book's Essence; a module (createur-sr5, Règles Maison 7:
// Essence at half price for a non-Awakened) adjusts it through sr5.essenceCostFor, never the system.

const savedHooks = globalThis.Hooks
afterEach(() => {
  globalThis.Hooks = savedHooks
})

/** Hooks with these subscribers, called as Foundry's callAll would. */
function subscribe(...fns) {
  const seen = []
  globalThis.Hooks = {
    callAll: (hook, ...args) => {
      seen.push(hook)
      for (const fn of fns) fn(...args)
    }
  }
  return seen
}

const reflexes = {
  type: "itemAugmentation", name: "Réflexes câblés (3)", system: {
    type: "cyberware", grade: "standard", essenceCost: {
      value: 5, base: 5
    }
  }, grade: "standard", quantity: 1
}
const buyer = essence => ({
  name: "Essai", items: [], flags: {
  }, system: {
    essence: {
      value: essence
    }
  }
})

describe("sr5.essenceCostFor", () => {
  it("is the book's cost without a subscriber", () => {
    globalThis.Hooks = {
      callAll: () => true
    }
    expect(essenceCostFor(buyer(6), reflexes, 5)).toBe(5)
  })
  it("gives the subscriber the actor, a copy of the line, the cost and the creation", () => {
    const actor = buyer(6)
    let got
    const seen = subscribe(data => {
      got = data
      data.item.system.essenceCost.value = 0
    })
    essenceCostFor(actor, reflexes, 5, {
      creation: true
    })
    expect(seen).toEqual([ESSENCE_COST_HOOK])
    expect(ESSENCE_COST_HOOK).toBe("sr5.essenceCostFor")
    expect(got.actor).toBe(actor)
    expect(got.cost).toBe(5)
    expect(got.creation).toBe(true)
    expect(got.item.name).toBe(reflexes.name)
    // A copy: the line the till goes on with is untouched
    expect(reflexes.system.essenceCost.value).toBe(5)
  })
  it("keeps the book's cost when the value set is not a finite number ≥ 0, or a subscriber throws", () => {
    for (const bad of [-1, NaN, Infinity, "2", null, undefined]) {
      subscribe(data => (data.cost = bad))
      expect(essenceCostFor(buyer(6), reflexes, 5)).toBe(5)
    }
    subscribe(() => {
      throw new Error("module")
    })
    expect(essenceCostFor(buyer(6), reflexes, 5)).toBe(5)
  })
  it("counts the adjusted cost in essenceAfterPurchase", () => {
    expect(essenceAfterPurchase(6, [], [reflexes], {
      costFor: (_line, cost) => cost / 2
    }).essence).toBe(3.5)
    expect(essenceAfterPurchase(6, [], [reflexes]).essence).toBe(1)
  })
})

describe("the till hears the module", () => {
  it("lets a player buy what the house rule makes legal, and only then", async () => {
    const warned = []
    const options = {
      isGM: false, warn: key => warned.push(key)
    }
    const line = {
      ...reflexes, quantity: 2
    }
    subscribe(() => {})
    expect(await SR5Shop.essenceAllows(buyer(6), [line], options)).toBe(false)
    subscribe(data => (data.cost = data.cost / 2))
    expect(await SR5Shop.essenceAllows(buyer(6), [line], options)).toBe(true)
    expect(warned).toEqual(["SR5.WARN_ShopEssenceTooLow"])
  })
})
