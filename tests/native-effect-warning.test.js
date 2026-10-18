import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// Foundry's own active effects are ignored by the system (decision of DjamZ, 19/10): the user who writes one with
// changes is warned once; the system's status effects (no changes) never warn.

const {
  onCreateNativeEffect, onUpdateNativeEffect, hasNativeChanges
} = await import('../modules/system/native-effect-warning.js')

let n = 0
const effect = (changes = [], extra = {
}) => ({
  uuid: `Actor.a.ActiveEffect.e${++n}`, changes, ...extra
})
const change = [{
  key: 'system.attributes.body.augmented.value', mode: 2, value: '2'
}]

beforeEach(() => {
  globalThis.game = {
    user: {
      id: 'me'
    }, i18n: {
      localize: (k) => k
    }
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn()
    }
  }
})

describe('native active effect warning', () => {
  it('warns when an effect is created with changes', () => {
    expect(onCreateNativeEffect(effect(change), {
    }, 'me')).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.NativeEffectIgnored', expect.anything())
  })

  it('stays quiet for a system status effect, which has no changes', () => {
    const prone = effect([], {
      statuses: new Set(['prone'])
    })
    expect(onCreateNativeEffect(prone, {
    }, 'me')).toBe(false)
    expect(onUpdateNativeEffect(prone, {
      disabled: true
    }, {
    }, 'me')).toBe(false)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('stays quiet on the other clients', () => {
    expect(onCreateNativeEffect(effect(change), {
    }, 'someoneElse')).toBe(false)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('warns when an update writes changes, once per effect', () => {
    const e = effect(change)
    expect(onUpdateNativeEffect(e, {
      changes: change
    }, {
    }, 'me')).toBe(true)
    expect(onUpdateNativeEffect(e, {
      changes: change
    }, {
    }, 'me')).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledTimes(1)
  })

  it('does not warn on an update that leaves the changes alone (rename, toggle)', () => {
    expect(onUpdateNativeEffect(effect(change), {
      name: 'x'
    }, {
    }, 'me')).toBe(false)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
  })

  it('does not warn when an update empties the changes', () => {
    expect(onUpdateNativeEffect(effect([]), {
      changes: []
    }, {
    }, 'me')).toBe(false)
  })

  it('reads changes only from a real array', () => {
    expect(hasNativeChanges(undefined)).toBe(false)
    expect(hasNativeChanges({
      changes: []
    })).toBe(false)
    expect(hasNativeChanges({
      changes: change
    })).toBe(true)
  })
})
