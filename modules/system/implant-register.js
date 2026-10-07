// The gamemaster's register of the reserved fields (séance G, G16, G19, H22): the Adapsine box, the lot and
// Prototype de transhumain's mark on an implant, the counter of the quality, the Essence lost by a character. A world
// setting, which only a gamemaster may write: the active GM keeps in it the values he wrote or worked out himself.
//
// A player's client refuses to change these fields (entityItem.js, entityActor.js), but a client can be made to skip
// its own checks. So the active GM, who sees every write through the hooks, checks again: a value a player changed is
// put back from the register, and he is told. An implant a player installs is worked out again on the GM's side from
// the body (installationFlags). Nothing is checked while no gamemaster is connected; at the next GM's arrival, what
// does not match the register is put back.
import {
  GM_ONLY_FIELDS, installationFlags
} from "./implant-essence.js"
import {
  RESERVED_DEFAULTS, reservedValues, reservedMismatches
} from "./reserved-fields.js"
import {
  updateLedger
} from "./gm-ledger.js"
import {
  CREATION_FLAG, creationModeFor, actorInCreation, worldCreationMode
} from "./creation-actor.js"

export const IMPLANT_REGISTER = "sr5ImplantRegister"

export function registerImplantRegisterSetting() {
  game.settings.register("sr5", IMPLANT_REGISTER, {
    scope: "world",
    config: false,
    default: {
    },
    type: Object,
  })
}

/** The reserved fields of a document, by its kind. */
export function reservedFieldsOf(doc) {
  if (doc?.documentName === "Item") return GM_ONLY_FIELDS[doc.type] ?? []
  if (doc?.documentName === "Actor" && doc.system?.essence) return GM_ONLY_FIELDS.actor
  return []
}

/**
 * Whether the compendium entry `doc` was taken from gives its Essence back on removal (Better Than Bad p. 141), and
 * `doc` is still that implant (same kind, same Essence): a compendium is the gamemaster's, a player cannot write it.
 * @param {Function} [resolve] how a uuid is read (fromUuid)
 */
export async function sourceReversible(doc, resolve) {
  return !!(await sourceEntry(doc, resolve))?.system?.reversibleEssence
}

/**
 * The compendium entry `doc` was taken from, while `doc` is still that implant (same kind, same Essence and
 * multiplier); null otherwise. A drag from a compendium notes compendiumSource; the shop notes where it sold from
 * (shop.js, shopSource).
 */
export async function sourceEntry(doc, resolve = uuid => fromUuid(uuid), {
  playerOwned = source => !!game.users?.some(u => !u.isGM && source.testUserPermission?.(u, "OWNER")),
  matchCost = true
} = {
}) {
  const candidates = [doc?._stats?.compendiumSource, doc?.flags?.core?.sourceId, doc?.flags?.sr5?.shopSource, doc?._stats?.duplicateSource]
    .filter(u => typeof u === "string")
  const cost = system => system?.essenceCost ?? {
  }
  for (const uuid of candidates) {
    // A compendium is the gamemaster's; so is an item of the world's directory no player owns (Apollinaire's second
    // review: an accessory the gamemaster made in the world). An item on a sheet, or one a player owns, is not
    const compendium = uuid.startsWith("Compendium.")
    if (!compendium && !/^Item\.[^.]+$/.test(uuid)) continue
    const source = await resolve(uuid)
    if (!source || (!compendium && playerOwned(source))) continue
    const same = source.type === doc.type && source.system?.type === doc.system?.type && (!matchCost || (
      Number(cost(source.system).base) === Number(cost(doc.system).base) &&
      (cost(source.system).multiplier ?? "") === (cost(doc.system).multiplier ?? "")))
    if (same) return source
  }
  return null
}

/**
 * The marks the gamemaster vouches for on an implant being removed (Apollinaire's review): read in his register, never
 * on the deleted document, whose last write may be a player's the GM has not put back yet. An implant the register
 * does not know is read on its compendium entry, else as an implant that leaves a hole.
 */
