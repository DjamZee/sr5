/**
 * The presets of the settings window (lot 10; decision of 09/10): one menu at the head of the Shadowrun settings, with
 * two choices, automation (light / advanced) and rules (book and supplements / house rules / both), and "save my
 * settings". A preset only writes values: every setting stays the gamemaster's to change afterwards. It replaces the
 * Light / Book selector of the rule locks window, which the automation choice now holds.
 *
 * - Automation: the rule locks (system/rule-locks.js), all lifted or all on, and the settings that only say how far
 *   the system automates (AUTOMATION_PRESETS).
 * - Rules: the boolean settings the catalog tags as an option of a book or as a house rule (settings-catalog.js),
 *   switched on or left at their default. The optional combat rules of Run & Gun are left out: the book asks each table
 *   to pick its own ("choisissez celles qui conviennent à votre table", RG p. 121).
 * - Saved settings: every world setting of the window and the rule locks, in one hidden world setting.
 */
import {
  SETTINGS_CATALOG
} from "./settings-catalog.js"
import {
  RG_SETTINGS
} from "./rg-combat-options.js"
import {
  presetLocks, currentRuleLocks, setRuleLocks, normalizeLocks
} from "./rule-locks.js"

export const PRESETS_MENU = "sr5PresetsMenu"
export const PRESETS_SAVED_SETTING = "sr5PresetsSaved"

export const AUTOMATION_PRESET_KEYS = ["light", "advanced"]
export const RULES_PRESET_KEYS = ["book", "house", "mixed"]

// Light: every rule lock lifted, nothing done for the table that it did not ask; advanced: the book's locks, and the
// system tracks running, time, the DNI switch and the delivery delays itself
export const AUTOMATION_PRESETS = {
  light: {
    locks: "light",
    values: {
      sr5RunningFromDistance: false, sr5CalendarCombatTime: false, sr5WifiRequiresDNI: false, sr5ShopDelivery: "immediate",
    },
  },
  advanced: {
    locks: "book",
    values: {
      sr5RunningFromDistance: true, sr5CalendarCombatTime: true, sr5WifiRequiresDNI: true, sr5ShopDelivery: "delayed",
    },
  },
}

// Which tags each rules preset switches on; the other tag goes back to its default
const RULES_TAGS_ON = {
  book: ["book"], house: ["house"], mixed: ["book", "house"],
}

// Left to each table, whatever the preset (RG p. 121)
export const RULES_PRESET_EXCLUDED = new Set(Object.values(RG_SETTINGS))

/**
 * The values a rules preset writes.
 * @param preset one of RULES_PRESET_KEYS
 * @param settings [{key, tag, type, default}]: the boolean settings of the catalog that carry a tag
 * @returns {Object<string, boolean>}
 */
export function rulesPresetValues(preset, settings){
  const on = RULES_TAGS_ON[preset]
  if (!on) return {
  }
  const values = {
  }
  for (const s of settings) {
    if (s.type !== Boolean || !s.tag || RULES_PRESET_EXCLUDED.has(s.key)) continue
    values[s.key] = on.includes(s.tag) ? true : s.default === true
  }
  return values
}

/**
 * Everything a choice writes: the settings by key, and the rule locks (null: left as they are).
 * @param choice {automation, rules}: "" leaves that half untouched
 */
export function presetChanges(choice, settings){
  const automation = AUTOMATION_PRESETS[choice?.automation]
  return {
    values: {
      ...rulesPresetValues(choice?.rules, settings), ...(automation?.values ?? {
      })
    },
    locks: automation ? presetLocks(automation.locks) : null,
  }
}

/**
 * The settings of this world a rules preset reads: boolean, world-scoped, tagged in the catalog.
 * @param registry game.settings.settings
 */
export function taggedBooleanSettings(registry = globalThis.game?.settings?.settings){
  const out = []
  for (const [key, [, tag]] of Object.entries(SETTINGS_CATALOG)) {
    const setting = registry?.get?.(`sr5.${key}`)
    if (!setting || setting.scope !== "world" || setting.type !== Boolean || !tag) continue
    out.push({
      key, tag, type: Boolean, default: setting.default
    })
  }
  return out
}

// The world settings of the window, the ones "save my settings" keeps
export function savableSettingKeys(registry = globalThis.game?.settings?.settings){
  return Object.keys(SETTINGS_CATALOG).filter(key => registry?.get?.(`sr5.${key}`)?.scope === "world")
}

/**
 * A setting's value as it can be stored and compared: a Set (the "+" compendiums of lot 9, a SetField) becomes the
 * array the setting is written with. deepClone turned it into {}, and restoring wrote {} over the list (measured in
 * game, 14/10).
 */
export function plainSettingValue(value){
  if (value instanceof Set) return [...value]
  if (value instanceof Map) return Object.fromEntries(value)
  if (value && typeof value === "object") return JSON.parse(JSON.stringify(value))
  return value
}

// Same value, a Set and the array it was saved as included
export function sameSettingValue(a, b){
  return JSON.stringify(plainSettingValue(a)) === JSON.stringify(plainSettingValue(b))
}

/**
 * Write what a preset or a saved set holds: only the values that change. The rule locks through setRuleLocks, which
 * keeps the three former settings in step. Returns the keys written, and whether one of them asks for a reload.
 */
export async function applySettingValues(values, locks = null){
  const written = []
  let reload = false
  for (const [key, value] of Object.entries(values ?? {
  })) {
    const setting = game.settings.settings.get(`sr5.${key}`)
    if (!setting || setting.scope !== "world") continue
    if (sameSettingValue(game.settings.get("sr5", key), value)) continue
    await game.settings.set("sr5", key, value)
    written.push(key)
    if (setting.requiresReload) reload = true
  }
  if (locks) {
    const before = normalizeLocks(currentRuleLocks())
    const after = normalizeLocks(locks)
    if (Object.keys(after).some(k => after[k] !== before[k])) {
      await setRuleLocks(after)
      written.push("sr5RuleLocks")
    }
  }
  return {
    written, reload
  }
}

// "Save my settings": the world settings of the window and the rule locks, as they stand
export async function saveCurrentSettings(){
  const values = {
  }
  for (const key of savableSettingKeys()) values[key] = plainSettingValue(game.settings.get("sr5", key))
  await game.settings.set("sr5", PRESETS_SAVED_SETTING, {
    time: Date.now(), user: game.user?.name ?? "", values, locks: currentRuleLocks(),
  })
}

export function savedSettings(){
  const saved = game.settings.get("sr5", PRESETS_SAVED_SETTING)
  return saved?.values ? saved : null
}

export function registerPresetSettings(){
  game.settings.register("sr5", PRESETS_SAVED_SETTING, {
    scope: "world", config: false, type: Object, default: {
    },
  })
}
