import {
  describe, it, expect, vi
} from 'vitest'
import fs from 'node:fs'

// config.js writes into CONFIG at import time, and the sheets build on Foundry's classes
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
  globalThis.foundry.abstract.TypeDataModel.migrateData ??= (source) => source
})

const {
  SR5_UtilityItem
} = await import('../modules/entities/items/utilityItem.js')

// The item sheet offers a gear one item effect target, its matrix monitor; it was read only when the gear also
// carried a system effect, so a plain gear lost it
describe('gear item effects', () => {
  it('applies them without a system effect', () => {
    const ITEM = fs.readFileSync('modules/entities/items/entityItem.js', 'utf8')
    const gearCase = ITEM.match(/case "itemGear":\r?\n([\s\S]*?)break/)[1]
    expect(gearCase).toMatch(/Object\.keys\(itemData\.itemEffects\)\.length\) SR5_UtilityItem\.applyItemEffects\(item\)/)
  })

  it('adds an item effect to the matrix monitor of a gear', () => {
    const item = {
      type: 'itemGear', name: 'Gadget', system: {
        itemRating: 3, deviceRating: 3, wirelessTurnedOn: true, systemEffects: {
        }, itemEffects: {
          0: {
            name: 'Blindage', target: 'system.conditionMonitors.matrix', type: 'value', value: 2, multiplier: 1, cumulative: true
          }
        },
        conditionMonitors: {
          matrix: {
            base: 0, value: 0, modifiers: [], actual: {
              base: 0, value: 0, modifiers: []
            }
          }
        },
      }
    }
    SR5_UtilityItem.applyItemEffects(item)
    SR5_UtilityItem._handleMatrixMonitor(item)
    // SR5 p. 228: 8 + half the Device rating rounded up, then the effect
    expect(item.system.conditionMonitors.matrix.value).toBe(12)
  })
})
