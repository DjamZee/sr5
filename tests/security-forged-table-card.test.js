import {
  describe, it, expect, vi, beforeEach
} from "vitest"

import {
  sr5HookRenderTablePayout, sr5PayoutNeedsReview
} from "../modules/interface/table-payout.js"

// Security pass of 06/10 (Kurt): the money and the gear a table card hands over are flags of the card, its author's to
// write, and the card itself shows only how many items were found. A player who forges one from her console (any
// item, any quantity, any sum) had the GM hand it over in one click. A card a GM did not write is shown to the GM,
// item by item, before anything goes.

let received, confirm

const pc = {
  name: "Clo", uuid: "Actor.clo", type: "actorPc", isOwner: true,
  async createEmbeddedDocuments(_type, data){
    received.push(...data)
  }
}

// A new id each time: a row handed over stays claimed in this browser (table-payout.js HANDING_OVER)
let ids = 0
const card = (author, flags) => ({
  id: `m${++ids}`, author, content: "",
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

// The footer of a card as rendered, its two buttons wired by the hook
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
  const footer = {
    querySelector: (sel) => buttons[sel.match(/"(.+)"/)[1]],
    querySelectorAll: () => Object.values(buttons),
  }
  sr5HookRenderTablePayout(message, {
    querySelector: () => footer
  })
  return buttons
}

const tick = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  received = []
  confirm = vi.fn(async () => false)
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
      }, warn(){
      }
    }
  }
  globalThis.canvas = {
    tokens: {
      controlled: [{
        actor: pc
      }]
    }
  }
  globalThis.fromUuid = async (uuid) => uuid === "Compendium.sr5.gear.Item.cyberdeck" ? {
    name: "Cyberdeck Fairlight Excalibur", toObject: () => ({
      _id: "x", type: "itemDevice", system: {
      }
    })
  } : null
  globalThis.foundry.applications = {
    api: {
      DialogV2: {
        confirm
      }
    }
  }
  globalThis.foundry.utils.escapeHTML = (t) => String(t)
})

describe("a table card a GM did not write", () => {
  it("is reviewed; a GM's own draw is not", () => {
    expect(sr5PayoutNeedsReview(card({
      isGM: false
    }, {
    }))).toBe(true)
    expect(sr5PayoutNeedsReview(card(null, {
    }))).toBe(true)
    expect(sr5PayoutNeedsReview(card({
      isGM: true
    }, {
    }))).toBe(false)
  })

  it("shows the GM each item and its quantity before Donner, and hands nothing over on a no", async () => {
    const forged = card({
      id: "clo", isGM: false, name: "Joueuse Clo"
    }, {
      tableLoot: [{
        uuid: "Compendium.sr5.gear.Item.cyberdeck", quantity: 50
      }]
    })
    rendered(forged).sr5GiveTableLoot.click()
    await tick()
    await tick()
    expect(confirm).toHaveBeenCalledTimes(1)
    const shown = confirm.mock.calls[0][0].content
    expect(shown).toContain("Cyberdeck Fairlight Excalibur")
    expect(shown).toContain("50")
    expect(received).toHaveLength(0)
    expect(forged.flags.sr5.tablePayoutSpent).toBeUndefined()
  })

  it("shows the sum written in the flags before Verser, whatever the card's text says", async () => {
    const forged = card({
      id: "clo", isGM: false
    }, {
      tableNuyen: 1000000
    })
    rendered(forged).sr5PayTableNuyen.click()
    await tick()
    await tick()
    expect(confirm.mock.calls[0][0].content).toContain((1000000).toLocaleString())
    expect(received).toHaveLength(0)
  })

  it("hands it over once the GM says yes, and leaves the button usable after a no", async () => {
    const forged = card({
      id: "clo", isGM: false
    }, {
      tableNuyen: 300
    })
    const buttons = rendered(forged)
    buttons.sr5PayTableNuyen.click()
    await tick()
    await tick()
    expect(buttons.sr5PayTableNuyen.disabled).toBe(false)
    confirm.mockImplementation(async () => true)
    buttons.sr5PayTableNuyen.click()
    for (let i = 0; i < 5; i++) await tick()
    expect(received).toHaveLength(1)
    expect(received[0].system.amount).toBe(300)
  })

  it("a GM's own draw is handed over without a window", async () => {
    const own = card({
      id: "gm", isGM: true
    }, {
      tableNuyen: 300
    })
    rendered(own).sr5PayTableNuyen.click()
    for (let i = 0; i < 5; i++) await tick()
    expect(confirm).not.toHaveBeenCalled()
    expect(received).toHaveLength(1)
  })
})
