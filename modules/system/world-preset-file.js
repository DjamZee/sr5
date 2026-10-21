/**
 * A world preset as a .json file (pack 5 of DjamZ, § 3): the gamemaster exports the system's world settings, the
 * table's options and house rules, and another gamemaster imports them in his own world.
 *
 * Only the settings that say how a table plays are written: the world settings of the settings window
 * (settings-catalog.js) and the few hidden ones edited from a menu of that window (WORLD_PRESET_HIDDEN_KEYS). The
 * rest of the system's world settings are the world's own state (migration versions, the gamemaster's registers and
 * ledgers, caches) or name documents, compendiums and folders of this world, which mean nothing in another one: never
 * written, and ignored in a file that holds them.
 *
 * Importing never trusts the file: an unknown key is left out and named, a value is checked against the setting's
 * type (and its choices or its range), and the rule locks are written through setRuleLocks (settings-presets.js,
 * applySettingValues), which keeps the former settings in step.
 */
import {
  SETTINGS_CATALOG
} from "./settings-catalog.js"
import {
  plainSettingValue, sameSettingValue
} from "./settings-presets.js"
import {
  RULE_LOCK_KEYS, normalizeLocks, currentRuleLocks
} from "./rule-locks.js"
import {
  TOKEN_DEFAULTS_SETTING, cleanTokenDefaults
} from "./token-defaults.js"

export const WORLD_PRESET_FORMAT = "sr5-world-preset"
export const WORLD_PRESET_FORMAT_VERSION = 1

// The rule locks travel in the file under their setting, and are written apart (applySettingValues, locks)
export const RULE_LOCKS_SETTING = "sr5RuleLocks"

// Hidden world settings that are table options all the same, each edited from a menu of the settings window
export const WORLD_PRESET_HIDDEN_KEYS = [
  // The rule locks menu
  RULE_LOCKS_SETTING,
  // The token defaults menu
  TOKEN_DEFAULTS_SETTING,
  // The shop menu: who may buy (the folder it may name stays out, see below)
  "sr5ShopBuyerMode",
]

// Settings of the window left out of the file: they name a compendium or a folder of this world
export const WORLD_PRESET_EXCLUDED = {
  "compendium.creaturePowers": "compendium",
  "compendium.spritePowers": "compendium",
  "compendium.baseWeapons": "compendium",
  "compendium.creaturePowersExtra": "compendium",
  "compendium.spritePowersExtra": "compendium",
  "compendium.baseWeaponsExtra": "compendium",
  sr5ShopBannerFolder: "folder",
}

// The four choices of sr5ShopBuyerMode (SR5ShopStock.BUYER_MODES, interface/shop-stock.js; the test keeps them equal)
export const SHOP_BUYER_MODES = ["owned", "folder", "flag", "folderOrFlag"]

// What some settings accept beyond their type: the value cleaned, or undefined when it is refused
const VALUE_CHECKS = {
  [RULE_LOCKS_SETTING]: value => isPlainObject(value) && Object.keys(value).every(key => RULE_LOCK_KEYS.includes(key)) ?
    normalizeLocks(value) : undefined,
  [TOKEN_DEFAULTS_SETTING]: value => isPlainObject(value) ? cleanTokenDefaults(value) : undefined,
  sr5ShopBuyerMode: value => SHOP_BUYER_MODES.includes(value) ? value : undefined,
}

// A setting as this world holds it; the rule locks as they apply, the former settings speaking before their migration
export function readWorldSetting(key){
  return key === RULE_LOCKS_SETTING ? currentRuleLocks() : game.settings.get("sr5", key)
}

