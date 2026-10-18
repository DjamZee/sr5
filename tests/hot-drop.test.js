import {
  describe, it, expect
} from "vitest"
import {
  hotDropGear, hotDropSpend, HOT_DROP_EFFECT, HOT_DROP_DISTANCES, HOT_DROP_USES
} from "../modules/system/hot-drop.js"

// Vulcan Systems « Hot-Drop » (Street Lethal p. 57-59): 50 m up, 75 m in an arc, 100 m down; 20 uses a tank.

const jetpack = (props = {
}) => ({
  name: "Hot-Drop", type: "itemGear", system: {
    isActive: true, charge: 20, systemEffects: [{
      category: "specialCase", value: HOT_DROP_EFFECT
    }], ...props
  }
})

describe("Hot-Drop jetpack (Street Lethal p. 57-59)", () => {
  it("keeps the book's distances and tank", () => {
    expect(HOT_DROP_DISTANCES).toEqual({
      up: 50, arc: 75, down: 100
    })
    expect(HOT_DROP_USES).toBe(20)
  })

  it("finds the active gear carrying the effect, and nothing else", () => {
    const gear = jetpack()
    expect(hotDropGear([{
      type: "itemGear", system: {
        systemEffects: []
      }
    }, gear])).toBe(gear)
    expect(hotDropGear([jetpack({
      isActive: false
    })])).toBeNull()
    expect(hotDropGear([{
      ...jetpack(), type: "itemVehicle"
    }])).toBeNull()
    expect(hotDropGear(undefined)).toBeNull()
  })

  it("spends one use a jump", () => {
    expect(hotDropSpend(20)).toEqual({
      charge: 19, empty: false
    })
    expect(hotDropSpend(1)).toEqual({
      charge: 0, empty: false
    })
  })

  it("never blocks on an empty tank: it only says so", () => {
    expect(hotDropSpend(0)).toEqual({
      charge: 0, empty: true
    })
    expect(hotDropSpend(undefined)).toEqual({
      charge: 0, empty: true
    })
  })
})
