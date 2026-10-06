import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

// Système sensible (SR5 p. 89): "Le bioware, quel que soit sa conception ou son type de culture, est rejeté".
// Apolline's review: a transfer that deletes first and creates afterwards lost a refused bioware on both sides;
// a quality created with the bioware was not seen; the gamemaster was blocked; a delivery lost the order.
// Everything is screened BEFORE anything moves; the gamemaster is asked and may keep it.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
  },
}))
vi.mock("../modules/interface/shop.js", () => ({
  SR5Shop: {
    _itemPayload: (source, quantity) => Array.from({
      length: quantity
    }, () => ({
      type: source.type, name: source.name, system: {
        ...source.system
      }
    })),
  },
}))

const {
  screenRejectedImplants, IMPLANT_REJECTION_CONFIRMED
} = await import("../modules/system/implant-essence.js")
const {
  SR5Item
} = await import("../modules/entities/items/entityItem.js")
const {
  deliverOrder
} = await import("../modules/interface/shop-orders.js")

const sensitive = {
  type: "itemQuality", name: "Système sensible", system: {
    isActive: true, systemEffects: {
      0: {
        category: "specialCase", value: "doubleEssenceCost"
      }
    }
  }
}
const glande = () => ({
  type: "itemAugmentation", name: "Glande", system: {
    type: "bioware", storedIn: ""
  }
})
const datajack = () => ({
  type: "itemAugmentation", name: "Datajack", system: {
    type: "cyberware"
  }
})
const body = (items = []) => Object.assign(Object.create(Actor.prototype), {
  name: "Essai", items
})

let confirmAnswer, asked
beforeEach(() => {
  asked = 0
  confirmAnswer = null
  globalThis.foundry.applications.api.DialogV2 = {
    confirm: async () => {
      asked++
      return confirmAnswer
    }
  }
})
afterEach(() => {
  delete globalThis.foundry.applications.api.DialogV2
})

describe("screening before anything moves", () => {
  it("leaves the bioware out for a player, and says why", async () => {
    const warned = []
    const g = glande()
    const result = await screenRejectedImplants(body([sensitive]), [g, datajack()], {
      isGM: false, warn: key => warned.push(key)
    })
    expect(result.refused).toEqual([g])
    expect(result.confirmed).toBe(false)
    expect(warned).toEqual(["SR5.WARN_ImplantRejected"])
    expect(asked).toBe(0)
  })
  it("asks the gamemaster, who may keep it", async () => {
    confirmAnswer = true
    expect(await screenRejectedImplants(body([sensitive]), [glande()], {
      isGM: true
    })).toEqual({
      refused: [], confirmed: true
    })
    confirmAnswer = null
    const g = glande()
    expect((await screenRejectedImplants(body([sensitive]), [g], {
      isGM: true
    })).refused).toEqual([g])
    expect(asked).toBe(2)
  })
  it("sees a quality that arrives in the same batch", async () => {
    const g = glande()
    expect((await screenRejectedImplants(body([]), [sensitive, g], {
      isGM: false, warn: () => {}
    })).refused).toEqual([g])
  })
  it("lets a stored implant through: carried in a stash is not installed", async () => {
    expect((await screenRejectedImplants(body([sensitive]), [{
      ...glande(), system: {
        type: "bioware", storedIn: "stash"
      }
    }], {
      isGM: false, warn: () => {}
    })).refused).toEqual([])
  })
})

describe("the last guard on creation (a drop on the sheet)", () => {
  beforeEach(() => {
    Item._preCreateOperation ??= async () => {}
  })
  const run = async (actor, documents, operation = {
  }) => SR5Item._preCreateOperation(documents, {
    parent: actor, ...operation
  }, game.user)

  it("drops the bioware for a player, keeps the rest", async () => {
    game.user = {
      isGM: false
    }
    const g = glande(), d = datajack()
    const documents = [g, d]
    await run(body([sensitive]), documents)
    expect(documents).toEqual([d])
  })
  it("refuses the bioware even when the quality comes with it", async () => {
    game.user = {
      isGM: false
    }
    const documents = [sensitive, glande()]
    await run(body([]), documents)
    expect(documents).toEqual([sensitive])
  })
  it("cancels the operation when nothing is left", async () => {
    game.user = {
      isGM: false
    }
    expect(await run(body([sensitive]), [glande()])).toBe(false)
  })
  it("honours the gamemaster's confirmation, and his only", async () => {
    game.user = {
      isGM: true
    }
    const documents = [glande()]
    await run(body([sensitive]), documents, {
      [IMPLANT_REJECTION_CONFIRMED]: true
    })
    expect(documents).toHaveLength(1)
    expect(asked).toBe(0)
    game.user = {
      isGM: false
    }
    const forged = [glande()]
    expect(await run(body([sensitive]), forged, {
      [IMPLANT_REJECTION_CONFIRMED]: true
    })).toBe(false)
  })
})

describe("a deferred order delivered after Système sensible was taken", () => {
  const gm = {
    id: "gm", isGM: true
  }
  const order = {
    id: "o1", uuid: "Compendium.x.Item.glande", name: "Glande", quantity: 1, paid: 1000
  }
  let buyer, setFlag, createEmbeddedDocuments
  beforeEach(() => {
    game.user = gm
    game.users = Object.assign([gm], {
      activeGM: gm
    })
    game.settings = {
      get: () => ({
      }), set: async () => {}
    }
    globalThis.fromUuid = async () => glande()
    setFlag = vi.fn()
    createEmbeddedDocuments = vi.fn()
    buyer = Object.assign(body([sensitive]), {
      getFlag: () => [order], setFlag, createEmbeddedDocuments, uuid: "Actor.b"
    })
  })
  it("declined, the order stays on the sheet, paid, and the gamemaster is told to cancel it", async () => {
    const warn = vi.spyOn(ui.notifications, "warn").mockImplementation(() => {})
    confirmAnswer = null
    expect(await deliverOrder(buyer, "o1")).toBe(false)
    expect(asked).toBe(1)
    expect(setFlag).not.toHaveBeenCalled()
    expect(createEmbeddedDocuments).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith("SR5.WARN_ShopOrderRejectedKept")
    warn.mockRestore()
  })
  it("kept, the goods arrive with the gamemaster's confirmation", async () => {
    confirmAnswer = true
    globalThis.foundry.utils.escapeHTML ??= text => String(text)
    globalThis.foundry.documents.ChatMessage = {
      create: async () => {}, getSpeaker: () => ({
      })
    }
    await deliverOrder(buyer, "o1")
    expect(createEmbeddedDocuments).toHaveBeenCalledTimes(1)
    expect(createEmbeddedDocuments.mock.calls[0][2]).toEqual({
      [IMPLANT_REJECTION_CONFIRMED]: true
    })
  })
})
