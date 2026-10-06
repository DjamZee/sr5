// The gamemaster's register of a preparation's start and pace (SR5 p. 309, decision G9): when it was made, its
// starting Potency, how long it keeps it full and how fast it loses it. A world setting, which only a gamemaster may
// write, kept by the active GM through the ledger queue (gm-ledger.js).
//
// A player's client refuses to change these fields (hooks/item.js, stripGMOnlyChanges), but a client can be made to
// skip its own checks. So the active GM, who sees every write through the hooks, checks again: a value a player
// changed is put back from the register, and he is told (Victoire's review). A preparation a player makes is read
// against the GM's clock and the book's defaults. Nothing is checked while no gamemaster is connected; at the next
// GM's arrival, what does not match the register is put back. At its first round the register takes the
// preparations made before it as they stand; after that, an unknown one (made while no gamemaster was connected) is
// brought back to the book's reading, and the gamemaster is told (boundedUnknown).
import {
  updateLedger
} from "./gm-ledger.js"

export const PREPARATION_REGISTER = "sr5PreparationRegister"
export const PREPARATION_FIELDS = ["createdAt", "initialPotency", "fullPotencyMultiplier", "decayRate"]

export function registerPreparationRegisterSetting() {
  game.settings.register("sr5", PREPARATION_REGISTER, {
    scope: "world",
    config: false,
    default: {
    },
    type: Object,
  })
}

/** The guarded values a preparation holds now. */
export function preparationValues(system) {
  return Object.fromEntries(PREPARATION_FIELDS.map(f => [f, system?.[f] ?? null]))
}

/**
 * What a preparation a player makes should carry, by the gamemaster's reading: made now, at the Potency it was made
 * with, full for Potency × 2 hours and losing a point an hour (the alchemy roll's own values, thirdparty.js); what
 * slows it is the gamemaster's to set afterwards.
 */
export function expectedAtMaking(system, now) {
  return {
    createdAt: now,
    initialPotency: Number(system?.potency) || 0,
    fullPotencyMultiplier: 2,
    decayRate: "hour",
  }
}

/**
 * A preparation the register does not know, once its first round is done: it can only come from a write the
 * gamemaster did not see (made while none was connected). Brought back to the book's reading (Victoire's review):
 * made no later than now, at no more than its Potency, × 2, losing a point an hour. The gamemaster slows it afterwards
 * if he wants to.
 */
export function boundedUnknown(system, now) {
  const potency = Number(system?.potency) || 0
  const start = typeof system?.createdAt === "number" ? Math.min(system.createdAt, now) : now
  const initial = Number(system?.initialPotency)
  return {
    createdAt: start,
    initialPotency: Number.isFinite(initial) && system?.initialPotency !== null ? Math.min(initial, potency) : potency,
    fullPotencyMultiplier: 2,
    decayRate: "hour",
  }
}

/** The key that tells the register's first round is done: from then on, an unknown preparation is not believed. */
export const REGISTER_STARTED = "__started"

/** The fields whose value differs from the one expected. */
export function preparationMismatches(current, expected) {
  const out = {
  }
  for (const f of PREPARATION_FIELDS) if (expected && f in expected && current?.[f] !== expected[f]) out[f] = expected[f]
  return out
}

const isPreparation = doc => doc?.documentName === "Item" && doc.type === "itemPreparation" && doc.parent instanceof Actor
const isActiveGM = () => !!game.users?.activeGM?.isSelf
const registerNow = () => game.settings.get("sr5", PREPARATION_REGISTER) ?? {
}

function record(uuid, values) {
  return updateLedger(PREPARATION_REGISTER, register => {
    if (values === null) return uuid in register ? (delete register[uuid], register) : null
    if (JSON.stringify(register[uuid]) === JSON.stringify(values)) return null
    register[uuid] = values
    return register
  }).catch(e => console.error("SR5 | preparation register", e))
}