export async function vouchedMarks(doc, register, resolve) {
  const entry = register?.[doc?.uuid]
  if (entry && "isAccessory" in entry && "reversibleEssence" in entry) return {
    isAccessory: entry.isAccessory === true, reversibleEssence: entry.reversibleEssence === true
  }
  const source = await sourceEntry(doc, resolve)
  return {
    isAccessory: entry && "isAccessory" in entry ? entry.isAccessory === true : !!source?.system?.isAccessory,
    reversibleEssence: entry && "reversibleEssence" in entry ? entry.reversibleEssence === true : !!source?.system?.reversibleEssence,
  }
}

/**
 * What a document a player created should carry, worked out by the gamemaster: an implant from the body it is
 * installed on, without itself (Chrome Flesh p. 57, 165), and from its compendium entry for the Essence given back
 * (Better Than Bad p. 141); anything else, the defaults.
 */
export async function expectedAtCreation(doc, fields, {
  creation = false, resolve
} = {
}) {
  if (doc?.type === "itemAugmentation" && doc.parent?.items) {
    const others = doc.parent.items.filter(i => i.id !== doc.id)
    const source = await sourceEntry(doc, resolve)
    // The Essence it costs is its origin's, whatever the copy says; an implant without a known origin keeps its own
    const origin = source ?? await sourceEntry(doc, resolve, {
      matchCost: false
    })
    const cost = (origin ?? doc).system?.essenceCost ?? {
    }
    return {
      ...installationFlags({
        items: others
      }, doc.system, {
        creation
      }),
      reversibleEssence: !!source?.system?.reversibleEssence,
      // An accessory costs no Essence (entityActor.js): only a compendium entry says so for a player's implant
      isAccessory: !!source?.system?.isAccessory,
      "essenceCost.base": Number(cost.base) || 0,
      "essenceCost.multiplier": cost.multiplier ?? "",
    }
  }
  return Object.fromEntries(fields.map(f => [f, RESERVED_DEFAULTS[f]]))
}

/**
 * The values to expect of a document: the register's, or, for a document it does not know yet, what it holds when
 * that is the default, else what the body gives now. At the gamemaster's arrival (firstSight), a document the register
 * does not know is taken as it stands, like its peak (PEAK_COST): a character the GM imported, or set up before the
 * register existed, carries his own values, and an accessory must not be unticked (DjamZ's world, 07/10: ten
 * accessories made to cost Essence at a reload). A field the register entry does not hold yet (one added to the
 * reserved fields after the entry was made, isAccessory or reversibleEssence) is taken the same way.
 */
export async function expectedValues(doc, fields, register, options = {
}) {
  const current = reservedValues(doc.system, fields)
  const entry = register?.[doc.uuid]
  if (!entry && options.firstSight) return current
  if (entry) {
    if (fields.every(f => f in entry)) return Object.fromEntries(fields.map(f => [f, entry[f]]))
    // At the GM's arrival (firstSight), the document as it stands; on a player's write, what the GM works out
    const missing = options.firstSight ? current : await expectedAtCreation(doc, fields, options)
    return Object.fromEntries(fields.map(f => [f, f in entry ? entry[f] : (missing[f] ?? RESERVED_DEFAULTS[f])]))
  }
  const worked = await expectedAtCreation(doc, fields, options)
  return Object.fromEntries(fields.map(f => [f, current[f] === RESERVED_DEFAULTS[f] ? current[f] : (worked[f] ?? RESERVED_DEFAULTS[f])]))
}

const isActiveGM = () => !!game.users?.activeGM?.isSelf
// The world's creation mode, or the gamemaster's flag on the character the document is (or is on): lot C0
const creationMode = doc => creationModeFor(doc?.documentName === "Actor" ? doc : doc?.parent)

