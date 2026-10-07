/**
 * Rule locks (B13, "light automation"): where the system refuses an action in the name of a book rule,
 * the gamemaster may lift the refusal for a whole family of rules. The roll, the counters and the
 * computations stay as they are; only the "no" goes, and it becomes a whisper to the gamemaster.
 *
 * Lot 0 holds the shared function and the settings: no refusal site reads it yet. A site keeps its own
 * test and swaps its exit, `if (cond) return ui.notifications.warn(…)` becoming
 * `if (cond && refuseByRule("ammo", "SR5.WARN_…", data, { actor })) return`.
 *
 * Settings (world, hidden, edited from the "Rule locks" tab of the settings window):
 * - sr5RuleLocks: one box per family, and the two boxes of the "objects" family that were settings of their own;
 * - sr5RuleLocksPreset: "book", "light" or "custom", what the boxes amount to;
 * - sr5RuleLocksMigration: 1 once the three former settings were copied in (runRuleLocksMigration).
 * The default is the book: every box checked.
 */

// The seven families of the survey (PLAN-AUTOMATISATION-LEGERE.md, § 1)
export const RULE_LOCK_FAMILIES = ["actions", "ranges", "ammo", "magic", "matrix", "body", "objects"]

// Boxes inside a family → their family. Each was a world setting of its own before B13
export const RULE_LOCK_CASES = {
  garage: "objects", lockpick: "objects"
}

// Every box of sr5RuleLocks, in the order the menu shows them
export const RULE_LOCK_KEYS = [...RULE_LOCK_FAMILIES, ...Object.keys(RULE_LOCK_CASES)]

export const RULE_LOCK_PRESETS = ["book", "light", "custom"]

// The former world settings, by the box that now holds their value
export const LEGACY_RULE_LOCKS = {
  actions: "sr5BlockMissingActions",
  garage: "sr5StorageCheckGarageLifestyle",
  lockpick: "sr5LockpickRequiresKit",
}

export const RULE_LOCKS_MIGRATION_VERSION = 1

// Every box checked (the book) or none (light)
export function presetLocks(preset) {
  const value = preset !== "light"
  return Object.fromEntries(RULE_LOCK_KEYS.map(key => [key, value]))
}

// What a set of boxes amounts to: all checked is the book, none is light, anything else is custom
export function presetOf(locks) {
  const values = RULE_LOCK_KEYS.map(key => locks?.[key] !== false)
  if (values.every(Boolean)) return "book"
  if (!values.some(Boolean)) return "light"
  return "custom"
}

// Every box as a boolean; a box missing (a family added later) is the book's: checked
export function normalizeLocks(raw) {
  return Object.fromEntries(RULE_LOCK_KEYS.map(key => [key, raw?.[key] !== false]))
}

// The boxes a world had before B13: its three former settings as they stand, the book for the rest
export function locksFromLegacy(read) {
  const locks = presetLocks("book")
  for (const [key, setting] of Object.entries(LEGACY_RULE_LOCKS)) locks[key] = read(setting) === true
  return locks
}

// The values the three former settings must hold for the sites that still read them
export function legacyFromLocks(locks) {
  const out = {
  }
  for (const [key, setting] of Object.entries(LEGACY_RULE_LOCKS)) {
    const family = RULE_LOCK_CASES[key]
    out[setting] = locks[key] !== false && (!family || locks[family] !== false)
  }
  return out
}

function readSetting(key) {
  try {
    return game.settings.get("sr5", key)
  } catch (_err) {
    return undefined
  }
}

/**
 * The boxes of this world. Before its migration has run (no gamemaster has opened it since the update),
 * the former settings still speak, so that no world changes behaviour in between.
 */
export function currentRuleLocks() {
  if (!globalThis.game?.settings) return presetLocks("book")
  if ((readSetting("sr5RuleLocksMigration") ?? 0) < RULE_LOCKS_MIGRATION_VERSION) return locksFromLegacy(readSetting)
  return normalizeLocks(readSetting("sr5RuleLocks"))
}

/**
 * Is this lock on? A family, or a box inside it (both must be checked).
 * @param {string} family one of RULE_LOCK_FAMILIES
 * @param {string} [lockCase] a box of that family (RULE_LOCK_CASES)
 * @param {object} [locks] the boxes, read from the world when left out
 */
export function ruleLockActive(family, lockCase = null, locks = currentRuleLocks()) {
  if (locks[family] === false) return false
  return !lockCase || locks[lockCase] !== false
}

