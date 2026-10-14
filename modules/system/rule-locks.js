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
 * - sr5RuleLocksMigration: 1 once the three former settings were copied in, 2 once sr5BlockMissingActions moved to its box (runRuleLocksMigration).
 * - sr5RuleLocksAsk: "pending" in a new world until its gamemaster chose a preset, then "done"; "" in any other world.
 * The default is the book: every box checked.
 */
import {
  updateLedger
} from "./gm-ledger.js"

// The seven families of the survey (PLAN-AUTOMATISATION-LEGERE.md, § 1)
export const RULE_LOCK_FAMILIES = ["actions", "ranges", "ammo", "magic", "matrix", "body", "objects"]

// Boxes inside a family → their family. Each was a world setting of its own before B13
// "missingActions" holds sr5BlockMissingActions (unchecked by default before B13), so that its family stays the
// book's: the interruption, the active defense and the Edge of an extended test refused in every world (lot 1)
export const RULE_LOCK_CASES = {
  missingActions: "actions", garage: "objects", lockpick: "objects"
}

// Every box of sr5RuleLocks, in the order the menu shows them
export const RULE_LOCK_KEYS = [...RULE_LOCK_FAMILIES, ...Object.keys(RULE_LOCK_CASES)]

export const RULE_LOCK_PRESETS = ["book", "light", "custom"]

// The former world settings, by the box that now holds their value
export const LEGACY_RULE_LOCKS = {
  missingActions: "sr5BlockMissingActions",
  garage: "sr5StorageCheckGarageLifestyle",
  lockpick: "sr5LockpickRequiresKit",
}

// 1: the three former settings copied in; 2: sr5BlockMissingActions moved from the "actions" family to its box
export const RULE_LOCKS_MIGRATION_VERSION = 2

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
  const done = readSetting("sr5RuleLocksMigration") ?? 0
  if (done < 1) return locksFromLegacy(readSetting)
  if (done < 2) return locksFromV1(readSetting("sr5RuleLocks"))
  return normalizeLocks(readSetting("sr5RuleLocks"))
}

/**
 * The boxes saved by migration 1, where the "actions" family held sr5BlockMissingActions: that value goes to its
 * box, and the family is checked again (the interruption, the active defense and the Edge refused in every world),
 * unless the gamemaster had chosen "light", which lifted everything.
 */
