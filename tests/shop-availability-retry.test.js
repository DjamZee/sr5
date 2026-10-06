import {
  describe, it, expect, vi, beforeEach
} from "vitest"
import {
  SR5ShopAvailability
} from "../modules/interface/shop-availability.js"
import {
  cardResult
} from "../modules/interface/shop-orders.js"

// SR5 p. 420: "En cas d'échec, il est possible de réessayer après avoir attendu le double du délai de
// recherche indiqué dans la table." The wait and the test are the gamemaster's, never the card's.
const retry = () => import("../modules/interface/shop-retry.js")
const HOUR = 3600

let settings, testLines, created
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
// A failed card of the player's, for a 500 ¥ item (table: 1 day, so 2 days to wait)
const card = (results, author = player) => ({
  id: "msg1", author, flags: {
    sr5shop: {
      buyerId: "buyer", surcharge: 0, results
    }
  }
})
const failed = [{
  uuid: "Item.gun", outcome: "failure", quantity: 1, name: "Gun", hits: 0
}]

beforeEach(() => {
  settings = {
  }
  created = []
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
    create: async m => created.push(m)
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
      time: 1000, used: []
    }
    expect(retryRefusal({
      entry, now: 1000 + 47 * HOUR, waitHours: 48, uuid: "u"
    })).toBe("early")
    expect(retryRefusal({
      entry, now: 1000 + 48 * HOUR, waitHours: 48, uuid: "u"
    })).toBe(null)
    expect(retryRefusal({
      entry: {
        time: 0, used: ["u"]
      }, now: 1e9, waitHours: 48, uuid: "u"
    })).toBe("used")
    expect(retryRefusal({
      entry: undefined, now: 1e9, waitHours: 48, uuid: "u"
    })).toBe("unknown")
  })

  it("the GM notes the world time of a failed card, not of a successful one", async () => {
    const {
      recordFailedCard, RETRY_LEDGER
    } = await retry()
    game.time.worldTime = 500
    await recordFailedCard(card(failed))
    await recordFailedCard({
      id: "msg2", flags: {
        sr5shop: {
          results: [{
            outcome: "success"
          }]
        }
      }
    })
    expect(settings[RETRY_LEDGER]).toEqual({
      msg1: {
        time: 500, used: []
      }
    })
  })

  it("a player cannot write the ledger", async () => {
    const {
      recordFailedCard, RETRY_LEDGER
    } = await retry()
    game.user = player
    await recordFailedCard(card(failed))
    expect(settings[RETRY_LEDGER]).toBeUndefined()
  })

  it("too early: refused, nothing rolled; on time: the GM rolls with the buyer, once", async () => {
    const {
      recordFailedCard, rollRetry
    } = await retry()
    game._card = card(failed)
    await recordFailedCard(game._card)
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

  it("forged: a user who does not own the buyer, or a card the GM never saw, rolls nothing", async () => {
    const {
      rollRetry
    } = await retry()
    game._card = card(failed)
    game.time.worldTime = 1e9
    // never recorded by the GM: "unknown"
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 0
    }, "pl")).toBe(false)
    settings.sr5ShopRetryLedger = {
      msg1: {
        time: 0, used: []
      }
    }
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 0
    }, "st")).toBe(false)
    // a critical glitch gives no second chance
    game._card = card([{
      ...failed[0], outcome: "criticalGlitch"
    }])
    expect(await rollRetry({
      messageId: "msg1", uuid: "Item.gun", surcharge: 0
    }, "pl")).toBe(false)
    expect(testLines).not.toHaveBeenCalled()
  })

  it("the card the GM rolled for the player's buyer is read by the till", () => {
    game._card = card([{
      uuid: "Item.gun", outcome: "success", obtained: true, netHits: 2
    }], gm)
    expect(cardResult("msg1", "Item.gun", "pl")?.netHits).toBe(2)
    expect(cardResult("msg1", "Item.gun", "st")).toBe(null)
  })
})