// The register is written by one client, the active GM, in its turn on its latest state (gm-ledger.js)
function record(doc, values) {
  // An implant is always kept: absent, a box a player forged would be worked out again from the body. A quality or a
  // character at its defaults needs no entry
  const atDefaults = values && Object.entries(values).every(([f, v]) => v === RESERVED_DEFAULTS[f])
  const value = doc.type !== "itemAugmentation" && atDefaults ? null : values
  return updateLedger(IMPLANT_REGISTER, register => {
    if (value === null) return doc.uuid in register ? (delete register[doc.uuid], register) : null
    // The highest cost seen (PEAK_COST) is not a field of the implant: it stays across the writes of its fields
    const peak = register[doc.uuid]?.[PEAK_COST]
    const next = peak === undefined ? value : {
      ...value, [PEAK_COST]: peak
    }
    if (JSON.stringify(register[doc.uuid]) === JSON.stringify(next)) return null
    register[doc.uuid] = next
    return register
  }).catch(e => console.error("SR5 | implant register", e))
}

/**
 * The register's key for the highest Essence an implant ever cost while the active GM watched. Lost Essence does not
 * come back (SR5 p. 53, arbitrage de DjamZ): lowering an implant's rating or grade just before removing it does not
 * shrink the hole, which is that peak (essence-hole.js). An honest rise (a higher rating bought) raises it.
 */
export const PEAK_COST = "peakCost"

/** The new peak for an implant whose cost is now `cost`, or null when the register already holds as much. */
export function nextPeak(entry, cost) {
  const now = Number(cost) || 0
  const peak = Number(entry?.[PEAK_COST]) || 0
  return now > peak ? Math.round(now * 100) / 100 : null
}

/**
 * The Essence an installed implant takes from its body: the highest cost the active GM saw it take, never less than its
 * cost now. "Quand un implant est retiré […] pour être remplacé ou amélioré, cela laisse […] une faille" (Chrome Flesh
 * p. 74): an implant improved in surgery (standard 1.0 → alphaware 0.8) still takes 1.0, at once; a rating lowered gives
 * nothing back (SR5 p. 53). A Tatouage de mana gris gives its Essence back (Better Than Bad p. 141): its cost now.
 * An implant seen for the first time takes its cost now: the sheets already made do not move.
 * @param {object} [register] the register (read from the world setting by default)
 */
export function essenceTaken(item, cost, register = readRegister()) {
  const now = Number(cost) || 0
  if (item?.system?.reversibleEssence || inCreation(item?.parent)) return now
  return Math.max(now, Number(register?.[item?.uuid]?.[PEAK_COST]) || 0)
}

/**
 * A character in creation (lot C0) takes no peak: buying an implant at creation is no surgery, the cyber-surgery and
 * its toll come "après sa création" (SR5 p. 454), and the Essence that "ne revient pas" (SR5 p. 53) is lost in play.
 * At creation an implant takes its cost of now, whatever a module or the GM sets it to; the peak starts from that cost
 * when the gamemaster ends the creation (creationEnded). A rule of the book, not a house rule.
 */
function inCreation(actor) {
  try {
    return !!actor && creationModeFor(actor)
  } catch (_err) {
    return false
  }
}

/** updateActor: did this change take the actor out of creation (the flag unset, or no longer active)? */
export function creationEnded(changes) {
  const sr5 = changes?.flags?.sr5
  if (!sr5) return false
  if (`-=${CREATION_FLAG}` in sr5) return true
  return CREATION_FLAG in sr5 && sr5[CREATION_FLAG]?.active !== true
}

/**
 * The register once `actor` leaves creation: each implant's peak is its cost of now, whatever peak an earlier stay in
 * play left; null when nothing changes.
 */
export function peaksAtCreationEnd(register, actor) {
  let changed = false
  for (const item of actor?.items ?? []) {
    if (item?.type !== "itemAugmentation" || item.system?.reversibleEssence) continue
    const peak = Math.round((Number(item.system?.essenceCost?.value) || 0) * 100) / 100
    if (register[item.uuid]?.[PEAK_COST] === peak) continue
    register[item.uuid] = {
      ...(register[item.uuid] ?? {
      }), [PEAK_COST]: peak
    }
    changed = true
  }
  return changed ? register : null
}

