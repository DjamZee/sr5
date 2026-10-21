import {
  describe, it, expect
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  ROLL_REMINDERS_HOOK, VENDOR_PRICE_HOOK, PURCHASE_FUNDS_HOOK, MAX_REMINDERS,
  rollRemindersFor, vendorPriceFor, purchaseFundsVerdict, reminderModifierType, reminderCardLine
} from "../modules/system/house-rule-hooks.js"

// Câblage Maison, lot 2 (21/10): three hooks for a module of house rules, on the pattern of sr5.essenceCostFor. The
// system plays the book; a subscriber changes it in a module; a bad answer or a subscriber that throws leaves the book.

/** A `call` that runs these subscribers, as Hooks.callAll would, and records the hooks called */
function subscribers(...fns) {
  const seen = []
  const call = (hook, data) => {
    seen.push(hook)
    for (const fn of fns) fn(data)
  }
  return {
    call, seen
  }
}
const none = () => true
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
      call: none
    })).toEqual([])
  })
  it("gives the actor, a copy of the test, and keeps the lines cleaned, unticked", () => {
    let got
    const {
      call, seen
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
      call
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
      call: throwing
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
      call: none
    })).toEqual({
      price: 1000, notes: []
    })
  })
  it("gives the vendor, its shop, the buyer, a copy of the line, the unit price and the quantity", () => {
    let got
    const {
      call, seen
    } = subscribers(data => {
      got = data
      data.item.system.price.value = 0
      data.price = data.price * 0.9
      data.notes.push("dont réputation de faction : −100 ¥", 12, "")
    })
    expect(vendorPriceFor(args, {
      call
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
      call: throwing
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
      call: none
    })).toEqual({
      allow: false, flags: {
      }
    })
  })
  it("gives the buyer, the total, the balance and the shortfall; lets it go on allow === true", () => {
    let got
    const {
      call, seen
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
      call
    })).toEqual({
      allow: true, flags: {
        "cablage-maison-sr5": {
          debt: {
            creditorId: "c1", rate: 10
          }
        }
      }
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
      call: throwing
    }).allow).toBe(false)
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
  it("the world's shop asks the funds before refusing", () => {
    const shop = source("modules/interface/shop.js")
    expect(shop).toMatch(/total > balance \? purchaseFundsVerdict\(/)
    expect(shop).toMatch(/flags: \{\s*\.\.\.funds\.flags,\s*sr5: \{/)
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
