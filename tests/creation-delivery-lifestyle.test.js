import {
  describe, it, expect, afterEach
} from "vitest"
import {
  deliveryDelayed
} from "../modules/interface/shop-orders.js"
import {
  lifestyleMetatypeFactor, lifestyleMetatypeSurcharge
} from "../modules/entities/items/lifestyle-metatype.js"

const world = (delivery) => {
  globalThis.game = {
    settings: {
      get: (_scope, key) => key === "sr5ShopDelivery" ? delivery : undefined
    }
  }
}
const inCreation = {
  flags: {
    sr5: {
      creation: {
        active: true, by: "gm"
      }
    }
  }
}
const played = {
  flags: {
  }
}

describe("purchases at creation arrive at once (DjamZ, M4, 2026-10-09)", () => {
  afterEach(() => {
    delete globalThis.game
  })
  it("a buyer in creation never waits, even in a delayed world", () => {
    world("delayed")
    expect(deliveryDelayed(inCreation)).toBe(false)
  })
  it("a buyer out of creation waits as before", () => {
    world("delayed")
    expect(deliveryDelayed(played)).toBe(true)
    expect(deliveryDelayed()).toBe(true)
  })
  it("a world without delays delivers everyone at once", () => {
    world("immediate")
    expect(deliveryDelayed(played)).toBe(false)
    expect(deliveryDelayed(inCreation)).toBe(false)
  })
})

describe("the lifestyle's metatype surcharge (SR5 p. 68, Hard Targets p. 141)", () => {
  it("dwarves pay 20 % more, trolls 100 %, the others nothing", () => {
    expect(lifestyleMetatypeFactor("dwarf")).toBe(1.2)
    expect(lifestyleMetatypeFactor("troll")).toBe(2)
    for (const metatype of ["human", "elf", "ork", "", undefined]) expect(lifestyleMetatypeFactor(metatype)).toBe(1)
  })
  it("a Medium lifestyle: 5 000 ¥ become 6 000 ¥ for a dwarf, 10 000 ¥ for a troll", () => {
    expect(lifestyleMetatypeSurcharge(5000, [], "dwarf")).toBe(1000)
    expect(lifestyleMetatypeSurcharge(5000, [], "troll")).toBe(5000)
    expect(lifestyleMetatypeSurcharge(5000, [], "ork")).toBe(0)
  })
  it("counts the options and assets, not the Outings and Services", () => {
    const options = [{
      type: "negativeOption", price: -1000
    }, {
      type: "asset", price: 500
    }, {
      type: "service", price: 800
    }, {
      type: "outing", price: 300
    }]
    expect(lifestyleMetatypeSurcharge(5000, options, "troll")).toBe(4500)
  })
  it("never goes below zero, and reads no price as zero", () => {
    expect(lifestyleMetatypeSurcharge(0, [{
      type: "negativeOption", price: -100
    }], "troll")).toBe(0)
    expect(lifestyleMetatypeSurcharge(undefined, undefined, "dwarf")).toBe(0)
  })
})
