import {
  describe, it, expect, vi, afterEach
} from 'vitest'

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

// A plain gear, without system effect, with the one item effect the sheet offers it: on its matrix monitor
const gear = () => ({
  type: 'itemGear', name: 'Gadget', system: {
    itemRating: 3, deviceRating: 3, wirelessTurnedOn: true, isAccessory: false, canRollTest: false,
    systemEffects: [], itemEffects: [{
      name: 'Blindage', target: 'system.conditionMonitors.matrix', type: 'value', value: 2, multiplier: 1, cumulative: true
    }],
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

// The item effects of a gear were read only behind a system effect: the one on the matrix monitor of a plain gear
// was lost. The real preparation runs here, its side computations stubbed
describe('gear item effects', () => {
  it('a gear without system effect applies its item effects at preparation', () => {
    const apply = vi.spyOn(SR5_UtilityItem, 'applyItemEffects')
    for (const f of ['_handleItemCapacity', '_handleItemPrice', '_handleItemAvailability', '_handleItemConcealment']) {
      vi.spyOn(SR5_UtilityItem, f).mockImplementation(() => {})
    }
    const item = gear()
    SR5Item.prototype.prepareData.call(item)
    expect(apply).toHaveBeenCalledOnce()
    // SR5 p. 228: 8 + half the Device rating rounded up, then the effect
    expect(item.system.conditionMonitors.matrix.value).toBe(12)
  })
})
