import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// Lots d'augmentations (Chrome Flesh p. 96): « La capacité sans fil d'un lot ne peut pas être coupée. »

const emits = []
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async (type, data) => {
      emits.push([type, data])
    }
  },
}))

const {
  bundleWirelessRefused, AUGMENTATION_BUNDLE_SETTING
} = await import('../modules/system/implant-essence.js')
const {
  presetLocks, resetWhispers
} = await import('../modules/system/rule-locks.js')

let settings
// Waits for the dynamic imports the code under test starts (not a fixed delay, which a loaded machine can outlast)
const flush = async () => {
  await vi.dynamicImportSettled()
  await new Promise(resolve => setTimeout(resolve, 0))
}
const implant = (bundle = true) => ({
  type: 'itemAugmentation', name: 'Réflexes câblés', system: {
    augmentationBundle: bundle
  }
})
const actor = {
  id: 'a1', name: 'Essai', items: []
}

beforeEach(() => {
  resetWhispers()
  emits.length = 0
  settings = {
    sr5RuleLocksMigration: 2, sr5RuleLocks: presetLocks('book'), [AUGMENTATION_BUNDLE_SETTING]: true,
  }
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
  globalThis.game.user = {
    id: 'p1', isGM: false, name: 'Joueuse'
  }
  globalThis.game.users = {
    activeGM: {
      id: 'gm'
    }
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.game.users
})

describe('the wireless of an augmentation bundle (Chrome Flesh p. 96)', () => {
  it('switching it off is refused', () => {
    expect(bundleWirelessRefused(implant(), actor, false)).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_BundleWirelessOn')
  })
  it('switching it on is never refused', () => {
    expect(bundleWirelessRefused(implant(), actor, true)).toBe(false)
  })
  it('an implant outside a lot is free', () => {
    expect(bundleWirelessRefused(implant(false), actor, false)).toBe(false)
    expect(bundleWirelessRefused({
      type: 'itemGear', system: {
        augmentationBundle: true
      }
    }, actor, false)).toBe(false)
  })
  it('the optional rule off: nothing is refused', () => {
    settings[AUGMENTATION_BUNDLE_SETTING] = false
    expect(bundleWirelessRefused(implant(), actor, false)).toBe(false)
  })
  it('the "body" family lifted: the switch goes, the gamemaster hears of it', async () => {
    settings.sr5RuleLocks = {
      ...presetLocks('book'), body: false
    }
    expect(bundleWirelessRefused(implant(), actor, false)).toBe(false)
    await flush()
    expect(emits.filter(([, d]) => d.family === 'body').map(([, d]) => d.key)).toEqual(['SR5.WARN_BundleWirelessOn'])
  })
})
