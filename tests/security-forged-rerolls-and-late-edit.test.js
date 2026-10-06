import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// Bodo's review of fix/securite-cartes-restes (06/10), two flaws measured in game:
// 1. A card that says it pushed the limit counted every die marked as a Rule of Six reroll: thirty forged rerolls
//    prefilled the GM's window with 42 hits. A reroll comes only from a six (SR5 p. 56 VO, p. 58 VF): a card has as
//    many rerolls as it rolled sixes, the sixes of the rerolls included, and no more.
// 2. A table card was shown to the GM, then read again after his yes: its author edited it meanwhile, and 5 000 000 ¥
//    went out for 1 000 000 ¥ shown. What goes out is what was shown, and a card changed since is not handed over.
const {
  recountHits
} = await import("../modules/rolls/roll-helpers/socket-guard.js")
const {
  sr5HookRenderTablePayout, sr5SocketTablePayout
} = await import("../modules/interface/table-payout.js")

const roll = (kept, rerolls = []) => ({
  terms: [{
    results: [...kept.map(result => ({
      result, active: true
    })), ...rerolls.map(result => ({
      result, active: true, ruleOfSix: true
    }))]
  }]
})

describe("the rerolls of the Rule of Six a card may count", () => {
  it("are as many as the sixes it rolled, never the dice it writes", () => {
    // no six in the pool: thirty written rerolls count for nothing
    expect(recountHits(roll([5, 5, 1, 1], new Array(30).fill(5)), 4)).toBe(2)
    // one six: one reroll (a 5), the others are not rerolls
    expect(recountHits(roll([6, 1, 1, 1], [5, 5, 5, 5]), 4)).toBe(2)
  })

  it("a six rerolled earns one reroll more, as Foundry's explosion does", () => {
    expect(recountHits(roll([6, 1, 1, 1], [6, 6, 5, 5]), 4)).toBe(4)
  })

  // Hyacinthe's review (06/10): a chain of sixes a card writes has no end; never more rerolls than dice in the pool
  it("never counts more rerolls than dice in the pool", () => {
    expect(recountHits(roll([6, 1], [6, 6, 5, 5]), 2)).toBe(3)
    expect(recountHits(roll(new Array(12).fill(6), new Array(30).fill(6)), 12)).toBe(24)
  })
  it("counts no reroll at all for a test that did not push the limit", () => {
    expect(recountHits(roll([6, 6, 1], [6, 6]), 3, {
      rerolls: false
    })).toBe(2)
  })

  it("a true roll keeps all its hits", () => {
    expect(recountHits(roll([6, 6, 5, 2], [6, 1, 5]), 4)).toBe(5)
  })
})

let received, confirm, ids = 0

const pc = {
  name: "Clo", uuid: "Actor.clo", type: "actorPc", isOwner: true,
  async createEmbeddedDocuments(_type, data){
    received.push(...data)
  }
}

const card = (flags) => ({
  id: `late${++ids}`, author: {
    id: "clo", isGM: false, name: "Clo"
  }, content: "",
  flags: {
    sr5: flags
  },
  getFlag(_scope, key){
    return foundry.utils.getProperty(this.flags.sr5, key)
  },
  async update(changes){
    for (const [key, value] of Object.entries(changes)) {
      if (key !== "content") foundry.utils.setProperty(this, key, value)
    }
    return this
  }
})

const rendered = (message) => {
  const buttons = {
  }
  for (const action of ["sr5PayTableNuyen", "sr5GiveTableLoot"]) {
    buttons[action] = {
      disabled: false, addEventListener(_e, fn){
        this.click = fn
      }
    }
  }
  sr5HookRenderTablePayout(message, {
    querySelector: () => ({
      querySelector: (sel) => buttons[sel.match(/"(.+)"/)[1]],
      querySelectorAll: () => Object.values(buttons),
    })
  })
  return buttons
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0))
}

beforeEach(() => {
  received = []
  const gm = {
    id: "gm", isGM: true, isSelf: true
  }
  globalThis.game = {
    user: gm, users: {
      activeGM: gm
    },
    i18n: {
      localize: (k) => k, format: (k, d) => `${k}:${JSON.stringify(d ?? {
      })}`
    },
  }
  globalThis.ui = {
    notifications: {
      info(){
      }, warn: vi.fn()
    }
  }
  globalThis.canvas = {
    tokens: {
      controlled: [{
        actor: pc
      }]
    }
  }
  globalThis.fromUuid = async () => ({
    name: "Veste", toObject: () => ({
      _id: "v", type: "itemArmor", system: {
      }
    })
  })
  globalThis.foundry.utils.escapeHTML = (t) => String(t)
})

// The author edits her card while the GM reads it, then he says yes
const editedWhileShown = (message, edit) => {
  confirm = vi.fn(async () => {
    edit(message)
    return true
  })
  globalThis.foundry.applications = {
    api: {
      DialogV2: {
        confirm
      }
    }
  }
}

describe("a table card edited while the GM reads it", () => {
  it("pays nothing when the sum changed after it was shown", async () => {
    const message = card({
      tableNuyen: 1000000
    })
    editedWhileShown(message, m => {
      m.flags.sr5.tableNuyen = 5000000
    })
    const buttons = rendered(message)
    buttons.sr5PayTableNuyen.click()
    await settle()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(received).toHaveLength(0)
    expect(ui.notifications.warn).toHaveBeenCalled()
    expect(buttons.sr5PayTableNuyen.disabled).toBe(false)
  })

  it("gives nothing when the gear changed after it was shown", async () => {
    const message = card({
      tableLoot: [{
        uuid: "Item.veste", quantity: 1
      }]
    })
    editedWhileShown(message, m => {
      m.flags.sr5.tableLoot = [{
        uuid: "Item.veste", quantity: 3
      }]
    })
    rendered(message).sr5GiveTableLoot.click()
    await settle()
    expect(received).toHaveLength(0)
  })

  it("an unchanged card pays what was shown", async () => {
    const message = card({
      tableNuyen: 300
    })
    editedWhileShown(message, () => {})
    rendered(message).sr5PayTableNuyen.click()
    await settle()
    expect(received).toHaveLength(1)
    expect(received[0].system.amount).toBe(300)
  })

  it("a second GM relays what he was shown: the active GM hands over nothing if the card changed since", async () => {
    const message = card({
      tableNuyen: 1000000
    })
    game.messages = {
      get: () => message
    }
    game.users.get = () => ({
      isGM: true
    })
    globalThis.fromUuid = async () => pc
    const shown = JSON.stringify(1000000)
    message.flags.sr5.tableNuyen = 5000000
    await sr5SocketTablePayout({
      data: {
        messageId: message.id, kind: "nuyen", actorUuids: [pc.uuid], shown
      }
    }, "gm2")
    expect(received).toHaveLength(0)
    message.flags.sr5.tableNuyen = 1000000
    await sr5SocketTablePayout({
      data: {
        messageId: message.id, kind: "nuyen", actorUuids: [pc.uuid], shown
      }
    }, "gm2")
    expect(received).toHaveLength(1)
  })
})
