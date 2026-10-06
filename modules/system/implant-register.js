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
export async function sourceEntry(doc, resolve = uuid => fromUuid(uuid)) {
  const uuid = [doc?._stats?.compendiumSource, doc?.flags?.core?.sourceId, doc?.flags?.sr5?.shopSource]
    .find(u => typeof u === "string" && u.startsWith("Compendium."))
  if (!uuid) return null
  const source = await resolve(uuid)
  const cost = system => system?.essenceCost ?? {
  }
  const same = source && source.type === doc.type && source.system?.type === doc.system?.type &&
    Number(cost(source.system).base) === Number(cost(doc.system).base) &&
    (cost(source.system).multiplier ?? "") === (cost(doc.system).multiplier ?? "")
  return same ? source : null
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
    return {
      ...installationFlags({
        items: others
      }, doc.system, {
        creation
      }),
      reversibleEssence: !!source?.system?.reversibleEssence,
      // An accessory costs no Essence (entityActor.js): only a compendium entry says so for a player's implant
      isAccessory: !!source?.system?.isAccessory,
    }
  }
  return Object.fromEntries(fields.map(f => [f, RESERVED_DEFAULTS[f]]))
}

/**
 * The values to expect of a document: the register's, or, for a document it does not know yet (saved before it
 * existed, created while no gamemaster was connected), what it holds when that is the default, else what the body
 * gives now. A field the register entry does not hold yet (one added to the reserved fields after the entry was made,
 * isAccessory or reversibleEssence) is taken as the document holds it at the gamemaster's first sight: an accessory
 * entered before is not unticked.
 */
export async function expectedValues(doc, fields, register, options = {
}) {
  const current = reservedValues(doc.system, fields)
  const entry = register?.[doc.uuid]
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
const creationMode = () => game.settings.get("sr5", "sr5ShopCreationMode") === true

// The register is written by one client, the active GM, in its turn on its latest state (gm-ledger.js)
function record(doc, values) {
  // An implant is always kept: absent, a box a player forged would be worked out again from the body. A quality or a
  // character at its defaults needs no entry
  const atDefaults = values && Object.entries(values).every(([f, v]) => v === RESERVED_DEFAULTS[f])
  const value = doc.type !== "itemAugmentation" && atDefaults ? null : values
  return updateLedger(IMPLANT_REGISTER, register => {
    if (value === null) return doc.uuid in register ? (delete register[doc.uuid], register) : null
    if (JSON.stringify(register[doc.uuid]) === JSON.stringify(value)) return null
    register[doc.uuid] = value
    return register
  }).catch(e => console.error("SR5 | implant register", e))
}

/** Puts back on `doc` the reserved values a player changed, and tells the gamemaster. */
async function restore(doc, mismatches, userId) {
  const update = Object.fromEntries(Object.entries(mismatches).map(([f, v]) => [`system.${f}`, v]))
  await doc.update(update)
  const user = game.users.get(userId)?.name ?? game.i18n.localize("SR5.SomePlayer")
  ui.notifications.warn(game.i18n.format("SR5.WARN_GMOnlyFieldRestored", {
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
  if (game.users.get(userId)?.isGM) return record(doc, current)
  const expected = await expectedAtCreation(doc, fields, {
    creation: creationMode()
  })
  const mismatches = reservedMismatches(current, expected)
  await record(doc, expected)
  if (Object.keys(mismatches).length) await restore(doc, mismatches, userId)
}

/** updateItem / updateActor: a gamemaster's write is recorded; a player's change is put back. */
async function onUpdate(doc, _changes, _options, userId) {
  const fields = reservedFieldsOf(doc)
  if (!fields.length || !isActiveGM()) return
  const current = reservedValues(doc.system, fields)
  const register = game.settings.get("sr5", IMPLANT_REGISTER) ?? {
  }
  if (game.users.get(userId)?.isGM) {
    const atDefaults = Object.entries(current).every(([f, v]) => v === RESERVED_DEFAULTS[f])
    const known = register[doc.uuid] ?? (doc.type !== "itemAugmentation" && atDefaults ? current : null)
    if (JSON.stringify(known) !== JSON.stringify(current)) await record(doc, current)
    return
  }
  const expected = await expectedValues(doc, fields, register, {
    creation: creationMode()
  })
  if (!register[doc.uuid] || !fields.every(f => f in register[doc.uuid])) await record(doc, expected)
  const mismatches = reservedMismatches(current, expected)
  if (Object.keys(mismatches).length) await restore(doc, mismatches, userId)
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
  const options = {
    creation: creationMode(), firstSight: true
  }
  // The implants the register does not know yet, and the entries missing a field added since, are written in one go
  const unknown = {
  }
  for (const actor of game.actors) {
    for (const doc of [actor, ...actor.items]) {
      const fields = reservedFieldsOf(doc)
      if (!fields.length) continue
      const expected = await expectedValues(doc, fields, register, options)
      const entry = register[doc.uuid]
      if ((!entry && doc.type === "itemAugmentation") || (entry && !fields.every(f => f in entry))) unknown[doc.uuid] = expected
      const mismatches = reservedMismatches(reservedValues(doc.system, fields), expected)
      if (Object.keys(mismatches).length) await restore(doc, mismatches, null)
    }
  }
  if (Object.keys(unknown).length) await updateLedger(IMPLANT_REGISTER, latest => {
    // What the register holds wins; the fields it lacks are added
    for (const [uuid, values] of Object.entries(unknown)) latest[uuid] = {
      ...values, ...(latest[uuid] ?? {
      })
    }
    return latest
  })
}

export function registerImplantRegisterHooks() {
  const guard = fn => (...args) => Promise.resolve(fn(...args)).catch(e => console.error("SR5 | implant register", e))
  Hooks.on("createItem", guard(onCreate))
  Hooks.on("updateItem", guard(onUpdate))
  Hooks.on("updateActor", guard(onUpdate))
  Hooks.on("deleteItem", guard(onDelete))
  Hooks.on("deleteActor", guard(onDelete))
  Hooks.once("ready", guard(reconcileImplantRegister))
}
