import {
  describe, it, expect
} from "vitest"
import {
  WORLD_PRESET_FORMAT, WORLD_PRESET_HIDDEN_KEYS, WORLD_PRESET_EXCLUDED, SHOP_BUYER_MODES, RULE_LOCKS_SETTING,
  worldPresetKeys, checkSettingValue, buildWorldPreset, worldPresetFileName, parseWorldPreset, worldPresetChanges
} from "../modules/system/world-preset-file.js"
import {
  SETTINGS_CATALOG
} from "../modules/system/settings-catalog.js"
import {
  presetLocks, RULE_LOCK_KEYS
} from "../modules/system/rule-locks.js"
import {
  TOKEN_DEFAULTS_SETTING, TOKEN_FAMILIES
} from "../modules/system/token-defaults.js"
import {
  SR5ShopStock
} from "../modules/interface/shop-stock.js"

// A world's registry, as game.settings.settings holds it: only what the file reads
function registryOf(entries){
  const registry = new Map()
  for (const [key, data] of Object.entries(entries)) registry.set(`sr5.${key}`, {
    key, namespace: "sr5", scope: "world", ...data
  })
  return registry
}

const registry = registryOf({
  sr5FreeReload: {
    type: Boolean, default: false
  },
  sr5ReagentSystem: {
    type: String, default: "core", choices: {
      core: "a", street: "b"
    }
  },
  sr5ShopFenceBasePercent: {
    type: Number, default: 10, range: {
      min: 0, max: 100, step: 1
    }
  },
  sr5ShopDealerKeywords: {
    type: String, default: ""
  },
  // A client setting of the catalog: each player's own, never in the file
  sr5ChooseStyle: {
    type: String, default: "", scope: "client"
  },
  // Names a folder of this world
  sr5ShopBannerFolder: {
    type: String, default: ""
  },
  "compendium.creaturePowers": {
    type: String, default: "auto"
  },
  [RULE_LOCKS_SETTING]: {
    type: Object, default: presetLocks("book")
  },
  [TOKEN_DEFAULTS_SETTING]: {
    type: Object, default: {
    }
  },
  sr5ShopBuyerMode: {
    type: String, default: "owned"
  },
  // State of the world, never shared
  systemMigrationVersion: {
    type: String, default: ""
  },
  sr5PresetsSaved: {
    type: Object, default: {
    }
  },
  sr5ShopBuyerFolder: {
    type: String, default: ""
  },
})

const values = {
  sr5FreeReload: true,
  sr5ReagentSystem: "street",
  sr5ShopFenceBasePercent: 15,
  sr5ShopDealerKeywords: "fixer",
  sr5ChooseStyle: "dark",
  sr5ShopBannerFolder: "worlds/x/banners",
  "compendium.creaturePowers": "world.mine",
  [RULE_LOCKS_SETTING]: presetLocks("light"),
  [TOKEN_DEFAULTS_SETTING]: {
    spirit: {
      size: 2
    }
  },
  sr5ShopBuyerMode: "folder",
  systemMigrationVersion: "13.0.0",
  sr5PresetsSaved: {
    values: {
    }
  },
  sr5ShopBuyerFolder: "abc123",
}
const read = key => values[key]

