import {
  describe, it, expect, beforeAll, afterAll
} from 'vitest'
import {
  readFileSync, writeFileSync
} from 'node:fs'
import {
  SR5_SystemHelpers
} from '../modules/system/utilitySystem.js'
import {
  SR5_CompendiumUtility
} from '../modules/entities/actors/utilityCompendium.js'
import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'
import {
  registerSheetSizeSetting
} from '../modules/interface/sheet-size.js'
import {
  registerIndirectEffectSetting
} from '../modules/system/indirect-effects.js'
import {
  initSpiritLedger
} from '../modules/system/spirit-ledger.js'
import {
  registerCalendarSettings
} from '../modules/system/calendar.js'
import {
  registerCalendarClockSettings
} from '../modules/interface/calendar-clock.js'
import {
  registerDeadlineSettings
} from '../modules/system/deadlines.js'
import {
  registerOrderSettings, registerOrderLedger
} from '../modules/interface/shop-orders.js'
import {
  registerRetryLedger
} from '../modules/interface/shop-retry.js'
import {
  registerAegisLedger
} from '../modules/system/aegis.js'
import {
  registerExtendedClockSetting
} from '../modules/system/extended-clock.js'
import {
  registerDiseaseSettings
} from '../modules/system/diseases.js'
import {
  registerHungerSettings
} from '../modules/system/hunger.js'
import {
  registerInfectionSettings
} from '../modules/system/infection.js'
import {
  registerCfdSettings
} from '../modules/system/cfd-treatment.js'
import {
  registerRadiationSettings
} from '../modules/system/radiation.js'
import {
  registerIllusionSetting
} from '../modules/system/illusion.js'
import {
  registerHealLedger
} from '../modules/system/heal-ledger.js'
import {
  registerTacnetSetting
} from '../modules/system/tacnet.js'

const SNAPSHOT = new URL('./fixtures/settings-before-b10.json', import.meta.url)

// Every registration the init hook makes (modules/hooks/init.js, sr5HookInit), against a recording game.settings
function registerAll() {
  const settings = new Map()
  const menus = new Map()
  const previous = {
    settings: globalThis.game.settings, keybindings: globalThis.game.keybindings, Hooks: globalThis.Hooks,
  }
  globalThis.game.settings = {
    ...previous.settings,
    settings,
    menus,
    get: () => undefined,
    register: (namespace, key, data) => {
      data.key = key
      data.namespace = namespace
      data.scope = ['world', 'client', 'user'].includes(data.scope) ? data.scope : 'client'
      data.id = `${namespace}.${key}`
      settings.set(data.id, data)
    },
    registerMenu: (namespace, key, data) => {
      data.key = `${namespace}.${key}`
      data.namespace = namespace
      menus.set(data.key, data)
    },
  }
  globalThis.game.keybindings = {
    register: () => {}
  }
  globalThis.Hooks ??= {
    on: () => {}, once: () => {}, callAll: () => {}
  }
  // What the calendar touches while it registers its settings
  globalThis.CONFIG.time ??= {
  }
  globalThis.game.modules ??= new Map()
  globalThis.foundry.data ??= {
  }
  globalThis.foundry.data.CalendarData ??= class {}
  try {
    SR5_SystemHelpers.registerSystemSettings()
    SR5_CompendiumUtility.registerSettings()
    registerSheetSizeSetting()
    registerIndirectEffectSetting()
    initSpiritLedger()
    registerCalendarSettings()
    registerCalendarClockSettings()
    registerDeadlineSettings()
    registerOrderSettings()
    registerOrderLedger()
    registerRetryLedger()
    registerAegisLedger()
    SR5_MiscellaneousHelpers.registerSettings()
    registerExtendedClockSetting()
    registerDiseaseSettings()
    registerHungerSettings()
    registerInfectionSettings()
    registerCfdSettings()
    registerRadiationSettings()
    registerIllusionSetting()
    registerHealLedger()
    registerTacnetSetting()
  } finally {
    globalThis.game.settings = previous.settings
    globalThis.game.keybindings = previous.keybindings
  }
  return {
    settings, menus
  }
}

const typeName = type => type?.name ?? (type === undefined ? 'undefined' : String(type))

// What a world must keep: the key, its type, its default and its scope (config is what B10 changes)
function describeSetting(data) {
  return {
    scope: data.scope,
    type: typeName(data.type),
    default: data.default === undefined ? null : data.default,
    config: data.config === true,
  }
}

describe('settings registered by the system', () => {
  let registered

  beforeAll(() => {
    registered = registerAll()
    if (process.env.SR5_WRITE_SETTINGS_SNAPSHOT) {
      const out = {
        settings: {
        }, menus: [...registered.menus.keys()].sort()
      }
      for (const id of [...registered.settings.keys()].sort()) out.settings[id] = describeSetting(registered.settings.get(id))
      writeFileSync(SNAPSHOT, `${JSON.stringify(out, null, 2)}\n`)
    }
  })

  afterAll(() => {})

  it('keeps every key registered before B10, with the same type, default and scope', () => {
    const before = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
    for (const [id, was] of Object.entries(before.settings)) {
      const now = registered.settings.get(id)
      expect(now, `${id} is no longer registered`).toBeDefined()
      const {
        config: _config, ...kept
      } = describeSetting(now)
      const {
        config: _wasConfig, ...wasKept
      } = was
      expect(kept, id).toEqual(wasKept)
    }
    for (const id of before.menus) expect(registered.menus.has(id), id).toBe(true)
  })
})
