import {
  describe, it, expect, vi, beforeEach
} from "vitest"
import {
  SR5ShopAvailability
} from "../modules/interface/shop-availability.js"
import {
  cardResult, openCashing, closeCashing
} from "../modules/interface/shop-orders.js"

// SR5 p. 420: "En cas d'échec, il est possible de réessayer après avoir attendu le double du délai de
// recherche indiqué dans la table." The wait, the outcome and the test are the gamemaster's, never the card's.
const retry = () => import("../modules/interface/shop-retry.js")
const HOUR = 3600

let settings, testLines
const gm = {
  id: "gm", isGM: true
}
const player = {
  id: "pl", isGM: false
}
const stranger = {
  id: "st", isGM: false
}
const buyer = {
  id: "buyer", name: "Wrecker",
  testUserPermission: (u) => u.id === "pl" || u.isGM,
  items: {
    get: () => null
  },
}
// Dice of a failure (1 hit against 3) and of a critical glitch (no hit, four ones out of six)
const FAIL = {
  faces: [5, 2, 3, 4], oppositionFaces: [5, 6, 5, 1]
}
const CRIT = {
  faces: [1, 1, 1, 1, 2, 3], oppositionFaces: [5]
}
// A card the GM rolled for the player (every test is his), for a 500 ¥ item (table: 1 day, so 2 days to wait)
const card = (results, author = gm, extra = {
}) => ({
  id: "msg1", author, content: '<footer class="sr-shop-card-footer">x</footer>', update: vi.fn(async () => {}),
  flags: {
    sr5shop: {
      buyerId: "buyer", surcharge: 0, limit: 0, results, ...extra
    }
  }
})
const failed = [{
  uuid: "Item.gun", outcome: "failure", quantity: 1, name: "Gun", ...FAIL
}]

beforeEach(() => {
  settings = {
  }
  vi.restoreAllMocks()
  testLines = vi.spyOn(SR5ShopAvailability, "testLines").mockResolvedValue({
  })
  globalThis.game = {
    user: gm,
    users: {
      activeGM: gm, get: id => ({
        gm, pl: player, st: stranger
      })[id]
    },
    settings: {
      get: (s, k) => settings[k], set: async (s, k, v) => {
        settings[k] = v
      }
    },
    time: {
      worldTime: 0
    },
    actors: {
      get: id => id === "buyer" ? buyer : null
    },
    messages: {
      get: () => game._card
    },
    i18n: {
      format: k => k, localize: k => k
    },
  }
  globalThis.fromUuid = async () => ({
    name: "Gun", type: "itemWeapon", system: {
      price: {
        value: 500
      }, availability: {
        value: 4
      }
    }
  })
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.foundry.documents ??= {
  }
  globalThis.foundry.documents.ChatMessage = {
    create: async () => ({
    })
  }
  globalThis.foundry.utils.escapeHTML ??= s => s
})

