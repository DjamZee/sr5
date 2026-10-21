import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  ROLL_REMINDERS_HOOK, VENDOR_PRICE_HOOK, PURCHASE_FUNDS_HOOK, VENDOR_REFUSAL_HOOK, INITIATIVE_REMINDERS_HOOK,
  MAX_REMINDERS, rollRemindersFor, vendorPriceFor, purchaseFundsVerdict, reminderModifierType, reminderCardLine,
  vendorRefusalFor, shelfPrice, initiativeRemindersFor, initiativeCardLine,
  confirmFundsWarning, MAX_WARNING, callSubscribers
} from "../modules/system/house-rule-hooks.js"
import {
  foundryHooks
} from "./fixtures/foundry-hooks.js"

// Câblage Maison, lot 2 (21/10): three hooks for a module of house rules, on the pattern of sr5.essenceCostFor. The
// system plays the book; a subscriber changes it in a module; a bad answer or a subscriber that throws leaves the book.

const HOOKS = [ROLL_REMINDERS_HOOK, VENDOR_PRICE_HOOK, PURCHASE_FUNDS_HOOK, VENDOR_REFUSAL_HOOK, INITIATIVE_REMINDERS_HOOK]

/** Foundry's Hooks with these subscribers on every hook of this file, in order; `seen` the hooks called */
function subscribers(...fns) {
  const hooks = foundryHooks(Object.fromEntries(HOOKS.map(hook => [hook, fns])))
  return {
    hooks, seen: hooks.seen
  }
}
const none = foundryHooks()
const throwing = () => {
  throw new Error("module")
}

describe("sr5.rollReminders", () => {
  const actor = {
    name: "Essai"
  }
  const rollData = {
    test: {
      type: "skill", typeSub: "intimidation"
    }, dicePool: {
      value: 8
    }
  }

  it("shows nothing without a subscriber", () => {
    expect(rollRemindersFor(actor, rollData, {
      hooks: none
    })).toEqual([])
  })
  it("gives the actor, a copy of the test, and keeps the lines cleaned, unticked", () => {
    let got
    const {
      hooks, seen
    } = subscribers(data => {
      got = data
      data.rollData.dicePool.value = 99
      data.reminders.push({
        label: "  +1 dé si la cible l'a blessé dans la scène ", source: "Trait — Vindicatif", dice: 1
      }, {
        label: "rappel seul"
      }, {
        source: "sans texte"
      }, {
        label: "trop de dés", dice: 7
      }, {
        label: "dés non entiers", dice: 1.5
      })
    })
    const lines = rollRemindersFor(actor, rollData, {
      hooks
    })
    expect(seen).toEqual([ROLL_REMINDERS_HOOK])
    expect(ROLL_REMINDERS_HOOK).toBe("sr5.rollReminders")
    expect(got.actor).toBe(actor)
    expect(got.rollData.test.typeSub).toBe("intimidation")
    expect(rollData.dicePool.value).toBe(8)
    expect(lines).toEqual([
      {
        id: "r0", label: "+1 dé si la cible l'a blessé dans la scène", source: "Trait — Vindicatif", dice: 1, applied: false
      },
      {
        id: "r1", label: "rappel seul", source: "", dice: 0, applied: false
      },
      {
        id: "r2", label: "trop de dés", source: "", dice: 0, applied: false
      },
      {
        id: "r3", label: "dés non entiers", source: "", dice: 0, applied: false
      },
    ])
  })
  it("keeps ten lines at most, and none when a subscriber throws or replaces the list", () => {
    const many = subscribers(data => {
      for (let i = 0; i < 15; i++) data.reminders.push({
        label: `ligne ${i}`
      })
    })
    expect(rollRemindersFor(actor, rollData, many)).toHaveLength(MAX_REMINDERS)
    expect(rollRemindersFor(actor, rollData, {
      hooks: subscribers(throwing).hooks
    })).toEqual([])
    expect(rollRemindersFor(actor, rollData, subscribers(data => (data.reminders = "x")))).toEqual([])
  })
  it("names the pool modifier of a ticked line, and writes the card's line", () => {
    expect(reminderModifierType("r0")).toBe("reminder_r0")
    expect(reminderCardLine({
      source: "Trait — Vindicatif", label: "si la cible l'a blessé", dice: 1
    }, " : ")).toBe("Trait — Vindicatif : si la cible l'a blessé (+1)")
    expect(reminderCardLine({
      source: "", label: "rappel seul", dice: 0
    })).toBe("rappel seul")
    expect(reminderCardLine({
      label: "malus", dice: -2
    })).toBe("malus (-2)")
  })
})

