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
import {
  registerCommcodeHooks
} from '../modules/interface/commcode-traffic.js'

import {
  SETTINGS_TABS, SETTINGS_TAGS, SETTINGS_CATALOG, MENU_CATALOG, SETTINGS_WINDOW_MENU,
  captureSystemSettings, capturedSettingIds, capturedMenus, catalogEntry
} from '../modules/system/settings-catalog.js'
import {
  worldPresetKeys, WORLD_PRESET_EXCLUDED, WORLD_PRESET_HIDDEN_KEYS
} from '../modules/system/world-preset-file.js'

const SNAPSHOT =new URL('./fixtures/settings-before-b10.json', import.meta.url)

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
  // The "+" of the compendium settings is a list of packs (lot 9)
  globalThis.foundry.data.fields ??= {
  }
  globalThis.foundry.data.fields.SetField ??= class SetField {
    constructor(element) {
      this.element = element
    }
  }
  globalThis.foundry.data.fields.StringField ??= class StringField {
    constructor(options) {
      Object.assign(this, options)
    }
  }
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
    // The commcode registers its settings in a hook "init" (the key cipher is a visible one), and its key
    globalThis.CONST ??= {
    }
    globalThis.CONST.KEYBINDING_PRECEDENCE ??= {
      NORMAL: 0
    }
    const hooks = globalThis.Hooks
    globalThis.Hooks = {
      ...hooks, on: () => {}, once: (name, fn) => name === 'init' && fn()
    }
    try {
      registerCommcodeHooks()
    } finally {
      globalThis.Hooks = hooks
    }
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

  it('gives every visible setting and every submenu its tab (none left in "other")', () => {
    const tabs = new Set(SETTINGS_TABS.map(t => t.id))
    for (const data of registered.settings.values()) {
      if (!data.config) continue
      const {
        tab, tag
      } = catalogEntry(data.key)
      expect(tab, `${data.id}: add it to SETTINGS_CATALOG (modules/system/settings-catalog.js)`).not.toBe('other')
      expect(tabs.has(tab), data.id).toBe(true)
      if (tag) expect(Object.keys(SETTINGS_TAGS), data.id).toContain(tag)
    }
    for (const id of registered.menus.keys()) {
      expect(catalogEntry(id.slice('sr5.'.length)).tab, `${id}: add it to MENU_CATALOG`).not.toBe('other')
    }
  })

  it('shares in a preset file every visible world setting, and none of the world\'s state (pack 5, § 3)', () => {
    const shared = new Set(worldPresetKeys(registered.settings))
    for (const data of registered.settings.values()) {
      if (data.scope !== 'world' || !data.config) continue
      expect(shared.has(data.key) || Object.hasOwn(WORLD_PRESET_EXCLUDED, data.key),
        `${data.id}: share it, or add it to WORLD_PRESET_EXCLUDED (modules/system/world-preset-file.js)`).toBe(true)
    }
    for (const key of WORLD_PRESET_HIDDEN_KEYS) expect(registered.settings.get(`sr5.${key}`)?.scope, key).toBe('world')
    for (const key of ['systemMigrationVersion', 'sr5RuleLocksMigration', 'sr5RuleLocksAsk', 'sr5PresetsSaved',
      'sr5ShopBuyerFolder', 'sr5ShopExcludedPacks', 'sr5ShopCreationMode', 'sr5SpiritLedger', 'sr5CalendarEvents',
      'compendium.creaturePowers', 'sr5ShopBannerFolder']) expect(shared.has(key), key).toBe(false)
  })

  it('shows the tabs in DjamZ\'s order, with the settings he moved (09/10)', () => {
    // The presets head the window (lot 10, decision of 09/10)
    expect(SETTINGS_TABS.map(t => t.id)).toEqual([
      'presets', 'interface', 'combat', 'magic', 'matrix', 'rigging', 'panCrown', 'vision', 'body', 'gear', 'shop',
      'time', 'gm', 'other'
    ])
    expect(catalogEntry('sr5BBUnderFireRules').tab).toBe('combat')
    expect(catalogEntry('sr5BBAdvancedMedkits').tab).toBe('combat')
    expect(catalogEntry('sr5FlightSkill').tab).toBe('body')
  })

  it('lists in the catalog only settings that are registered and visible', () => {
    for (const key of Object.keys(SETTINGS_CATALOG)) {
      expect(registered.settings.get(`sr5.${key}`)?.config, key).toBe(true)
    }
    for (const key of Object.keys(MENU_CATALOG)) expect(registered.menus.has(`sr5.${key}`), key).toBe(true)
  })

  it('takes the visible settings and the submenus out of the general list, values untouched', () => {
    const fresh = registerAll()
    fresh.menus.set(`sr5.${SETTINGS_WINDOW_MENU}`, {
      key: `sr5.${SETTINGS_WINDOW_MENU}`, namespace: 'sr5'
    })
    fresh.settings.set('other.visible', {
      id: 'other.visible', key: 'visible', namespace: 'other', config: true
    })
    const visible = [...fresh.settings.values()].filter(s => s.namespace === 'sr5' && s.config).map(s => s.id)
    const before = new Map([...fresh.settings].map(([id, s]) => [id, describeSetting(s)]))

    captureSystemSettings(fresh)

    expect(capturedSettingIds()).toEqual(expect.arrayContaining(visible))
    for (const [id, data] of fresh.settings) {
      const {
        config, ...kept
      } = describeSetting(data)
      const {
        config: wasConfig, ...wasKept
      } = before.get(id)
      expect(kept, id).toEqual(wasKept)
      // Only the system's visible settings leave the list; another package's stay where they are
      expect(config, id).toBe(data.namespace === 'sr5' ? false : wasConfig)
    }
    // Foundry's list keeps the window's button alone
    expect([...fresh.menus.keys()]).toEqual([`sr5.${SETTINGS_WINDOW_MENU}`])
    expect([...capturedMenus().keys()].sort()).toEqual(['sr5.sr5ConTrackerMenu', 'sr5.sr5FactionsMenu', 'sr5.sr5NegotiationRepairMenu', 'sr5.sr5PresetsMenu', 'sr5.sr5RuleLocksMenu', 'sr5.sr5ShopConfigMenu', 'sr5.sr5TokenDefaultsMenu'])
  })
})

describe('settings window: the default it recalls', () => {
  let defaultLabel

  beforeAll(async () => {
    globalThis.foundry.applications.settings ??= {
      SettingsConfig: class {}
    }
    defaultLabel = (await import('../modules/interface/settings-window.js')).SR5SettingsConfig.defaultLabel
  })

  it('says checked or unchecked, the label of a choice, the value, or empty', () => {
    expect(defaultLabel({
      default: true
    })).toBe('SR5.SETTINGS_Default_On')
    expect(defaultLabel({
      default: false
    })).toBe('SR5.SETTINGS_Default_Off')
    expect(defaultLabel({
      default: 'SR5', choices: {
        SR5: 'SR5.SETTINGS.Sr5Style'
      }
    })).toBe('SR5.SETTINGS.Sr5Style')
    expect(defaultLabel({
      default: 30
    })).toBe('30')
    expect(defaultLabel({
      default: ''
    })).toBe('SR5.SETTINGS_Default_Empty')
    expect(defaultLabel({
      default: {
        a: 1
      }
    })).toBeNull()
  })
})