describe("a new availability test after a failure (SR5 p. 420)", () => {
  it("waits twice the time of the table", async () => {
    const {
      retryWaitHours, retryRefusal
    } = await retry()
    expect(retryWaitHours(24)).toBe(48)
    const entry = {
      time: 1000, used: [], failed: [{
        uuid: "u"
      }]
    }
    expect(retryRefusal({
      entry, now: 1000 + 47 * HOUR, waitHours: 48, uuid: "u"
    })).toBe("early")
    expect(retryRefusal({
      entry, now: 1000 + 48 * HOUR, waitHours: 48, uuid: "u"
    })).toBe(null)
    expect(retryRefusal({
      entry: {
        ...entry, used: ["u"]
      }, now: 1e9, waitHours: 48, uuid: "u"
    })).toBe("used")
    expect(retryRefusal({
      entry: undefined, now: 1e9, waitHours: 48, uuid: "u"
    })).toBe("unknown")
  })

  it("the outcome is counted on the dice, never read on the label", async () => {
    const {
      outcomeFromDice
    } = await retry()
    expect(outcomeFromDice(FAIL)).toBe("failure")
    expect(outcomeFromDice(CRIT)).toBe("criticalGlitch")
    expect(outcomeFromDice({
      faces: [5, 6], oppositionFaces: [5]
    })).toBe("success")
    // the limit caps the hits: two hits capped at 1 against one is a tie
    expect(outcomeFromDice({
      faces: [5, 6], oppositionFaces: [5]
    }, 1)).toBe("tie")
    expect(outcomeFromDice({
      outcome: "failure"
    })).toBe(null)
  })

  it("the GM writes what a card is worth when it appears; a player cannot", async () => {
    const {
      recordShopCard, RETRY_LEDGER
    } = await retry()
    game.time.worldTime = 500
    await recordShopCard(card(failed, gm, {
      surcharge: 50
    }))
    expect(settings[RETRY_LEDGER].msg1).toMatchObject({
      time: 500, surcharge: 50, failed: [{
        uuid: "Item.gun", quantity: 1
      }], cashed: false
    })
    settings = {
    }
    game.user = player
    await recordShopCard(card(failed))
    expect(settings[RETRY_LEDGER]).toBeUndefined()
  })

  it("too early: refused, nothing rolled; on time: the GM rolls with the buyer, once", async () => {
    const {
      recordShopCard, rollRetry
    } = await retry()
    game._card = card(failed)
    await recordShopCard(game._card)
    game.time.worldTime = 47 * HOUR
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 50
    }, "pl")).toBe(false)
    expect(testLines).not.toHaveBeenCalled()
    game.time.worldTime = 48 * HOUR
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 50
    }, "pl")).toBe(true)
    expect(testLines).toHaveBeenCalledWith(buyer, null, [expect.objectContaining({
      uuid: "Item.gun", quantity: 1
    })], 50, {
    })
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 0
    }, "pl")).toBe(false)
    expect(testLines).toHaveBeenCalledTimes(1)
  })

  it("a critical glitch relabelled as a failure after the card appeared gets no new test", async () => {
    const {
      recordShopCard, rollRetry
    } = await retry()
    game._card = card([{
      uuid: "Item.gun", outcome: "criticalGlitch", quantity: 1, ...CRIT
    }])
    await recordShopCard(game._card)
    // the player edits her own card
    game._card.flags.sr5shop.results[0].outcome = "failure"
    game.time.worldTime = 1e9
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 0
    }, "pl")).toBe(false)
    expect(testLines).not.toHaveBeenCalled()
  })

  it("a card the GM never saw appear, or a user who does not own the buyer, rolls nothing", async () => {
    const {
      rollRetry, RETRY_LEDGER
    } = await retry()
    game._card = card(failed)
    game.time.worldTime = 1e9
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 0
    }, "pl")).toBe(false)
    settings[RETRY_LEDGER] = {
      msg1: {
        time: 0, used: [], failed: [{
          uuid: "Item.gun", quantity: 1
        }]
      }
    }
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 0
    }, "st")).toBe(false)
    expect(testLines).not.toHaveBeenCalled()
  })

  it("at a vendor's: a closed shop, or an item over its ceiling, is refused", async () => {
    const {
      vendorRefusal
    } = await retry()
    expect(vendorRefusal({
      isOpen: false, maxAvailability: 0
    }, 4)).toBe("vendorClosed")
    expect(vendorRefusal({
      isOpen: false, maxAvailability: 0
    }, 4, true)).toBe(null)
    expect(vendorRefusal({
      isOpen: true, maxAvailability: 16
    }, 20)).toBe("vendorCeiling")
    expect(vendorRefusal({
      isOpen: true, maxAvailability: 16
    }, 16)).toBe(null)
    expect(vendorRefusal(null, 4)).toBe("vendorGone")
  })

  it("the card the GM rolled for the player's buyer is read by the till, while he cashes it", () => {
    game._card = card([{
      uuid: "Item.gun", outcome: "success", obtained: true, netHits: 2
    }], gm)
    const cashToken = openCashing("msg1")
    expect(cardResult("msg1", "Item.gun", "pl", {
      cashToken
    })?.netHits).toBe(2)
    expect(cardResult("msg1", "Item.gun", "st", {
      cashToken
    })).toBe(null)
    closeCashing("msg1")
  })
})