function isPlainObject(value){
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/**
 * The keys a preset file may hold, as this world registers them: world-scoped, in the window's catalog or hidden
 * among the table options, never one of WORLD_PRESET_EXCLUDED.
 * @param registry game.settings.settings
 */
export function worldPresetKeys(registry = globalThis.game?.settings?.settings){
  return [...Object.keys(SETTINGS_CATALOG), ...WORLD_PRESET_HIDDEN_KEYS]
    .filter(key => !Object.hasOwn(WORLD_PRESET_EXCLUDED, key))
    .filter(key => registry?.get?.(`sr5.${key}`)?.scope === "world")
}

/**
 * A value checked against its setting: the value to write, or undefined when the setting refuses it.
 * Boolean, Number (in its range), String (among its choices), Object and Array as the setting's type says; a setting
 * of another type (a data field) is refused, the file never writes it.
 */
export function checkSettingValue(setting, value, key = setting?.key){
  if (!setting) return undefined
  const check = VALUE_CHECKS[key]
  if (check) return check(value)
  switch (setting.type) {
    case Boolean:
      return typeof value === "boolean" ? value : undefined
    case Number: {
      if (typeof value !== "number" || !Number.isFinite(value)) return undefined
      const range = setting.range
      if (range && ((Number.isFinite(range.min) && value < range.min) || (Number.isFinite(range.max) && value > range.max))) return undefined
      if (setting.choices && !Object.hasOwn(choicesOf(setting), String(value))) return undefined
      return value
    }
    case String:
      if (typeof value !== "string") return undefined
      if (setting.choices && !Object.hasOwn(choicesOf(setting), value)) return undefined
      return value
    case Object:
      return isPlainObject(value) ? value : undefined
    case Array:
      return Array.isArray(value) ? value : undefined
    default:
      return undefined
  }
}

function choicesOf(setting){
  const choices = typeof setting.choices === "function" ? setting.choices() : setting.choices
  return choices ?? {
  }
}

/**
 * The file's content: the format, the system's version, the date, and every preset setting as it stands.
 * @param options.read (key) => the setting's value
 * @param options.registry game.settings.settings
 * @param options.systemVersion game.system.version
 * @param options.date when it is written
 */
export function buildWorldPreset({
  read = readWorldSetting, registry = globalThis.game?.settings?.settings,
  systemVersion = globalThis.game?.system?.version ?? "", date = new Date(),
} = {
}){
  const settings = {
  }
  for (const key of worldPresetKeys(registry).sort()) settings[key] = plainSettingValue(read(key))
  return {
    format: WORLD_PRESET_FORMAT,
    formatVersion: WORLD_PRESET_FORMAT_VERSION,
    system: "sr5",
    systemVersion,
    date: date.toISOString(),
    settings,
  }
}

// The file's name: sr5-preset-<world>-<day>.json
export function worldPresetFileName(worldId = globalThis.game?.world?.id ?? "world", date = new Date()){
  const world = String(worldId).replace(/[^\w-]+/g, "-") || "world"
  return `sr5-preset-${world}-${date.toISOString().slice(0, 10)}.json`
}

/**
 * Read a preset file. Returns the values to write and the rule locks apart, the keys the world does not take
 * (unknown, or not shared) and the keys whose value the setting refused; error is set when the file is no preset
 * ("json", "format"), and nothing is to be written then.
 * @param content the file's text, or its parsed content
 * @param registry game.settings.settings
 */
export function parseWorldPreset(content, registry = globalThis.game?.settings?.settings){
  const result = {
    values: {
    }, locks: null, ignored: [], invalid: [], systemVersion: "", date: "", error: null
  }
  let data = content
  if (typeof content === "string") {
    try {
      data = JSON.parse(content.replace(/^\uFEFF/, ""))
    } catch (_err) {
      result.error = "json"
      return result
    }
  }
  if (!isPlainObject(data) || data.format !== WORLD_PRESET_FORMAT || !isPlainObject(data.settings)) {
    result.error = "format"
    return result
  }
  result.systemVersion = typeof data.systemVersion === "string" ? data.systemVersion : ""
  result.date = typeof data.date === "string" ? data.date : ""
  const allowed = new Set(worldPresetKeys(registry))
  for (const [key, raw] of Object.entries(data.settings)) {
    if (!allowed.has(key)) {
      result.ignored.push(key)
      continue
    }
    const value = checkSettingValue(registry.get(`sr5.${key}`), raw, key)
    if (value === undefined) result.invalid.push(key)
    else if (key === RULE_LOCKS_SETTING) result.locks = value
    else result.values[key] = value
  }
  return result
}

/**
 * The settings an imported preset would change in this world: [{key, from, to}], the rule locks among them.
 * @param parsed what parseWorldPreset returned
 * @param read (key) => the setting's value
 */
export function worldPresetChanges(parsed, read = readWorldSetting){
  const changes = []
  const entries = Object.entries(parsed?.values ?? {
  })
  if (parsed?.locks) entries.push([RULE_LOCKS_SETTING, parsed.locks])
  for (const [key, to] of entries) {
    const from = key === RULE_LOCKS_SETTING ? normalizeLocks(read(key)) : read(key)
    if (!sameSettingValue(from, to)) changes.push({
      key, from: plainSettingValue(from), to
    })
  }
  return changes
}