describe("sr5.vendorPrice", () => {
  const args = {
    vendor: {
      name: "Vendeur"
    }, storage: {
      id: "s1"
    }, buyer: {
      name: "Acheteur"
    }, quantity: 2,
    item: {
      type: "itemGear", name: "Médikit", system: {
        price: {
          value: 1000
        }
      }, grade: null, uuid: "Actor.a.Item.b"
    }, price: 1000,
  }

  it("is the book's price without a subscriber", () => {
    expect(vendorPriceFor(args, {
      hooks: none
    })).toEqual({
      price: 1000, notes: []
    })
  })
  it("gives the vendor, its shop, the buyer, a copy of the line, the unit price and the quantity", () => {
    let got
    const {
      hooks, seen
    } = subscribers(data => {
      got = data
      data.item.system.price.value = 0
      data.price = data.price * 0.9
      data.notes.push("dont réputation de faction : −100 ¥", 12, "")
    })
    expect(vendorPriceFor(args, {
      hooks
    })).toEqual({
      price: 900, notes: ["dont réputation de faction : −100 ¥"]
    })
    expect(seen).toEqual([VENDOR_PRICE_HOOK])
    expect(VENDOR_PRICE_HOOK).toBe("sr5.vendorPrice")
    expect(got.vendor).toBe(args.vendor)
    expect(got.storage).toBe(args.storage)
    expect(got.buyer).toBe(args.buyer)
    expect(got.quantity).toBe(2)
    expect(args.item.system.price.value).toBe(1000)
  })
  it("rounds to the nuyen, and keeps the book's price on a bad value or a subscriber that throws", () => {
    expect(vendorPriceFor(args, subscribers(data => (data.price = 949.6))).price).toBe(950)
    for (const bad of [-1, NaN, Infinity, "900", null, undefined]) {
      expect(vendorPriceFor(args, subscribers(data => (data.price = bad))).price).toBe(1000)
    }
    expect(vendorPriceFor(args, {
      hooks: subscribers(throwing).hooks
    })).toEqual({
      price: 1000, notes: []
    })
  })
})

describe("sr5.purchaseFunds", () => {
  const buyer = {
    name: "Acheteur"
  }
  const args = {
    buyer, total: 5000, balance: 1200
  }

  it("refuses without a subscriber, as the book does", () => {
    expect(purchaseFundsVerdict(args, {
      hooks: none
    })).toEqual({
      allow: false, flags: {
      }, warning: ""
    })
  })
  it("gives the buyer, the total, the balance and the shortfall; lets it go on allow === true", () => {
    let got
    const {
      hooks, seen
    } = subscribers(data => {
      got = data
      data.allow = true
      data.flags["cablage-maison-sr5"] = {
        debt: {
          creditorId: "c1", rate: 10
        }
      }
    })
    expect(purchaseFundsVerdict(args, {
      hooks
    })).toEqual({
      allow: true, flags: {
        "cablage-maison-sr5": {
          debt: {
            creditorId: "c1", rate: 10
          }
        }
      }, warning: ""
    })
    expect(seen).toEqual([PURCHASE_FUNDS_HOOK])
    expect(PURCHASE_FUNDS_HOOK).toBe("sr5.purchaseFunds")
    expect(got.buyer).toBe(buyer)
    expect(got.total).toBe(5000)
    expect(got.balance).toBe(1200)
    expect(got.shortfall).toBe(3800)
    expect(got.vendor).toBeNull()
    expect(got.storage).toBeNull()
  })
  it("never writes under sr5, nor what is not a plain object", () => {
    const verdict = purchaseFundsVerdict(args, subscribers(data => {
      data.allow = true
      data.flags = {
        sr5: {
          purchase: "forgé"
        }, other: "texte", mine: {
          a: 1
        }
      }
    }))
    expect(verdict.flags).toEqual({
      mine: {
        a: 1
      }
    })
    expect(purchaseFundsVerdict(args, subscribers(data => {
      data.allow = true
      data.flags = null
    })).flags).toEqual({
    })
  })
  it("refuses on anything but true, or a subscriber that throws", () => {
    for (const value of ["true", 1, [], null]) {
      expect(purchaseFundsVerdict(args, subscribers(data => (data.allow = value))).allow).toBe(false)
    }
    expect(purchaseFundsVerdict(args, {
      hooks: subscribers(throwing).hooks
    }).allow).toBe(false)
  })
})