export function locksFromV1(raw) {
  const locks = {
    ...normalizeLocks(raw), missingActions: raw?.actions !== false
  }
  if (presetOf(locks) === "light") return locks
  return {
    ...locks, actions: true
  }
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

/**
 * Does this lock stop the user of this browser? As ruleLockActive, but a gamemaster the world spares
 * (sr5RuleLocksGMExempt, idea 11) is never stopped. For a site that acts in the browser of the one acting only: a
 * gamemaster's browser handling a player's request (a socket) reads ruleLockActive
 */
export function ruleLockBinds(family, lockCase = null) {
  return ruleLockActive(family, lockCase) && !gmExempt()
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
let socketHandler = null

// The text of the whisper, in the language of the gamemaster who writes it
// A notice (noticeGM) tells of no lock: only who acted, and what the gamemaster is to rule
export function ruleLockWhisperText(family, key, data, actorName, notice = false) {
  return game.i18n.format(notice ? "SR5.RULELOCKS_Notice" : "SR5.RULELOCKS_Whisper", {
    family: game.i18n.localize(`SR5.RULELOCKS_Family_${family}`),
    actor: actorName ?? "",
    message: game.i18n.format(key, data ?? {
    }),
  })
}

/**
 * The lifted lock, told to the gamemaster. The gamemaster acting alone gets a notification instead of a chat line.
 * A player's browser does not write the whisper: Foundry shows a whisper to its author, so she would read it too.
 * It asks the active gamemaster, whose browser writes it (socket "ruleLockWhisper"). No gamemaster: nobody to tell.
 */
async function tellGM(family, key, data, actor, notice = false) {
  //The gamemaster's own notification says the lock was lifted, as the whisper does: the bare refusal would read
  //as if the action had stopped (manual, 08/10: "nothing is spent" while the action was spent)
  if (game.user?.isGM) return ui.notifications.info(ruleLockWhisperText(family, key, data, actor?.name, notice))
  if (!game.users?.activeGM) return
  if (!shouldWhisper(actor?.id ?? actor?.uuid, key)) return
  // Loaded on first use (the socket imports half the system); one promise for every caller
  socketHandler ??= import("../socket.js")
  const {
    SR5_SocketHandler
  } = await socketHandler
  return SR5_SocketHandler.emitForGM("ruleLockWhisper", {
    family, key, data: data ?? {
    }, actor: actor?.name ?? game.user?.name ?? "", ...(notice ? {
      notice: true
    } : {
    })
  })
}

/**
 * Something the system lets through for the gamemaster to rule, with no lock involved (lot 19: an owner's action on an
 * icon whose owner the system cannot tell). Told as a lifted lock is, without the words "lock lifted".
 */
export function noticeGM(family, key, data, actor) {
  tellGM(family, key, data, actor, true).catch(err => console.error("SR5 | rule notice whisper failed", err))
}

// Format data a refusal sends: plain values only (names, numbers)
const plainData = data => data && typeof data === "object" && !Array.isArray(data) &&
  Object.values(data).every(v => ["string", "number", "boolean"].includes(typeof v))

/**
 * The active gamemaster's browser writes the whisper a player's browser asked for. The family and the key must be
 * ones the system knows; the whisper escapes its text (whisperGM), and goes to the gamemasters only.
 */
export async function socketRuleLockWhisper(message, senderId) {
  if (game.users?.activeGM?.id !== game.user?.id) return
  const {
    family, key, data, actor, notice
  } = message?.data ?? {
  }
  if (!RULE_LOCK_FAMILIES.includes(family) || typeof key !== "string" || !/^SR5\.[A-Za-z0-9_]+$/.test(key)) return
  if ((game.i18n.has && !game.i18n.has(key)) || !plainData(data ?? {
  })) return
  const actorName = typeof actor === "string" ? actor : (game.users.get(senderId)?.name ?? "")
  actorHelper ??= import("../entities/actors/entityActor-helpers.js")
  const {
    SR5_ActorHelper
  } = await actorHelper
  return SR5_ActorHelper.whisperGM(ruleLockWhisperText(family, key, data, actorName, notice === true))
}

// The world spares the gamemaster every rule lock (idea 11, sr5RuleLocksGMExempt): his own action goes, and his
// notification says which lock it passed (tellGM)
export function gmExempt() {
  return !!globalThis.game?.user?.isGM && readSetting("sr5RuleLocksGMExempt") === true
}

/**
 * At a refusal: true if the action must stop.
 * Lock on: the site's message, as it was, and true. Lock lifted: the action goes on, the gamemaster is told, false.
 * @param {string} family
 * @param {string} key the message's localization key
 * @param {object} [data] its format data
 * @param {object} [options] actor: who acts (for the whisper) ; lockCase: a box of the family ; level: "warn" or "info" ;
 * liftedKey: the message told to the gamemaster when the lock is lifted, for a refusal whose text says the action stops
 */
export function refuseByRule(family, key, data, {
  actor = null, lockCase = null, level = "warn", liftedKey = null
} = {
}) {
  if (ruleLockActive(family, lockCase) && !gmExempt()) {
    //A message without data is localized as the sites did before B13 (lot 6: blight-blocks-spellcasting.test.js)
    ui.notifications[level](data ? game.i18n.format(key, data) : game.i18n.localize(key))
    return true
  }
  tellGM(family, liftedKey ?? key, data, actor).catch(err => console.error("SR5 | rule lock whisper failed", err))
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
  for (const [legacyRuleLock, value] of Object.entries(legacyFromLocks(locks))) {
    if (game.settings.get("sr5", legacyRuleLock) !== value) await game.settings.set("sr5", legacyRuleLock, value)
  }
  if (game.settings.get("sr5", "sr5RuleLocksMigration") < RULE_LOCKS_MIGRATION_VERSION) {
    await game.settings.set("sr5", "sr5RuleLocksMigration", RULE_LOCKS_MIGRATION_VERSION)
  }
  return locks
}

/**
 * Once per world, by the gamemaster at ready: the three former settings copied into the boxes, as they stand.
 * A world that had sr5BlockMissingActions unchecked (its default) finds the "missing actions" box unchecked, hence
 * the "custom" preset: nothing changes in its games. A world migrated once gets its boxes moved (locksFromV1).
 * A new world (newWorld: no system migration had ever run in it) starts with the book, every box checked.
 */
export async function runRuleLocksMigration({
  newWorld = false
} = {
}) {
  const done = game.settings.get("sr5", "sr5RuleLocksMigration") ?? 0
  if (done >= RULE_LOCKS_MIGRATION_VERSION) return askNewWorldPreset()
  if (newWorld && done < 1) {
    await setRuleLocks(presetLocks("book"))
    await updateLedger("sr5RuleLocksAsk", () => "pending")
    return askNewWorldPreset()
  }
  const locks = done < 1 ? locksFromLegacy(key => game.settings.get("sr5", key)) : locksFromV1(game.settings.get("sr5", "sr5RuleLocks"))
  await game.settings.set("sr5", "sr5RuleLocks", locks)
  await game.settings.set("sr5", "sr5RuleLocksPreset", presetOf(locks))
  await game.settings.set("sr5", "sr5RuleLocksMigration", RULE_LOCKS_MIGRATION_VERSION)
}

// The presets offered in a new world (askNewWorldPreset): the book, the book with the missing actions let through, light
export const NEW_WORLD_PRESETS = ["book", "bookFreeActions", "light"]

// The boxes of a preset chosen in a new world; anything else (the window closed) is the book
export function newWorldPresetLocks(choice) {
  if (choice === "light") return presetLocks("light")
  if (choice === "bookFreeActions") return {
    ...presetLocks("book"), missingActions: false
  }
  return presetLocks("book")
}

/**
 * Once per new world, the active gamemaster chooses its preset (wish of DjamZ, 07/10). sr5RuleLocksAsk is "pending"
 * only in a world the migration found new; an existing world never had it, and is never asked. The window closed
 * without a choice is the book. Asked once: the flag goes to "done" in its turn (gm-ledger.js)
 * Each choice applies the automation preset of the Presets menu (lot 16b, settings-presets.js): one system, not two.
 */
export async function askNewWorldPreset() {
  if (game.settings.get("sr5", "sr5RuleLocksAsk") !== "pending") return
  if (!game.users?.activeGM?.isSelf) return
  const option = (key, checked) => `<p><label><input type="radio" name="preset" value="${key}"${checked ? " checked" : ""}> <strong>${game.i18n.localize(`SR5.RULELOCKS_Ask_${key}`)}</strong> — ${game.i18n.localize(`SR5.RULELOCKS_Ask_${key}_D`)}</label></p>`
  const content = `<p>${game.i18n.localize("SR5.RULELOCKS_Ask_Intro")}</p>${NEW_WORLD_PRESETS.map((key, i) => option(key, i === 0)).join("")}<p><em>${game.i18n.localize("SR5.RULELOCKS_Ask_Later")}</em></p>`
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {
      title: "SR5.RULELOCKS_Ask_T"
    },
    content,
    buttons: [{
      action: "ok", label: "SR5.RULELOCKS_Save", default: true,
      callback: (_event, button) => button.form.elements.preset.value
    }],
    rejectClose: false,
  })
  await updateLedger("sr5RuleLocksAsk", () => "done")
  // Loaded here: the presets read this file
  const {
    newWorldPresetChanges, applySettingValues
  } = await import("./settings-presets.js")
  const {
    values, locks
  } = newWorldPresetChanges(choice)
  await applySettingValues(values, locks)
}
