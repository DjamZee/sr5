import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"

import {
  sr5HandOverNuyen, sr5HandOverLoot, sr5PayoutSpent, sr5SocketTablePayout
} from "../modules/interface/table-payout.js"

// Everything written, in order: the claim on the card and the documents
// created on actors land in the same list, so a test can say which came first.
let writes

/**
 * A chat card as the server keeps it: an update is only seen once the
 * server has answered, a tick later.
 * @param {string} id
 * @param {object} flags
 * @returns {object}
 */
function card(id, flags) {
  const message = {
    id,
    content: "<div class=\"SR-TablePayoutRow\" data-payout=\"nuyen\"><button>Verser</button></div>" +
      "<div class=\"SR-TablePayoutRow\" data-payout=\"loot\"><button>Donner</button></div>",
    flags: {
      sr5: flags
    },
    getFlag(_scope, key) {
      return foundry.utils.getProperty(this.flags.sr5, key)
    },
    async update(changes) {
      writes.push({
        on: id, changes
      })
      await new Promise(resolve => setTimeout(resolve, 5))
      for (const [key, value] of Object.entries(changes)) {
        if (key === "content") this.content = value
        else foundry.utils.setProperty(this, key, value)
      }
      return this
    }
  }
  return message
}

/**
 * A character receiving what the card hands over.
 * @param {string} name
 * @returns {object}
 */
function pc(name) {
  return {
    name,
    uuid: `Actor.${name}`,
    received: [],
    async createEmbeddedDocuments(_type, data) {
      writes.push({
        on: name, data
      })
      await new Promise(resolve => setTimeout(resolve, 5))
      this.received.push(...data)
    }
  }
}

const veste = {
  name: "Veste", toObject: () => ({
    _id: "v", type: "itemArmor", system: {
    }
  })
}

describe("a table card is handed over once", () => {
  beforeEach(() => {
    writes = []
    globalThis.ui = {
      notifications: {
        info: () => {}, warn: () => {}
      }
    }
    globalThis.fromUuid = async uuid => (uuid === "Item.veste" ? veste : null)
    game.user = {
      id: "gm1", isGM: true
    }
  })

  afterEach(() => {
    delete globalThis.ui
    delete globalThis.fromUuid
    delete game.user
    delete game.messages
  })

  // Mahaut, 2026-09-26: a double click on "Verser" paid 2 × 200¥ to each of
  // two characters for a card announcing 400¥.
  it("pays the nuyen once when Verser is clicked twice", async () => {
    const message = card("m1", {
      tableNuyen: 400, tableName: "Butin"
    })
    const a = pc("Ana")
    const b = pc("Bo")

    await Promise.all([sr5HandOverNuyen(message, [a, b]), sr5HandOverNuyen(message, [a, b])])

    expect(a.received.map(item => item.system.amount)).toEqual([200])
    expect(b.received.map(item => item.system.amount)).toEqual([200])
  })

  it("gives the gear once when Donner is clicked twice", async () => {
    const message = card("m2", {
      tableLoot: [{
        uuid: "Item.veste", quantity: 1
      }]
    })
    const a = pc("Ana")

    await Promise.all([sr5HandOverLoot(message, a), sr5HandOverLoot(message, a)])

    expect(a.received).toHaveLength(1)
  })

  // Written on the card before anything is written on an actor: a page
  // reloaded in between, or another game master, finds the row spent.
  it("marks the card as spent before touching any actor", async () => {
    const message = card("m3", {
      tableNuyen: 100, tableName: "Butin"
    })
    await sr5HandOverNuyen(message, [pc("Ana")])

    expect(writes[0]).toEqual({
      on: "m3", changes: {
        "flags.sr5.tablePayoutSpent.nuyen": "gm1"
      }
    })
    expect(writes[1].on).toBe("Ana")
  })

  it("pays nothing from a card already paid before a reload", async () => {
    const message = card("m4", {
      tableNuyen: 100, tablePayoutSpent: {
        nuyen: "gm2"
      }
    })
    const a = pc("Ana")

    await sr5HandOverNuyen(message, [a])

    expect(a.received).toHaveLength(0)
    expect(sr5PayoutSpent(message, "nuyen")).toBe(true)
    expect(sr5PayoutSpent(message, "loot")).toBe(false)
  })

  // Two game masters: both ask the designated one, which hands the row over
  // once however close together the requests arrive.
  it("hands a row over once when two game masters ask together", async () => {
    const message = card("m5", {
      tableNuyen: 300, tableName: "Butin"
    })
    const a = pc("Ana")
    game.messages = new Map([["m5", message]])
    globalThis.fromUuid = async uuid => (uuid === "Actor.Ana" ? a : null)
    const request = {
      data: {
        messageId: "m5", kind: "nuyen", actorUuids: ["Actor.Ana"]
      }
    }

    await Promise.all([
      sr5SocketTablePayout(request), sr5SocketTablePayout(request),
      sr5HandOverNuyen(message, [a])
    ])

    expect(a.received.map(item => item.system.amount)).toEqual([300])
  })
})
