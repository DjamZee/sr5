import {
  describe, it, expect
} from "vitest"
import {
  lineWaits, expressTerms, expressCost, orderHours, dueTime, freshlyDue
} from "../modules/interface/shop-orders.js"

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