describe("a card the GM rolled is cashed once, by the GM", () => {
  it("two requests at the same time: one checkout, the card marked cashed before it", async () => {
    const {
      cashCard, RETRY_LEDGER
    } = await retry()
    const {
      SR5Shop
    } = await import("../modules/interface/shop.js")
    const seen = []
    const checkout = vi.spyOn(SR5Shop, "checkout").mockImplementation(async () => {
      seen.push(settings[RETRY_LEDGER]?.msg1?.cashed)
      return true
    })
    game._card = card([{
      uuid: "Item.gun", outcome: "success", obtained: true, quantity: 1, netHits: 1
    }], gm)
    const [a, b] = await Promise.all([cashCard({
      messageId: "msg1"
    }, "pl"), cashCard({
      messageId: "msg1"
    }, "pl")])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(await cashCard({
      messageId: "msg1"
    }, "pl")).toBe(false)
    expect(checkout).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([true])
    expect(checkout).toHaveBeenCalledWith(buyer, [expect.objectContaining({
      uuid: "Item.gun"
    })], expect.objectContaining({
      messageId: "msg1", userId: "pl"
    }))
  })

  it("a card a player wrote, or a buyer the requester does not own, is not cashed by the GM", async () => {
    const {
      cashCard
    } = await retry()
    const {
      SR5Shop
    } = await import("../modules/interface/shop.js")
    const checkout = vi.spyOn(SR5Shop, "checkout").mockResolvedValue(true)
    game._card = card([{
      uuid: "Item.gun", obtained: true
    }], player)
    expect(await cashCard({
      messageId: "msg1"
    }, "pl")).toBe(false)
    game._card = card([{
      uuid: "Item.gun", obtained: true
    }], gm)
    expect(await cashCard({
      messageId: "msg1"
    }, "st")).toBe(false)
    expect(checkout).not.toHaveBeenCalled()
  })

  it("nothing sold: the card may be cashed again", async () => {
    const {
      cashCard, RETRY_LEDGER
    } = await retry()
    const {
      SR5Shop
    } = await import("../modules/interface/shop.js")
    vi.spyOn(SR5Shop, "checkout").mockResolvedValue(false)
    game._card = card([{
      uuid: "Item.gun", obtained: true
    }], gm)
    expect(await cashCard({
      messageId: "msg1"
    }, "pl")).toBe(false)
    expect(settings[RETRY_LEDGER].msg1.cashed).toBe(false)
  })
})

describe("the till charges the surcharge that bought the dice (SR5 p. 420)", () => {
  it("the surcharge frozen by the GM, not the one a card edited afterwards says", async () => {
    const {
      cardSurcharge, surchargedUnit
    } = await import("../modules/interface/shop-orders.js")
    game._card = card([{
      uuid: "Item.gun", obtained: true
    }], gm, {
      surcharge: 0
    })
    settings.sr5ShopRetryLedger = {
      msg1: {
        surcharge: 300
      }
    }
    // Read while the GM cashes the card (R2): the token his cashCard holds
    const context = {
      cashToken: openCashing("msg1")
    }
    expect(cardSurcharge("msg1", "Item.gun", "pl", context)).toBe(300)
    expect(surchargedUnit(2700, 300)).toBe(10800)
    // no card for the line, or someone else's card: no surcharge
    expect(cardSurcharge("msg1", "Item.other", "pl", context)).toBe(0)
    expect(cardSurcharge("msg1", "Item.gun", "st", context)).toBe(0)
    closeCashing("msg1")
  })
})
