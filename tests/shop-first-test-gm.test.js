import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// The first availability test of the shop without a vendor (SR5 p. 420) is the active gamemaster's, like the
// new test after a failure: a player's browser only sends the request, so a card with made-up dice is never
// the one the till or the ledger reads.
const emitForGM = vi.fn(async () => {})
vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: (...args) => emitForGM(...args)
  }
}))

import {
  SR5ShopAvailability
} from "../modules/interface/shop-availability.js"
import {
  cardResult
} from "../modules/interface/shop-orders.js"

const retry = () => import("../modules/interface/shop-retry.js")

let settings
const gm = {
  id: "gm", isGM: true
}
const player = {
  id: "pl", isGM: false
}
const stranger = {
  id: "st", isGM: false
}
const contact = {
  id: "fixer", type: "itemContact"
}
const buyer = {
  id: "buyer", name: "Wrecker",
  testUserPermission: (u) => u.id === "pl" || u.isGM,
  items: {
    get: id => id === "fixer" ? contact : null
  },
}
const card = (results, author, extra = {
}) => ({
  id: "msg1", author, content: '<footer class="sr-shop-card-footer">x</footer>', update: vi.fn(async () => {}),
  flags: {
    sr5shop: {
      buyerId: "buyer", surcharge: 0, limit: 0, results, ...extra
    }
  }
})

beforeEach(() => {
  settings = {
  }
  vi.restoreAllMocks()
  emitForGM.mockClear()
  globalThis.game = {
    user: player,
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
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.foundry.documents ??= {
  }
  globalThis.foundry.documents.ChatMessage = {
    create: vi.fn(async () => ({
    }))
  }
  globalThis.foundry.utils.escapeHTML ??= s => s
  globalThis.fromUuid = vi.fn(async () => ({
    // An entry of the shelves (a compendium): the only thing the shop sells (R1)
    name: "Gun", type: "itemWeapon", pack: "sr5.gear", system: {
      price: {
        value: 500
      }, availability: {
        value: 4
      }
    }
  }))
  globalThis.Roll = class {
    constructor() {
      throw new Error("a player's browser rolled the availability test")
    }
  }
})

const lines = [{
  uuid: "Compendium.sr5.gear.Item.gun", quantity: 2, name: "Gun", grade: null
}]

describe("the first availability test is rolled by the active GM (SR5 p. 420)", () => {
  it("a player's browser rolls nothing and posts nothing: it asks the GM", async () => {
    await SR5ShopAvailability.testLines(buyer, contact, lines, 50, {
      overridePool: 30, overrideLimit: 30
    })
    expect(foundry.documents.ChatMessage.create).not.toHaveBeenCalled()
    expect(emitForGM).toHaveBeenCalledTimes(1)
    const [type, payload] = emitForGM.mock.calls[0]
    expect(type).toBe("shopAvailabilityRetry")
    expect(payload).toMatchObject({
      first: true, buyerId: "buyer", contactId: "fixer", surcharge: 50,
      lines: [{
        uuid: "Compendium.sr5.gear.Item.gun", quantity: 2, grade: null
      }],
    })
    // A pool or a limit typed by the player is not sent: the GM recomputes them
    expect(payload).not.toHaveProperty("overridePool")
    expect(payload).not.toHaveProperty("overrideLimit")
  })

  it("no GM connected: a clear message, no test, no request", async () => {
    game.users.activeGM = null
    await SR5ShopAvailability.testLines(buyer, null, lines, 0)
    expect(ui.notifications.warn).toHaveBeenCalledWith("SR5.WARN_ShopTestNoGM")
    expect(emitForGM).not.toHaveBeenCalled()
    expect(foundry.documents.ChatMessage.create).not.toHaveBeenCalled()
  })

  it("the GM rolls for a buyer the requester owns, with the buyer's own contact, and never a typed pool", async () => {
    game.user = gm
    const {
      socketRetry
    } = await retry()
    const testLines = vi.spyOn(SR5ShopAvailability, "testLines").mockResolvedValue({
    })
    await socketRetry({
      data: {
        first: true, buyerId: "buyer", contactId: "fixer", surcharge: 25, overridePool: 40,
        lines: [...lines, {
          uuid: 42
        }]
      }
    }, "pl")
    expect(testLines).toHaveBeenCalledTimes(1)
    const [actor, searcher, sent, surcharge, options] = testLines.mock.calls[0]
    expect(actor).toBe(buyer)
    expect(searcher).toBe(contact)
    expect(sent).toEqual([{
      uuid: "Compendium.sr5.gear.Item.gun", quantity: 2, grade: null
    }])
    expect(surcharge).toBe(25)
    expect(options?.overridePool).toBeUndefined()

    testLines.mockClear()
    await socketRetry({
      data: {
        first: true, buyerId: "buyer", lines
      }
    }, "st")
    expect(testLines).not.toHaveBeenCalled()
  })

  it("a card a player wrote is not recorded by the GM, and the till does not read it", async () => {
    game.user = gm
    const {
      recordShopCard, RETRY_LEDGER
    } = await retry()
    const forged = card([{
      uuid: "Item.gun", outcome: "success", obtained: true, netHits: 12, faces: [6, 6, 6], oppositionFaces: []
    }], player, {
      surcharge: 0
    })
    await recordShopCard(forged)
    expect(settings[RETRY_LEDGER]?.msg1).toBeUndefined()
    game._card = forged
    expect(cardResult("msg1", "Item.gun", "pl")).toBe(null)
  })

  it("the GM's card: the outcome and the lines are frozen in the ledger, which the till reads", async () => {
    game.user = gm
    const {
      recordShopCard, cashCard, RETRY_LEDGER
    } = await retry()
    const {
      SR5Shop
    } = await import("../modules/interface/shop.js")
    const checkout = vi.spyOn(SR5Shop, "checkout").mockResolvedValue(true)
    game._card = card([{
      uuid: "Item.gun", outcome: "success", obtained: true, quantity: 1, netHits: 2, faces: [5, 6, 2], oppositionFaces: [1]
    }, {
      uuid: "Item.knife", outcome: "failure", obtained: false, quantity: 1, netHits: -1, faces: [2], oppositionFaces: [5]
    }], gm)
    await recordShopCard(game._card)
    expect(settings[RETRY_LEDGER].msg1.lines).toEqual([{
      uuid: "Item.gun", quantity: 1, grade: null, outcome: "success", netHits: 2, obtained: true
    }, {
      uuid: "Item.knife", quantity: 1, grade: null, outcome: "failure", netHits: -1, obtained: false
    }])
    // Whatever the card says afterwards, the till reads the ledger
    game._card.flags.sr5shop.results[1].obtained = true
    game._card.flags.sr5shop.results[0].netHits = 9
    expect(cardResult("msg1", "Item.gun", "pl")?.netHits).toBe(2)
    expect(await cashCard({
      messageId: "msg1"
    }, "pl")).toBe(true)
    expect(checkout).toHaveBeenCalledWith(buyer, [expect.objectContaining({
      uuid: "Item.gun"
    })], expect.anything())
    expect(checkout.mock.calls[0][1]).toHaveLength(1)
  })
})