// Whispers already sent: by actor and message, once per combat round (or within WHISPER_WINDOW out of combat)
const WHISPER_WINDOW = 10000
const whispered = new Map()

/**
 * Should the gamemaster hear of this lifted lock? Not twice in the same combat round for the same actor and
 * message: a fanning burst must not write ten lines.
 * @returns {boolean}
 */
export function shouldWhisper(actorId, key, {
  combat = globalThis.game?.combat, now = Date.now()
} = {
}) {
  const round = combat?.started ? `${combat.id}:${combat.round}` : null
  const id = `${actorId ?? ""}|${key}`
  const last = whispered.get(id)
  if (round) {
    if (last?.round === round) return false
  } else if (last && !last.round && now - last.time < WHISPER_WINDOW) return false
  whispered.set(id, {
    round, time: now
  })
  return true
}

export function resetWhispers() {
  whispered.clear()
}

let actorHelper = null

// The lifted lock, told to the gamemaster. The gamemaster acting alone gets a notification instead of a chat line
async function tellGM(family, key, data, actor) {
  const message = game.i18n.format(key, data ?? {
  })
  if (game.user?.isGM) return ui.notifications.info(message)
  if (!shouldWhisper(actor?.id ?? actor?.uuid, key)) return
  // Loaded on first use (the actor helpers import half the system); one promise for every caller
  actorHelper ??= import("../entities/actors/entityActor-helpers.js")
  const {
    SR5_ActorHelper
  } = await actorHelper
  return SR5_ActorHelper.whisperGM(game.i18n.format("SR5.RULELOCKS_Whisper", {
    family: game.i18n.localize(`SR5.RULELOCKS_Family_${family}`),
    actor: actor?.name ?? game.user?.name ?? "",
    message,
  }))
}

/**
 * At a refusal: true if the action must stop.
 * Lock on: the site's message, as it was, and true. Lock lifted: the action goes on, the gamemaster is told, false.
 * @param {string} family
 * @param {string} key the message's localization key
 * @param {object} [data] its format data
 * @param {object} [options] actor: who acts (for the whisper) ; lockCase: a box of the family ; level: "warn" or "info"
 */
export function refuseByRule(family, key, data, {
  actor = null, lockCase = null, level = "warn"
} = {
}) {
  if (ruleLockActive(family, lockCase)) {
    ui.notifications[level](game.i18n.format(key, data ?? {
    }))
    return true
  }
  tellGM(family, key, data, actor).catch(err => console.error("SR5 | rule lock whisper failed", err))
  return false
}

/**
 * For a cap: the capped value if the lock is on (with the site's message), the value entered otherwise (the
 * gamemaster told). A value within the cap comes back untouched, silently.
 */
export function capByRule(family, value, cap, key, data, options = {
}) {
  if (!(value > cap)) return value
  return refuseByRule(family, key, data, options) ? cap : value
}

/**
 * Save the boxes: the preset follows from them, and the three former settings are written in step, so the
 * sites that still read them behave as the boxes say.
 */
export async function setRuleLocks(raw) {
  const locks = normalizeLocks(raw)
  await game.settings.set("sr5", "sr5RuleLocks", locks)
  await game.settings.set("sr5", "sr5RuleLocksPreset", presetOf(locks))
  for (const [setting, value] of Object.entries(legacyFromLocks(locks))) {
    if (game.settings.get("sr5", setting) !== value) await game.settings.set("sr5", setting, value)
  }
  if (game.settings.get("sr5", "sr5RuleLocksMigration") < RULE_LOCKS_MIGRATION_VERSION) {
    await game.settings.set("sr5", "sr5RuleLocksMigration", RULE_LOCKS_MIGRATION_VERSION)
  }
  return locks
}

/**
 * Once per world, by the gamemaster at ready: the three former settings copied into the boxes, as they stand.
 * A world that had sr5BlockMissingActions unchecked (its default) finds the "actions" family unchecked, hence
 * the "custom" preset: nothing changes in its games.
 */
export async function runRuleLocksMigration() {
  if (game.settings.get("sr5", "sr5RuleLocksMigration") >= RULE_LOCKS_MIGRATION_VERSION) return
  const locks = locksFromLegacy(key => game.settings.get("sr5", key))
  await game.settings.set("sr5", "sr5RuleLocks", locks)
  await game.settings.set("sr5", "sr5RuleLocksPreset", presetOf(locks))
  await game.settings.set("sr5", "sr5RuleLocksMigration", RULE_LOCKS_MIGRATION_VERSION)
}