/** Puts back on `doc` the values a player changed, and tells the gamemaster. */
async function restore(doc, mismatches, userId) {
  await doc.update(Object.fromEntries(Object.entries(mismatches).map(([f, v]) => [`system.${f}`, v])))
  const user = game.users.get(userId)?.name ?? game.i18n.localize("SR5.SomePlayer")
  ui.notifications.warn(game.i18n.format("SR5.WARN_PreparationRestored", {
    user, name: doc.name, actor: doc.parent?.name ?? ""
  }), {
    permanent: true
  })
  console.warn(`SR5 | preparation values put back on ${doc.uuid} after a write by ${user}`, mismatches)
}

async function onCreate(doc, _options, userId) {
  if (!isPreparation(doc) || !isActiveGM()) return
  const current = preparationValues(doc.system)
  if (game.users.get(userId)?.isGM) return record(doc.uuid, current)
  const expected = expectedAtMaking(doc.system, game.time.worldTime)
  await record(doc.uuid, expected)
  const mismatches = preparationMismatches(current, expected)
  if (Object.keys(mismatches).length) await restore(doc, mismatches, userId)
}

async function onUpdate(doc, _changes, _options, userId) {
  if (!isPreparation(doc) || !isActiveGM()) return
  const current = preparationValues(doc.system)
  const register = registerNow()
  let known = register[doc.uuid]
  if (game.users.get(userId)?.isGM || (!known && !register[REGISTER_STARTED])) {
    if (JSON.stringify(known) !== JSON.stringify(current)) await record(doc.uuid, current)
    return
  }
  if (!known) {
    known = boundedUnknown(doc.system, game.time.worldTime)
    await record(doc.uuid, known)
  }
  const mismatches = preparationMismatches(current, known)
  if (Object.keys(mismatches).length) await restore(doc, mismatches, userId)
}

function onDelete(doc) {
  if (!isActiveGM()) return
  const prefix = doc?.documentName === "Actor" ? `${doc.uuid}.` : null
  if (!prefix && !isPreparation(doc)) return
  // In the register's turn, after the entry of a preparation made just before
  return updateLedger(PREPARATION_REGISTER, register => {
    const gone = Object.keys(register).filter(uuid => uuid === doc.uuid || (prefix && uuid.startsWith(prefix)))
    for (const uuid of gone) delete register[uuid]
    return gone.length ? register : null
  }).catch(e => console.error("SR5 | preparation register", e))
}

/** At a gamemaster's arrival: every world character's preparations checked against the register. */
export async function reconcilePreparationRegister() {
  if (!isActiveGM()) return
  const register = registerNow()
  // The first round takes the preparations made before the register as they stand; after it, an unknown one is
  // brought back to the book's reading
  const started = !!register[REGISTER_STARTED]
  const now = game.time.worldTime
  const unknown = {
  }
  for (const actor of game.actors) {
    for (const doc of actor.items) {
      if (doc.type !== "itemPreparation") continue
      const current = preparationValues(doc.system)
      const expected = register[doc.uuid] ?? (started ? boundedUnknown(doc.system, now) : current)
      if (!register[doc.uuid]) unknown[doc.uuid] = expected
      const mismatches = preparationMismatches(current, expected)
      if (Object.keys(mismatches).length) await restore(doc, mismatches, null)
    }
  }
  if (Object.keys(unknown).length || !started) await updateLedger(PREPARATION_REGISTER, latest => ({
    ...unknown, ...latest, [REGISTER_STARTED]: true
  }))
}

export function registerPreparationRegisterHooks() {
  const guard = fn => (...args) => Promise.resolve(fn(...args)).catch(e => console.error("SR5 | preparation register", e))
  Hooks.on("createItem", guard(onCreate))
  Hooks.on("updateItem", guard(onUpdate))
  Hooks.on("deleteItem", guard(onDelete))
  Hooks.on("deleteActor", guard(onDelete))
  Hooks.once("ready", guard(reconcilePreparationRegister))
}