describe("world preset file (pack 5, § 3)", () => {
  it("holds the world settings of the window and the hidden table options, nothing else", () => {
    expect(worldPresetKeys(registry).sort()).toEqual([
      RULE_LOCKS_SETTING, TOKEN_DEFAULTS_SETTING, "sr5FreeReload", "sr5ReagentSystem", "sr5ShopBuyerMode",
      "sr5ShopDealerKeywords", "sr5ShopFenceBasePercent",
    ].sort())
  })

  it("leaves out only settings of the window, and keeps hidden only settings that are not in it", () => {
    for (const key of Object.keys(WORLD_PRESET_EXCLUDED)) expect(SETTINGS_CATALOG[key], key).toBeDefined()
    for (const key of WORLD_PRESET_HIDDEN_KEYS) expect(SETTINGS_CATALOG[key], key).toBeUndefined()
    expect(SHOP_BUYER_MODES).toEqual(SR5ShopStock.BUYER_MODES)
  })

  it("writes the format, the system's version, the date and the values as they stand", () => {
    const date = new Date("2026-10-21T10:00:00Z")
    const data = buildWorldPreset({
      read, registry, systemVersion: "13.0.0-djamz.16", date
    })
    expect(data).toMatchObject({
      format: WORLD_PRESET_FORMAT, formatVersion: 1, system: "sr5", systemVersion: "13.0.0-djamz.16",
      date: "2026-10-21T10:00:00.000Z",
    })
    expect(Object.keys(data.settings).sort()).toEqual(worldPresetKeys(registry).sort())
    expect(data.settings.sr5FreeReload).toBe(true)
    expect(data.settings[RULE_LOCKS_SETTING]).toEqual(presetLocks("light"))
    expect(data.settings).not.toHaveProperty("systemMigrationVersion")
    expect(data.settings).not.toHaveProperty("sr5ShopBuyerFolder")
    // A Set (the "+" compendiums) would be written as its list, as "save my settings" does
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    expect(worldPresetFileName("My World!", date)).toBe("sr5-preset-My-World--2026-10-21.json")
  })

  it("reads back what it wrote", () => {
    const text = JSON.stringify(buildWorldPreset({
      read, registry, systemVersion: "13.0.0", date: new Date()
    }))
    const parsed = parseWorldPreset(text, registry)
    expect(parsed.error).toBeNull()
    expect(parsed.ignored).toEqual([])
    expect(parsed.invalid).toEqual([])
    expect(parsed.locks).toEqual(presetLocks("light"))
    expect(parsed.values).toMatchObject({
      sr5FreeReload: true, sr5ReagentSystem: "street", sr5ShopFenceBasePercent: 15, sr5ShopBuyerMode: "folder",
    })
    expect(parsed.values).not.toHaveProperty(RULE_LOCKS_SETTING)
    expect(parsed.values[TOKEN_DEFAULTS_SETTING].spirit).toEqual({
      size: 2
    })
  })

  it("refuses what is not a preset", () => {
    expect(parseWorldPreset("{not json", registry).error).toBe("json")
    expect(parseWorldPreset(JSON.stringify({
      settings: {
      }
    }), registry).error).toBe("format")
    expect(parseWorldPreset([], registry).error).toBe("format")
  })

  it("ignores and names the unknown keys, the world's state and the excluded settings", () => {
    const parsed = parseWorldPreset({
      format: WORLD_PRESET_FORMAT, settings: {
        sr5FreeReload: true, sr5NotASetting: 1, systemMigrationVersion: "1.0.0", sr5ShopBuyerFolder: "x",
        "compendium.creaturePowers": "world.mine", sr5ChooseStyle: "dark",
      }
    }, registry)
    expect(parsed.values).toEqual({
      sr5FreeReload: true
    })
    expect(parsed.ignored.sort()).toEqual(["compendium.creaturePowers", "sr5ChooseStyle", "sr5NotASetting",
      "sr5ShopBuyerFolder", "systemMigrationVersion"])
  })

  it("checks each value against its setting's type, choices and range", () => {
    const parsed = parseWorldPreset({
      format: WORLD_PRESET_FORMAT, settings: {
        sr5FreeReload: "yes", sr5ReagentSystem: "unknown", sr5ShopFenceBasePercent: 250, sr5ShopDealerKeywords: 3,
        sr5ShopBuyerMode: "everyone", [RULE_LOCKS_SETTING]: {
          notALock: true
        }, [TOKEN_DEFAULTS_SETTING]: "big",
      }
    }, registry)
    expect(parsed.values).toEqual({
    })
    expect(parsed.locks).toBeNull()
    expect(parsed.invalid.sort()).toEqual([RULE_LOCKS_SETTING, TOKEN_DEFAULTS_SETTING, "sr5FreeReload", "sr5ReagentSystem",
      "sr5ShopBuyerMode", "sr5ShopDealerKeywords", "sr5ShopFenceBasePercent"].sort())
    const setting = key => registry.get(`sr5.${key}`)
    expect(checkSettingValue(setting("sr5ShopFenceBasePercent"), 100)).toBe(100)
    expect(checkSettingValue(setting("sr5ShopFenceBasePercent"), Number.NaN)).toBeUndefined()
    expect(checkSettingValue(setting("sr5ReagentSystem"), "core")).toBe("core")
    expect(checkSettingValue(undefined, true)).toBeUndefined()
    // A setting typed by a data field (the "+" compendiums) is never written from a file
    expect(checkSettingValue({
      type: {
      }
    }, ["a"])).toBeUndefined()
  })

  it("cleans what it takes: rule locks completed, token defaults kept in their limits", () => {
    const parsed = parseWorldPreset({
      format: WORLD_PRESET_FORMAT, settings: {
        [RULE_LOCKS_SETTING]: {
          ammo: false
        }, [TOKEN_DEFAULTS_SETTING]: {
          spirit: {
            size: 99, disposition: "FRIENDLY", color: "red"
          }
        },
      }
    }, registry)
    expect(Object.keys(parsed.locks).sort()).toEqual([...RULE_LOCK_KEYS].sort())
    expect(parsed.locks.ammo).toBe(false)
    expect(parsed.locks.magic).toBe(true)
    expect(Object.keys(parsed.values[TOKEN_DEFAULTS_SETTING])).toEqual(TOKEN_FAMILIES)
    expect(parsed.values[TOKEN_DEFAULTS_SETTING].spirit).toEqual({
      size: 10, disposition: "FRIENDLY"
    })
  })

  it("shows only the settings that change, the rule locks among them", () => {
    const parsed = parseWorldPreset({
      format: WORLD_PRESET_FORMAT, settings: {
        sr5FreeReload: true, sr5ReagentSystem: "core", sr5ShopFenceBasePercent: 15, [RULE_LOCKS_SETTING]: presetLocks("book"),
      }
    }, registry)
    const changes = worldPresetChanges(parsed, read)
    expect(changes.map(c => c.key).sort()).toEqual([RULE_LOCKS_SETTING, "sr5ReagentSystem"].sort())
    expect(changes.find(c => c.key === "sr5ReagentSystem")).toEqual({
      key: "sr5ReagentSystem", from: "street", to: "core"
    })
  })
})