function readRegister() {
  try {
    return globalThis.game?.settings?.get("sr5", IMPLANT_REGISTER) ?? {
    }
  } catch (_err) {
    return {
    }
  }
}

/** The register without the peak of `uuid`, or null when it holds none. */
export function withoutPeak(register, uuid) {
  const entry = register?.[uuid]
  if (!entry || !(PEAK_COST in entry)) return null
  const {
    [PEAK_COST]: _gone, ...rest
  } = entry
  return {
    ...register, [uuid]: rest
  }
}

/**
 * The active GM's gesture (Élise's review): a peak set by mistake (a rating clicked too high, a cost the GM entered
 * wrong then corrected) would keep the Essence lost for ever. Confirmed, the peak is dropped: the implant takes its cost
 * of now, which the next look of the GM notes as its new peak. Through the register, which only a gamemaster writes.
 */
export async function resetEssencePeak(item) {
  if (!game.users.activeGM?.isSelf || item?.type !== "itemAugmentation" || !item.actor) return false
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: game.i18n.localize("SR5.EssencePeakReset")
    },
    content: `<p>${game.i18n.format("SR5.EssencePeakResetConfirm", {
      name: foundry.utils.escapeHTML(item.name), actor: foundry.utils.escapeHTML(item.actor.name)
    })}</p>`,
    rejectClose: false,
  })
  if (confirmed !== true) return false
  await updateLedger(IMPLANT_REGISTER, register => withoutPeak(register, item.uuid))
  // Every client prepares the character again; the GM's own look then notes the cost of now as the peak
  await item.update({
    "flags.sr5.essencePeakReset": Date.now()
  })
  return true
}

/** Notes the cost an implant has now, when it is the highest the active GM has seen for it. */
function notePeak(doc) {
  if (doc?.type !== "itemAugmentation" || !(doc.parent instanceof Actor)) return
  // At creation, no peak (inCreation)
  if (creationMode(doc)) return
  const cost = doc.system?.essenceCost?.value
  if (nextPeak(game.settings.get("sr5", IMPLANT_REGISTER)?.[doc.uuid], cost) === null) return
  return updateLedger(IMPLANT_REGISTER, register => {
    const peak = nextPeak(register[doc.uuid], cost)
    if (peak === null) return null
    register[doc.uuid] = {
      ...(register[doc.uuid] ?? {
      }), [PEAK_COST]: peak
    }
    return register
  }).catch(e => console.error("SR5 | implant register", e))
}

/** A register entry's reserved fields only, without the peak. */
function fieldsOfEntry(entry, fields) {
  return entry ? Object.fromEntries(fields.filter(f => f in entry).map(f => [f, entry[f]])) : entry
}

/** Puts back on `doc` the reserved values a player changed, and tells the gamemaster. */
async function restore(doc, mismatches, userId, {
  created = false
} = {
}) {
  const update = Object.fromEntries(Object.entries(mismatches).map(([f, v]) => [`system.${f}`, v]))
  await doc.update(update)
  const user = game.users.get(userId)?.name ?? game.i18n.localize("SR5.SomePlayer")
  // At the installation nothing was "changed": the GM set what the body and the item's origin give
  ui.notifications.warn(game.i18n.format(created ? "SR5.WARN_GMOnlyFieldSetAtInstall" : "SR5.WARN_GMOnlyFieldRestored", {
    user, name: doc.name, actor: doc.parent?.name ?? doc.name
  }), {
    permanent: true
  })
  console.warn(`SR5 | reserved fields put back on ${doc.uuid} after a write by ${user}`, mismatches)
}

/** createItem: a gamemaster's values are recorded; a player's are worked out again from the body. */
async function onCreate(doc, _options, userId) {
  const fields = reservedFieldsOf(doc)
  if (!fields.length || !isActiveGM()) return
  const current = reservedValues(doc.system, fields)
  if (game.users.get(userId)?.isGM) {
    await record(doc, current)
    return notePeak(doc)
  }
  const expected = await expectedAtCreation(doc, fields, {
    creation: creationMode(doc)
  })
  const mismatches = reservedMismatches(current, expected)
  await record(doc, expected)
  if (Object.keys(mismatches).length) await restore(doc, mismatches, userId, {
    created: true
  })
  return notePeak(doc)
}

