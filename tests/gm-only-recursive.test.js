import {
  describe, it, expect
} from "vitest"
import {
  stripGMOnlyChanges
} from "../modules/entities/items/spirit-bonds.js"
import {
  GM_ONLY_PREPARATION_PATHS
} from "../modules/system/preparation-potency.js"
import {
  reservedChangedBy
} from "../modules/system/reserved-fields.js"
import {
  GM_ONLY_FIELDS
} from "../modules/system/implant-essence.js"
import {
  expectedAtMaking, preparationMismatches, preparationValues
} from "../modules/system/preparation-register.js"

// Victoire's review: an update sent with recursive: false replaces the object under a top-level key, so what it
// leaves out is deleted; and the start and pace of a preparation are checked again by the active GM.

const prep = {
  system: {
    potency: 4, initialPotency: 4, createdAt: 0, fullPotencyMultiplier: 2, decayRate: "hour"
  }
}

describe("recursive: false", () => {
  it("a preparation's system replaced without its start is refused", () => {
    expect(stripGMOnlyChanges({
      system: {
        potency: 4, decayRate: "hour"
      }
    }, prep, GM_ONLY_PREPARATION_PATHS, {
      recursive: false
    })).toEqual(["system.createdAt", "system.initialPotency", "system.fullPotencyMultiplier"])
  })
  it("the same update, merged, changes nothing reserved", () => {
    expect(stripGMOnlyChanges({
      system: {
        potency: 3, decayRate: "hour"
      }
    }, prep, GM_ONLY_PREPARATION_PATHS)).toEqual([])
  })
  it("a whole system sent back unchanged passes, even without the recursive merge", () => {
    expect(stripGMOnlyChanges({
      system: {
        ...prep.system, potency: 3
      }
    }, prep, GM_ONLY_PREPARATION_PATHS, {
      recursive: false
    })).toEqual([])
  })
  it("an update that does not send system leaves it alone", () => {
    expect(stripGMOnlyChanges({
      name: "Autre nom"
    }, prep, GM_ONLY_PREPARATION_PATHS, {
      recursive: false
    })).toEqual([])
  })
  it("the Essence lost and the implant boxes too", () => {
    const actor = {
      system: {
        essence: {
          base: 6, holeAmount: 1.8, holeBase: 0.2
        }, magic: {
        }
      }
    }
    expect(reservedChangedBy(actor, {
      system: {
        essence: {
          base: 6
        }
      }
    }, GM_ONLY_FIELDS.actor, {
      recursive: false
    })).toEqual(["essence.holeAmount", "essence.holeBase"])
    const implant = {
      system: {
        underAdapsine: true, augmentationBundle: false, transhumanGift: false, itemRating: 1
      }
    }
    expect(reservedChangedBy(implant, {
      system: {
        itemRating: 2
      }
    }, GM_ONLY_FIELDS.itemAugmentation, {
      recursive: false
    })).toEqual(["underAdapsine"])
    expect(reservedChangedBy(implant, {
      system: {
        itemRating: 2
      }
    }, GM_ONLY_FIELDS.itemAugmentation)).toEqual([])
  })
})

describe("a number sent as text", () => {
  it("is the number the data model stores", () => {
    expect(stripGMOnlyChanges({
      "system.fullPotencyMultiplier": "2"
    }, prep, GM_ONLY_PREPARATION_PATHS)).toEqual([])
    expect(stripGMOnlyChanges({
      "system.fullPotencyMultiplier": "4"
    }, prep, GM_ONLY_PREPARATION_PATHS)).toEqual(["system.fullPotencyMultiplier"])
  })
})

describe("the active GM's register of preparations", () => {
  it("reads a player's preparation against his clock and the book's defaults", () => {
    expect(expectedAtMaking({
      potency: 5, fullPotencyMultiplier: 4, decayRate: "day", createdAt: 9e9
    }, 1000)).toEqual({
      createdAt: 1000, initialPotency: 5, fullPotencyMultiplier: 2, decayRate: "hour"
    })
  })
  it("puts back what differs from the register", () => {
    const registered = preparationValues(prep.system)
    expect(preparationMismatches({
      ...registered, decayRate: "day", fullPotencyMultiplier: 4
    }, registered)).toEqual({
      decayRate: "hour", fullPotencyMultiplier: 2
    })
    expect(preparationMismatches({
      createdAt: null, initialPotency: 0, fullPotencyMultiplier: 2, decayRate: "hour"
    }, registered)).toEqual({
      createdAt: 0, initialPotency: 4
    })
    expect(preparationMismatches(registered, registered)).toEqual({
    })
  })
})
