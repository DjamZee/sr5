import {
  describe, it, expect, vi, afterEach
} from 'vitest'
import {
  readFileSync
} from "node:fs"

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5Item
} from '../modules/entities/items/entityItem.js'
import {
  SR5_UtilityItem
} from '../modules/entities/items/utilityItem.js'

Object.getPrototypeOf(SR5Item.prototype).prepareData ??= () => {}
afterEach(() => vi.restoreAllMocks())

// A gear rolled on its rating (canRollTest), with an item effect on its own test
const gear = (effect) => ({
  type: 'itemGear', name: 'Gadget', system: {
    itemRating: 3, deviceRating: 3, wirelessTurnedOn: true, isAccessory: false, canRollTest: true,
    systemEffects: [], itemEffects: [{
      name: 'Bonus', target: 'system.test', multiplier: 1, cumulative: true, ...effect
    }],
    test: {
      base: 0, dicePool: 0, modifiers: [], type: ""
    },
    price: {
      base: 0, modifiers: []
    }, availability: {
      base: 0, modifiers: []
    }, concealability: {
      base: 0, modifiers: []
    }, capacityTaken: {
      base: 0, modifiers: []
    },
    conditionMonitors: {
      matrix: {
        base: 0, value: 0, modifiers: [], actual: {
          base: 0, value: 0, modifiers: []
        }
      }
    },
  }
})

function prepare(item) {
  for (const f of ['_handleItemCapacity', '_handleItemPrice', '_handleItemAvailability', '_handleItemConcealment']) {
    vi.spyOn(SR5_UtilityItem, f).mockImplementation(() => {})
  }
  SR5Item.prototype.prepareData.call(item)
  return item
}

// A gadget of rating 3 with an effect of +2 rolled 3 dice on its own test (Gaspard): a gear had no item effect
// target but its matrix monitor, where a weapon has its dice pool
describe("gear item effect on its own test", () => {
  const template = readFileSync(new URL("../templates/items/_partial/effect/itemEffect.hbs", import.meta.url), "utf8")

  it("is offered on a gear sheet", () => {
    const option = template.indexOf(`<option value="system.test">`)
    expect(option).toBeGreaterThan(-1)
    expect(template.lastIndexOf(`{{#if (eq ../document.type 'itemGear')}}`, option)).toBeGreaterThan(-1)
  })

  it("adds its value to the gear's dice pool", () => {
    const item = prepare(gear({
      type: 'value', value: 2
    }))
    expect(item.system.test.dicePool).toBe(5)
  })

  it("adds the rating when it is of type rating", () => {
    const item = prepare(gear({
      type: 'rating'
    }))
    expect(item.system.test.dicePool).toBe(6)
  })

  it("is lost with the wireless off when it asks for it", () => {
    const item = gear({
      type: 'value', value: 2, wifi: true
    })
    item.system.wirelessTurnedOn = false
    expect(prepare(item).system.test.dicePool).toBe(3)
  })
})
