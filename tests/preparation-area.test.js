import {
  describe, it, expect, beforeAll, vi
} from "vitest"

// SR5 p. 307: an alchemical spell has the same effects and keywords as the spell, area (Z) included. The
// preparation's roll must carry its range, or its card never measures an area, its template has no radius
// and its defense is never checked against the template.
vi.mock("../modules/rolls/roll-prepare-helpers.js", () => ({
  SR5_PrepareRollHelper: {
    getBaseDicepool: () => 0, getDicepoolModifiers: () => [], addBackgroundCountLimitModifiers: r => r, addTransferableEffect: r => r
  }
}))
vi.mock("../modules/rolls/roll-helpers/miscellaneous.js", () => ({
  SR5_MiscellaneousHelpers: {
    addActions: a => a
  }
}))

let preparation
beforeAll(async () => {
  globalThis.game = {
    i18n: {
      localize: k => k
    }
  }
  preparation = (await import("../modules/rolls/roll-prepare-case/rollData-Preparation.js")).default
})

const rollData = () => ({
  test: {
  }, dicePool: {
  }, limit: {
  }, damage: {
  }, combat: {
    actions: []
  }, chatCard: {
  }, owner: {
  }, magic: {
    spell: {
    }
  }
})
const item = range => ({
  name: "Boule de feu", uuid: "Actor.a.Item.p", system: {
    range, force: 5, resisted: true, test: {
      modifiers: []
    }, category: "combat", subCategory: "indirect", type: "physical"
  }
})
const actor = {
  system: {
    magic: {
      bgCount: {
        value: 0
      }
    }
  }
}

describe("Préparation de zone", () => {
  it("porte sa portée de zone jusqu'à la carte", () => {
    const r = preparation(rollData(), actor, item("area"))
    expect(r.magic.spell.range).toBe("area")
    expect(r.chatCard.templatePlace).toBe(true)
  })
  it("garde une portée en ligne de vue", () => {
    expect(preparation(rollData(), actor, item("lineOfSight")).magic.spell.range).toBe("lineOfSight")
  })
})