describe("sr5.purchaseFunds, the buyer's warning (Câblage Maison, retours de DjamZ du 21/10)", () => {
  const args = {
    buyer: {
      name: "Acheteur"
    }, total: 5000, balance: 1200
  }
  it("carries the module's text, trimmed and cut, only when the purchase is let through", () => {
    const text = "  Attention, tu es sur le point de contracter une dette.  "
    expect(purchaseFundsVerdict(args, subscribers(data => {
      data.allow = true
      data.warning = text
    })).warning).toBe(text.trim())
    expect(purchaseFundsVerdict(args, subscribers(data => {
      data.allow = true
      data.warning = "x".repeat(MAX_WARNING + 50)
    })).warning).toHaveLength(MAX_WARNING)
    expect(purchaseFundsVerdict(args, subscribers(data => {
      data.warning = text
    })).warning).toBe("")
    expect(purchaseFundsVerdict(args, subscribers(data => {
      data.allow = true
      data.warning = {
        html: "<b>"
      }
    })).warning).toBe("")
  })
  it("asks nothing without a warning; with one, the buyer's answer decides", async () => {
    const asked = []
    const confirm = answer => async options => {
      asked.push(options)
      return answer
    }
    globalThis.game = {
      i18n: {
        localize: key => key
      }
    }
    expect(await confirmFundsWarning("", {
      confirm: confirm(false)
    })).toBe(true)
    expect(asked).toHaveLength(0)
    expect(await confirmFundsWarning("Dette <b>vorace</b>", {
      confirm: confirm(true)
    })).toBe(true)
    expect(asked[0].content).not.toContain("<b>")
    expect(asked[0].window.title).toBe("SR5.ShopFundsWarningTitle")
    expect(await confirmFundsWarning("Dette", {
      confirm: confirm(false)
    })).toBe(false)
    expect(await confirmFundsWarning("Dette", {
      confirm: confirm(null)
    })).toBe(false)
    delete globalThis.game
  })
})

describe("sr5.vendorPrice on the vendor's shelves", () => {
  it("leaves the row as it was when the module keeps the book's price", () => {
    expect(shelfPrice(1000, {
      price: 1000, notes: ["rien"]
    })).toEqual({
    })
    expect(shelfPrice(1000, null)).toEqual({
    })
  })
  it("gives the price asked, the book's to strike through and the notes as one text", () => {
    expect(shelfPrice(1000, {
      price: 900, notes: ["réputation : −100 ¥", "ami du gang"]
    })).toEqual({
      price: 900, bookPrice: 1000, priceNotes: "réputation : −100 ¥ · ami du gang"
    })
    expect(shelfPrice(1000, {
      price: 1200, notes: []
    })).toEqual({
      price: 1200, bookPrice: 1000, priceNotes: ""
    })
  })
})

