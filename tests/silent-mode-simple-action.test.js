import {
  describe, it, expect, vi, afterEach
} from 'vitest'

// SR5 p. 236: switching to or from silent mode is a simple action (ruling of DjamZ, 2026-10-07, Q7). The sheet's
// checkbox counted a free action. Out of combat, changeActionInCombat finds no combatant and counts nothing.

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
  SR5Combat
} from '../modules/system/srcombat.js'
import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'

function sheetFor(actor){
  const sheet = Object.create(ActorSheetSR5.prototype)
  Object.defineProperty(sheet, 'actor', {
    get: () => actor
  })
  return sheet
}

const counter = (n) => ({
  value: n, current: n
})

afterEach(() => vi.restoreAllMocks())

describe('silent mode checkbox (SR5 p. 236)', () => {
  it('spends one simple action, not a free one', () => {
    const spy = vi.spyOn(SR5Combat, 'changeActionInCombat').mockResolvedValue()
    sheetFor({
      id: 'a1', isToken: false
    })._onChangeSilentMode()
    expect(spy).toHaveBeenCalledWith('a1', [{
      type: 'simple', value: 1, source: 'changeSilentMode'
    }])
  })

  it('counts on the token actor of an unlinked token', () => {
    const spy = vi.spyOn(SR5Combat, 'changeActionInCombat').mockResolvedValue()
    sheetFor({
      id: 'a1', isToken: true, token: {
        id: 't1'
      }
    })._onChangeSilentMode()
    expect(spy.mock.calls[0][0]).toBe('t1')
  })

  it('lowers the simple counter by 1 and leaves the free action', () => {
    const counters = {
      free: counter(1), simple: counter(2), complex: counter(1)
    }
    SR5_MiscellaneousHelpers.spendActions(counters, [{
      type: 'simple', value: 1, source: 'changeSilentMode'
    }])
    expect(counters.simple.current).toBe(1)
    expect(counters.free.current).toBe(1)
  })
})
