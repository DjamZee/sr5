import {
  describe, it, expect, vi, afterEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
})

import {
  ActorSheetSR5
} from '../modules/entities/actors/baseSheet.js'
import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'

// SR5 p. 171: a character knocked out by a full monitor wakes up once the GM clears boxes by hand.
// The rule itself (never a dead character, never a knockout set by the GM) is clearDamageKnockout's,
// tested in condition-monitor-overflow.test.js: here, the sheet must call it, after the update is saved.
function sheetWithActor(){
  const order = []
  const actor = {
    system: {
      conditionMonitors: {
        physical: {
          value: 10, actual: {
            base: 3, value: 3
          }
        },
        stun: {
          value: 10, actual: {
            base: 10, value: 10
          }
        },
      }
    },
    update: vi.fn(async () => {
      await Promise.resolve()
      order.push('update')
    }),
  }
  actor.toJSON = () => JSON.parse(JSON.stringify({
    system: actor.system
  }))
  const knockout = vi.spyOn(SR5_ActorHelper, 'clearDamageKnockout').mockImplementation(async (a) => {
    order.push(a === actor ? 'clear' : 'clear-wrong-actor')
  })

  let onBoxClick, onMonitorReset
  const element = {
    classList: {
      toggle(){}
    },
    querySelector: () => null,
    querySelectorAll: (sel) => {
      if (sel === '.boxes:not(.box-disabled)') return [{
        addEventListener: (evt, fn) => {
          if (evt === 'click') onBoxClick = fn
        }
      }]
      if (sel === '.monitorReset') return [{
        addEventListener: (evt, fn) => {
          if (evt === 'mousedown') onMonitorReset = fn
        }
      }]
      return []
    },
  }
  globalThis.document ??= {
    addEventListener(){}, querySelectorAll: () => []
  }
  const sheet = Object.create(ActorSheetSR5.prototype)
  for (const [key, value] of Object.entries({
    actor, element, isEditable: true, isEditMode: false, isPlayMode: true, tabGroups: {
    },
    _updateScrollFades(){}
  })) Object.defineProperty(sheet, key, {
    value
  })
  sheet._onRender({
  }, {
  })
  return {
    actor, order, knockout,
    click: (index, monitor = 'stun') => onBoxClick({
      currentTarget: {
        dataset: {
          index: String(index)
        },
        closest: () => ({
          dataset: {
            target: `system.conditionMonitors.${monitor}.actual.base`
          }
        }),
      }
    }),
    press: (monitor, which, button) => onMonitorReset({
      preventDefault(){}, which, button, currentTarget: {
        dataset: {
          target: monitor
        }
      }
    }),
  }
}

describe('clearing damage boxes on the sheet wakes up a knocked out character (SR5 p. 171)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('a box click saves the monitor, then wakes up', async () => {
    const {
      actor, order, click
    } = sheetWithActor()
    await click(9)
    expect(actor.update.mock.calls[0][0].system.conditionMonitors.stun.actual.base).toBe(9)
    expect(order).toEqual(['update', 'clear'])
  })

  it('a right-click reset of a monitor saves it, then wakes up', async () => {
    const {
      actor, order, press
    } = sheetWithActor()
    await press('stun', 3, 2)
    expect(actor.update.mock.calls[0][0].system.conditionMonitors.stun.actual.base).toBe(0)
    expect(order).toEqual(['update', 'clear'])
  })

  it('a left-click on the monitor name (healing test) does not touch the knockout', async () => {
    const {
      actor, knockout, press
    } = sheetWithActor()
    actor.rollTest = vi.fn()
    await press('stun', 1, 0)
    expect(actor.rollTest).toHaveBeenCalledWith('healing', 'stun')
    expect(knockout).not.toHaveBeenCalled()
  })
})