describe("sr5.vendorRefusal", () => {
  const args = {
    vendor: {
      name: "Vendeur"
    }, storage: {
      id: "s1"
    }, buyer: {
      name: "Acheteur"
    }
  }

  it("sells without a subscriber, as the book does", () => {
    expect(vendorRefusalFor(args, {
      hooks: none
    })).toEqual({
      refuse: false, reason: ""
    })
  })
  it("gives the vendor, its shop and the buyer; refuses on refuse === true, with the reason cleaned", () => {
    let got
    const {
      hooks, seen
    } = subscribers(data => {
      got = data
      data.refuse = true
      data.reason = `  Les Ancients ne vendent pas aux Halloweeners ${"x".repeat(300)}`
    })
    const verdict = vendorRefusalFor(args, {
      hooks
    })
    expect(seen).toEqual([VENDOR_REFUSAL_HOOK])
    expect(VENDOR_REFUSAL_HOOK).toBe("sr5.vendorRefusal")
    expect(got.vendor).toBe(args.vendor)
    expect(got.storage).toBe(args.storage)
    expect(got.buyer).toBe(args.buyer)
    expect(verdict.refuse).toBe(true)
    expect(verdict.reason.startsWith("Les Ancients ne vendent pas aux Halloweeners")).toBe(true)
    expect(verdict.reason).toHaveLength(200)
    expect(vendorRefusalFor(args, subscribers(data => {
      data.refuse = true
      data.reason = 12
    }))).toEqual({
      refuse: true, reason: ""
    })
  })
  it("sells on anything but true, or a subscriber that throws", () => {
    for (const value of ["true", 1, [], null]) {
      expect(vendorRefusalFor(args, subscribers(data => (data.refuse = value))).refuse).toBe(false)
    }
    expect(vendorRefusalFor(args, {
      hooks: subscribers(throwing).hooks
    })).toEqual({
      refuse: false, reason: ""
    })
  })
})

describe("sr5.initiativeReminders", () => {
  const actor = {
    name: "Essai"
  }
  const args = {
    actor, combatant: {
      id: "c1"
    }, combat: {
      id: "k1"
    }, round: 1, pass: 1, roll: 14
  }

  it("adds nothing without a subscriber", () => {
    expect(initiativeRemindersFor(args, {
      hooks: none
    })).toEqual({
      lines: [], score: 0
    })
  })
  it("gives the actor, the turn and the roll; keeps the lines cleaned and adds their scores", () => {
    let got
    const {
      hooks, seen
    } = subscribers(data => {
      got = data
      if (!data.firstRound) return
      data.reminders.push({
        label: " +2 au premier tour ", source: "Trait — Sur ses gardes", score: 2
      }, {
        label: "rappel seul"
      }, {
        source: "sans texte", score: 3
      }, {
        label: "trop", score: 11
      }, {
        label: "malus", score: -1
      })
    })
    expect(initiativeRemindersFor(args, {
      hooks
    })).toEqual({
      lines: [
        {
          label: "+2 au premier tour", source: "Trait — Sur ses gardes", score: 2
        },
        {
          label: "rappel seul", source: "", score: 0
        },
        {
          label: "trop", source: "", score: 0
        },
        {
          label: "malus", source: "", score: -1
        },
      ], score: 1
    })
    expect(seen).toEqual([INITIATIVE_REMINDERS_HOOK])
    expect(INITIATIVE_REMINDERS_HOOK).toBe("sr5.initiativeReminders")
    expect(got.actor).toBe(actor)
    expect(got.combatant).toBe(args.combatant)
    expect(got.combat).toBe(args.combat)
    expect(got).toMatchObject({
      round: 1, firstRound: true, pass: 1, roll: 14
    })
    // From the second Combat Turn, this module says nothing
    expect(initiativeRemindersFor({
      ...args, round: 2
    }, {
      hooks
    })).toEqual({
      lines: [], score: 0
    })
  })
  it("keeps ten lines at most, and none when a subscriber throws or replaces the list", () => {
    const many = subscribers(data => {
      for (let i = 0; i < 15; i++) data.reminders.push({
        label: `ligne ${i}`, score: 1
      })
    })
    expect(initiativeRemindersFor(args, many)).toMatchObject({
      score: MAX_REMINDERS
    })
    expect(initiativeRemindersFor(args, {
      hooks: subscribers(throwing).hooks
    })).toEqual({
      lines: [], score: 0
    })
    expect(initiativeRemindersFor(args, subscribers(data => (data.reminders = "x")))).toEqual({
      lines: [], score: 0
    })
  })
  it("writes the card's line", () => {
    expect(initiativeCardLine({
      source: "Trait — Sur ses gardes", label: "premier tour", score: 2
    }, " : ")).toBe("Trait — Sur ses gardes : premier tour (+2)")
    expect(initiativeCardLine({
      label: "rappel seul", score: 0
    })).toBe("rappel seul")
  })
})

