import {
  describe, it, expect
} from "vitest"
import {
  lineWaits, expressTerms, expressCost, orderHours, dueTime, freshlyDue, cardExpressExtra,
  bindOrderClicks, cancelPlan, testedHours
} from "../modules/interface/shop-orders.js"

const fakeElement = () => {
  const listeners = []
  return {
    listeners, addEventListener: (type, fn) => listeners.push([type, fn])
  }
}

describe("the On order buttons of the sheet (Quitterie's review)", () => {
  it("are bound once per element, so a render does not stack listeners", () => {
    const element = fakeElement()
    expect(bindOrderClicks(element, () => {})).toBe(true)
    expect(bindOrderClicks(element, () => {})).toBe(false)
    expect(element.listeners).toHaveLength(1)
  })
  it("are bound again on the new element of a sheet closed and opened again", () => {
    const first = fakeElement(), second = fakeElement()
    bindOrderClicks(first, () => {})
    expect(bindOrderClicks(second, () => {})).toBe(true)
    expect(second.listeners).toHaveLength(1)
  })
  it("hand the clicked button to the handler", () => {
    const element = fakeElement()
    const seen = []
    bindOrderClicks(element, (event, target) => seen.push(target.id))
    const button = {
      id: "cancel"
    }
    element.listeners[0][1]({
      target: {
        closest: () => button
      }
    })
    element.listeners[0][1]({
      target: {
        closest: () => null
      }
    })
    expect(seen).toEqual(["cancel"])
  })
})

describe("cancelling an order follows the GM's ledger (Quitterie's review)", () => {
  const forged = {
    paid: 5000000, vendor: {
      uuid: "Actor.vendor", storageId: "s"
    }
  }
  it("a forged order missing from the ledger never touches a vendor", () => {
    expect(cancelPlan(forged, undefined, 1000)).toEqual({
      refund: 5000000, vendorUuid: null, fromCashbox: 0, fromAccounts: 0
    })
  })
  it("the ledger's amount wins over the flag's", () => {
    const plan = cancelPlan(forged, {
      paid: 188, vendorUuid: "Actor.vendor"
    }, 1000)
    expect(plan).toEqual({
      refund: 188, vendorUuid: "Actor.vendor", fromCashbox: 188, fromAccounts: 0
    })
  })
  it("the vendor gives back from its cashbox first, its accounts for the rest", () => {
    expect(cancelPlan({
    }, {
      paid: 1000, vendorUuid: "Actor.vendor"
    }, 300)).toMatchObject({
      fromCashbox: 300, fromAccounts: 700
    })
  })
})

describe("the search time is worked out from the test, not sent (SR5 p. 420)", () => {
  it("net hits divide the time of the table", () => {
    expect(testedHours(24, {
      obtained: true, outcome: "success", netHits: 5
    })).toBe(4.8)
  })
  it("a tie doubles it", () => {
    expect(testedHours(48, {
      obtained: true, outcome: "tie", netHits: 0
    })).toBe(96)
    expect(testedHours(48, {
      obtained: true, outcome: "tieGlitch", netHits: 0
    })).toBe(96)
  })
  it("no test, or a line not found: the time of the table", () => {
    expect(testedHours(24, null)).toBe(24)
    expect(testedHours(24, {
      obtained: false, outcome: "failure", netHits: -2
    })).toBe(24)
  })
  it("a delayHours slipped into the result is ignored", () => {
    expect(testedHours(168, {
      obtained: true, outcome: "success", netHits: 1, delayHours: 0
    })).toBe(168)
  })
})

describe("the card's total with express ticked", () => {
  const terms = expressTerms({
    enabled: true, surcharge: 25, factor: 2
  })
  const results = [
    {
      obtained: true, availability: 4, basePrice: 150
    },
    {
      obtained: true, availability: 0, basePrice: 1000
    },
    {
      obtained: false, availability: 8, basePrice: 5000
    },
    {
      obtained: true, availability: 6, basePrice: 10000
    },
  ]
  it("adds the surcharge of the lines found that wait, at their base price", () => {
    expect(cardExpressExtra(results, terms)).toBe(38 + 2500)
  })
  it("adds nothing when express is off", () => {
    expect(cardExpressExtra(results, null)).toBe(0)
  })
})

describe("which lines wait for the search time (SR5 p. 419-420)", () => {
  it("an item with an availability waits when delivery is delayed", () => {
    expect(lineWaits({
      delayed: true, availability: 4
    })).toBe(true)
  })
  it("an item without availability is bought at once", () => {
    expect(lineWaits({
      delayed: true, availability: 0
    })).toBe(false)
  })
  it("what lies on a vendor's counter is already found", () => {
    expect(lineWaits({
      delayed: true, availability: 8, onCounter: true
    })).toBe(false)
  })
  it("immediate delivery and free purchases (Equip, creation) never wait", () => {
    expect(lineWaits({
      delayed: false, availability: 8
    })).toBe(false)
    expect(lineWaits({
      delayed: true, availability: 8, free: true
    })).toBe(false)
  })
})

describe("express delivery (arbitrage de DjamZ)", () => {
  const terms = expressTerms({
    enabled: true, surcharge: 25, factor: 2
  })
  it("is nothing when the option is off", () => {
    expect(expressTerms({
      enabled: false, surcharge: 25, factor: 2
    })).toBeNull()
    expect(expressCost(1000, null)).toBe(0)
    expect(orderHours(48, null)).toBe(48)
  })
  it("costs a share of the base price and divides the time", () => {
    expect(expressCost(1000, terms)).toBe(250)
    expect(orderHours(48, terms)).toBe(24)
  })
  it("never multiplies the time nor charges a negative share", () => {
    const odd = expressTerms({
      enabled: true, surcharge: -10, factor: 0
    })
    expect(expressCost(1000, odd)).toBe(0)
    expect(orderHours(48, odd)).toBe(48)
  })
})

describe("due time on the world clock", () => {
  it("adds the hours in seconds", () => {
    expect(dueTime(1000, 6)).toBe(1000 + 6 * 3600)
    expect(dueTime(0, 0.5)).toBe(1800)
  })
  it("only the orders passed and not yet announced go on the GM's card", () => {
    const orders = [
      {
        id: "a", due: 100, notified: false
      },
      {
        id: "b", due: 100, notified: true
      },
      {
        id: "c", due: 500, notified: false
      },
    ]
    expect(freshlyDue(orders, 200).map(o => o.id)).toEqual(["a"])
    expect(freshlyDue(undefined, 200)).toEqual([])
  })
})