/** updateItem / updateActor: a gamemaster's write is recorded; a player's change is put back. */
async function onUpdate(doc, changes, _options, userId) {
  // The gamemaster ends the creation: the peaks start from the costs of now (inCreation)
  if (doc.documentName === "Actor" && isActiveGM() && creationEnded(changes) && !creationMode(doc)) {
    await updateLedger(IMPLANT_REGISTER, register => peaksAtCreationEnd(register, doc))
  }
  const fields = reservedFieldsOf(doc)
  if (!fields.length || !isActiveGM()) return
  const current = reservedValues(doc.system, fields)
  const register = game.settings.get("sr5", IMPLANT_REGISTER) ?? {
  }
  if (game.users.get(userId)?.isGM) {
    const atDefaults = Object.entries(current).every(([f, v]) => v === RESERVED_DEFAULTS[f])
    const known = fieldsOfEntry(register[doc.uuid], fields) ?? (doc.type !== "itemAugmentation" && atDefaults ? current : null)
    if (JSON.stringify(known) !== JSON.stringify(current)) await record(doc, current)
    return notePeak(doc)
  }
  const expected = await expectedValues(doc, fields, register, {
    creation: creationMode(doc)
  })
  if (!register[doc.uuid] || !fields.every(f => f in register[doc.uuid])) await record(doc, expected)
  const mismatches = reservedMismatches(current, expected)
  if (Object.keys(mismatches).length) await restore(doc, mismatches, userId)
  // A rating or a grade lowered does not lower the peak; a higher rating bought raises it
  return notePeak(doc)
}

/** deleteItem / deleteActor: the entry goes with the document, and a character's with those of its items. */
function onDelete(doc) {
  if (!isActiveGM()) return
  const prefix = doc.documentName === "Actor" ? `${doc.uuid}.` : null
  // In the register's turn, after the entry of a document created just before (gm-ledger.js)
  return updateLedger(IMPLANT_REGISTER, register => {
    const gone = Object.keys(register).filter(uuid => uuid === doc.uuid || (prefix && uuid.startsWith(prefix)))
    for (const uuid of gone) delete register[uuid]
    return gone.length ? register : null
  }).catch(e => console.error("SR5 | implant register", e))
}

/** At a gamemaster's arrival: every world character and its items checked against the register. */
export async function reconcileImplantRegister() {
  if (!isActiveGM()) return
  const register = game.settings.get("sr5", IMPLANT_REGISTER) ?? {
  }
  // The implants the register does not know yet, and the entries missing a field added since, are written in one go
  const unknown = {
  }
  const peaks = {
  }
  for (const actor of game.actors) {
    const options = {
      creation: creationMode(actor), firstSight: true
    }
    for (const doc of [actor, ...actor.items]) {
      const fields = reservedFieldsOf(doc)
      if (!fields.length) continue
      const expected = await expectedValues(doc, fields, register, options)
      const entry = register[doc.uuid]
      // A document the register does not know is noted as it stands (expectedValues, firstSight): an implant always,
      // anything else when it is off its defaults, so that a player's later write is checked against it
      const atDefaults = Object.entries(expected).every(([f, v]) => v === RESERVED_DEFAULTS[f])
      if ((!entry && (doc.type === "itemAugmentation" || !atDefaults)) || (entry && !fields.every(f => f in entry))) unknown[doc.uuid] = expected
      // Only what differs from a value the register holds is put back
      const mismatches = reservedMismatches(reservedValues(doc.system, fields), expected)
      if (Object.keys(mismatches).length) await restore(doc, mismatches, null)
      // The cost an implant has at the GM's arrival is the first one he sees (PEAK_COST)
      // At creation, none (inCreation)
      if (doc.type === "itemAugmentation" && !options.creation && nextPeak(entry, doc.system?.essenceCost?.value) !== null) peaks[doc.uuid] = doc.system.essenceCost.value
    }
  }
  if (Object.keys(unknown).length || Object.keys(peaks).length) await updateLedger(IMPLANT_REGISTER, latest => {
    // What the register holds wins; the fields it lacks are added
    for (const [uuid, values] of Object.entries(unknown)) latest[uuid] = {
      ...values, ...(latest[uuid] ?? {
      })
    }
    for (const [uuid, cost] of Object.entries(peaks)) {
      const peak = nextPeak(latest[uuid], cost)
      if (peak !== null) latest[uuid] = {
        ...(latest[uuid] ?? {
        }), [PEAK_COST]: peak
      }
    }
    return latest
  })
}