// Relecture du 21/10, D1: Foundry's callAll catches a subscriber's error and keeps what it wrote. The system calls each
// subscriber itself: one that writes its answer, then throws, has it thrown away.
describe("a subscriber that writes, then throws", () => {
  const writesThenThrows = write => data => {
    write(data)
    throw new Error("module")
  }
  const args = {
    vendor: {
      name: "Vendeur"
    }, buyer: {
      name: "Acheteuse"
    }, price: 1000, total: 5000, balance: 1000
  }

  it("would be kept by Foundry's callAll: the fake is Foundry's", () => {
    const hooks = foundryHooks({
      [PURCHASE_FUNDS_HOOK]: writesThenThrows(data => (data.allow = true))
    })
    const data = {
      allow: false
    }
    expect(() => hooks.callAll(PURCHASE_FUNDS_HOOK, data)).not.toThrow()
    expect(data.allow).toBe(true)
    expect(hooks.errors).toHaveLength(1)
  })
  it("leaves the book on every hook", () => {
    const {
      hooks
    } = subscribers(writesThenThrows(data => {
      data.allow = true
      data.warning = "à crédit"
      data.flags.module = {
        debt: 4000
      }
      data.price = 1
      data.notes?.push?.("soldé")
      data.refuse = true
      data.reason = "non"
      data.reminders?.push?.({
        label: "ligne", dice: 2, score: 3
      })
    }))
    expect(purchaseFundsVerdict(args, {
      hooks
    })).toEqual({
      allow: false, flags: {
      }, warning: ""
    })
    expect(vendorPriceFor(args, {
      hooks
    })).toEqual({
      price: 1000, notes: []
    })
    expect(vendorRefusalFor(args, {
      hooks
    })).toEqual({
      refuse: false, reason: ""
    })
    expect(rollRemindersFor(args.buyer, {
    }, {
      hooks
    })).toEqual([])
    expect(initiativeRemindersFor({
      round: 1
    }, {
      hooks
    })).toEqual({
      lines: [], score: 0
    })
  })
  it("keeps the answers of the others, in order", () => {
    const {
      hooks
    } = subscribers(data => (data.price = 900), writesThenThrows(data => (data.price = 1)), data => (data.price += 50))
    expect(vendorPriceFor(args, {
      hooks
    }).price).toBe(950)
    const reminders = subscribers(data => data.reminders.push({
      label: "gardée"
    }), writesThenThrows(data => data.reminders.push({
      label: "jetée"
    }))).hooks
    expect(rollRemindersFor(args.buyer, {
    }, {
      hooks: reminders
    }).map(line => line.label)).toEqual(["gardée"])
  })
  it("calls a `once` subscriber once, and keeps the book when its answer cannot be copied back", () => {
    const hooks = foundryHooks()
    hooks.once(VENDOR_PRICE_HOOK, data => (data.price = 800))
    expect(vendorPriceFor(args, {
      hooks
    }).price).toBe(800)
    expect(vendorPriceFor(args, {
      hooks
    }).price).toBe(1000)
    // An answer that cannot be copied (a function and a loop in a line), then a subscriber that throws: the book
    const data = {
      reminders: []
    }
    const line = {
      label: "x", fn: () => 1
    }
    line.self = line
    const odd = foundryHooks({
      [ROLL_REMINDERS_HOOK]: [d => d.reminders.push(line), writesThenThrows(d => (d.reminders = "x"))]
    })
    expect(callSubscribers(ROLL_REMINDERS_HOOK, data, ["reminders"], odd)).toBe(false)
  })
  it("is never asked of Hooks.callAll", () => {
    const hooksFile = readFileSync(new URL("../modules/system/house-rule-hooks.js", import.meta.url), "utf8")
    expect(hooksFile).not.toMatch(/Hooks(\?)?\.callAll\(/)
  })
})

describe("the system calls the hooks where the book is counted", () => {
  const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

  it("the vendor's till asks the price of both kinds of line, and the funds before refusing", () => {
    const till = source("modules/interface/shop-vendor.js")
    expect(till.match(/vendorPriceFor\(\{/g)).toHaveLength(2)
    expect(till).toMatch(/purchaseFundsVerdict\(\{[\s\S]{0,120}vendor: actor, storage/)
    expect(till).toMatch(/flags: \{\s*\.\.\.fundsFlags,\s*sr5: \{/)
  })
  it("the vendor's cart shows the price the till takes", () => {
    expect(source("modules/interface/shop-window.js")).toMatch(/vendorSource\) unit = vendorPriceFor\(/)
  })
  it("the vendor's shelves show the price asked, the book's struck through", () => {
    const window = source("modules/interface/shop-window.js")
    expect(window).toMatch(/\.\.\.described,\s*\/\/[^\n]*\n\s*\.\.\.SR5ShopWindow\.#askedOnShelf\(/)
    expect(window).toMatch(/return shelfPrice\(book, asked\)/)
    expect(source("templates/interface/shop-window.hbs")).toMatch(/<s class="sr-shop-price-book"[^>]*>\{\{this\.bookPrice\}\}<\/s>/)
  })
  it("the vendor's window and till ask the refusal, never in equip mode", () => {
    const window = source("modules/interface/shop-window.js")
    expect(window).toMatch(/vendorSource && buyer && !equip \? vendorRefusalFor\(/)
    expect(window).toMatch(/canCheckout = buyer !== null && cart\.length > 0 && !refusal\?\.refuse/)
    const till = source("modules/interface/shop-vendor.js")
    expect(till).toMatch(/const refusal = equip \? null : vendorRefusalFor\(\{\s*vendor: actor, storage, buyer/)
    expect(till.indexOf("vendorRefusalFor({")).toBeLessThan(till.indexOf("const lines = Array.isArray(request.lines)"))
  })
  it("the Initiative roll asks the reminders, adds their score and writes them on its card", () => {
    const combat = source("modules/system/srcombat.js")
    expect(combat).toMatch(/const reminders = initiativeRemindersFor\(\{/)
    expect(combat).toMatch(/initiative = Math\.max\(0, initiative \+ reminders\.score\)/)
    expect(combat.indexOf("initiativeRemindersFor({")).toBeLessThan(combat.indexOf("combatInitiativePass > 1"))
    expect(source("templates/rolls/roll-init.hbs")).toMatch(/\{\{#each reminders\}\}/)
  })
  it("the world's shop asks the funds before refusing", () => {
    const shop = source("modules/interface/shop.js")
    expect(shop).toMatch(/total > balance \? purchaseFundsVerdict\(/)
    expect(shop).toMatch(/flags: \{\s*\.\.\.funds\.flags,\s*sr5: \{/)
  })
  it("the buyer confirms the warning before paying, at the world's shop and before a vendor's request leaves", () => {
    const shop = source("modules/interface/shop.js")
    expect(shop.indexOf("confirmFundsWarning(funds.warning)")).toBeGreaterThan(shop.indexOf("if (!funds.allow)"))
    expect(shop.indexOf("confirmFundsWarning(funds.warning)")).toBeLessThan(shop.indexOf("const payload = []"))
    const window = source("modules/interface/shop-window.js")
    const checkout = window.indexOf("static async #onCheckoutCart()")
    const warned = window.indexOf("confirmFundsWarning(verdict.warning)", checkout)
    expect(warned).toBeGreaterThan(checkout)
    expect(warned).toBeLessThan(window.indexOf("SR5ShopVendor.purchase({", checkout))
    // The vendor's till, on the gamemaster's browser, never asks it
    expect(source("modules/interface/shop-vendor.js")).not.toMatch(/confirmFundsWarning/)
  })
  it("the roll dialog asks the reminders, shows them and the card writes them", () => {
    const test = source("modules/rolls/roll-test.js")
    expect(test).toMatch(/dialogData\.reminders = rollRemindersFor\(actor, dialogData\)/)
    expect(test).toMatch(/escapeHTML\(reminderCardLine\(reminder, colon\)\)/)
    expect(source("modules/rolls/roll-dialog.js")).toMatch(/\.SR-ReminderBox/)
    expect(source("templates/rolls/roll-dialog.hbs")).toMatch(/rollDialogPartial\/reminders\.hbs/)
    expect(source("modules/templates.js")).toMatch(/rollDialogPartial\/reminders\.hbs/)
  })
})
