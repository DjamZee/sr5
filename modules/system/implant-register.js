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
 * What a document a player created should carry, worked out by the gamemaster: an implant from the body it is
 * installed on, without itself (Chrome Flesh p. 57, 165); anything else, the defaults.
 */
export function expectedAtCreation(doc, fields, {
  creation = false
} = {
}) {
  if (doc?.type === "itemAugmentation" && doc.parent?.items) {
    const others = doc.parent.items.filter(i => i.id !== doc.id)
    return installationFlags({
      items: others
    }, doc.system, {
      creation
    })
  }
  return Object.fromEntries(fields.map(f => [f, RESERVED_DEFAULTS[f]]))
}

/**
 * The values to expect of a document: the register's, or, for a document it does not know yet (saved before it
 * existed, created while no gamemaster was connected), what it holds when that is the default, else what the body
 * gives now.
 */
export function expectedValues(doc, fields, register, options) {
  if (register?.[doc.uuid]) return {
    ...Object.fromEntries(fields.map(f => [f, RESERVED_DEFAULTS[f]])), ...register[doc.uuid]
  }
  const current = reservedValues(doc.system, fields)
  const worked = expectedAtCreation(doc, fields, options)
  return Object.fromEntries(fields.map(f => [f, current[f] === RESERVED_DEFAULTS[f] ? current[f] : (worked[f] ?? RESERVED_DEFAULTS[f])]))
}

const isActiveGM = () => !!game.users?.activeGM?.isSelf
const creationMode = () => game.settings.get("sr5", "sr5ShopCreationMode") === true

// The register is written by one client, the active GM; the writes of a batch are gathered
let pending = {
}
let flushing = null
function record(doc, values) {
  // An implant is always kept: absent, a box a player forged would be worked out again from the body. A quality or a
  // character at its defaults needs no entry
  const atDefaults = values && Object.entries(values).every(([f, v]) => v === RESERVED_DEFAULTS[f])
  pending[doc.uuid] = doc.type !== "itemAugmentation" && atDefaults ? null : values
  flushing ??= Promise.resolve().then(async () => {
    const patch = pending
    pending = {
    }
    flushing = null
    const register = foundry.utils.deepClone(game.settings.get("sr5", IMPLANT_REGISTER) ?? {
    })
    let changed = false
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        if (key in register) changed = delete register[key]
      } else if (JSON.stringify(register[key]) !== JSON.stringify(value)) {
        register[key] = value
        changed = true
      }
    }
    if (changed) await game.settings.set("sr5", IMPLANT_REGISTER, register)
  }).catch(e => console.error("SR5 | implant register", e))
  return flushing
}

/** Puts back on `doc` the reserved values a player changed, and tells the gamemaster. */
async function restore(doc, mismatches, userId) {
  const update = Object.fromEntries(Object.entries(mismatches).map(([f, v]) => [`system.${f}`, v]))
  await doc.update(update)
  const user = game.users.get(userId)?.name ?? userId ?? "?"
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
  const expected = expectedAtCreation(doc, fields, {
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
  const expected = expectedValues(doc, fields, register, {
    creation: creationMode()
  })
  if (!register[doc.uuid]) await record(doc, expected)
  const mismatches = reservedMismatches(current, expected)
  if (Object.keys(mismatches).length) await restore(doc, mismatches, userId)
}

/** deleteItem / deleteActor: the entry goes with the document. */
function onDelete(doc) {
  if (!reservedFieldsOf(doc).length || !isActiveGM()) return
  if (game.settings.get("sr5", IMPLANT_REGISTER)?.[doc.uuid]) record(doc, null)
}

/** At a gamemaster's arrival: every world character and its items checked against the register. */
export async function reconcileImplantRegister() {
  if (!isActiveGM()) return
  const register = game.settings.get("sr5", IMPLANT_REGISTER) ?? {
  }
  const options = {
    creation: creationMode()
  }
  for (const actor of game.actors) {
    for (const doc of [actor, ...actor.items]) {
      const fields = reservedFieldsOf(doc)
      if (!fields.length) continue
      const expected = expectedValues(doc, fields, register, options)
      if (!register[doc.uuid]) record(doc, expected)
      const mismatches = reservedMismatches(reservedValues(doc.system, fields), expected)
      if (Object.keys(mismatches).length) await restore(doc, mismatches, null)
    }
  }
  await flushing
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