/**
 * The costs the implants of the world's characters take now, read while the world's creation mode is still in their
 * prepared data (no peak then, inCreation): the peaks they start from when the gamemaster switches that mode off. A
 * character the gamemaster flagged "in creation" stays so: its flag is not touched, its implants keep no peak.
 */
export function costsAtWorldCreationEnd(actors) {
  const costs = {
  }
  for (const actor of actors ?? []) {
    if (actorInCreation(actor)) continue
    for (const item of actor?.items ?? []) {
      if (item?.type !== "itemAugmentation" || item.system?.reversibleEssence) continue
      costs[item.uuid] = Math.round((Number(item.system?.essenceCost?.value) || 0) * 100) / 100
    }
  }
  return costs
}

/** The register with each implant's peak set to `costs`; null when nothing changes. */
export function peaksFromCosts(register, costs) {
  let changed = false
  for (const [uuid, peak] of Object.entries(costs)) {
    if (register[uuid]?.[PEAK_COST] === peak) continue
    register[uuid] = {
      ...(register[uuid] ?? {
      }), [PEAK_COST]: peak
    }
    changed = true
  }
  return changed ? register : null
}

const withImplants = () => [...(game.actors ?? [])].filter(a => a.items?.some?.(i => i.type === "itemAugmentation"))
// Every client prepares its characters again once the peaks the active GM writes at the end of the world's creation
// mode have arrived (the register changed after the mode did)
let peaksPending = false

function prepareAgain() {
  for (const actor of withImplants()) {
    actor.reset()
    if (actor.sheet?.rendered) actor.sheet.render()
  }
}

/**
 * updateSetting, on every client: the gamemaster switched the world's creation mode. Off, the peaks start from the
 * costs of now at once (Clovis, réserve de la relecture 61), not at the next arrival of a GM: the active GM writes them,
 * every client prepares its characters again. On, the characters are prepared again without their peaks.
 */
export async function onWorldCreationModeChange(setting) {
  if (setting?.key === `sr5.${IMPLANT_REGISTER}`) {
    if (peaksPending) {
      peaksPending = false
      prepareAgain()
    }
    return
  }
  if (setting?.key !== "sr5.sr5ShopCreationMode") return
  if (worldCreationMode()) return prepareAgain()
  // Read before anything is prepared again: the prepared costs are still those of the creation mode
  const costs = isActiveGM() ? costsAtWorldCreationEnd(game.actors) : null
  peaksPending = true
  prepareAgain()
  if (costs) await updateLedger(IMPLANT_REGISTER, register => peaksFromCosts(register, costs))
}

export function registerImplantRegisterHooks() {
  const guard = fn => (...args) => Promise.resolve(fn(...args)).catch(e => console.error("SR5 | implant register", e))
  Hooks.on("updateSetting", guard(onWorldCreationModeChange))
  Hooks.on("createSetting", guard(onWorldCreationModeChange))
  Hooks.on("createItem", guard(onCreate))
  Hooks.on("updateItem", guard(onUpdate))
  Hooks.on("updateActor", guard(onUpdate))
  Hooks.on("deleteItem", guard(onDelete))
  Hooks.on("deleteActor", guard(onDelete))
  Hooks.once("ready", guard(reconcileImplantRegister))
}
