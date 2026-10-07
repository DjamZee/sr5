// The public API of the Matrix for the modules (API pour Matrice v1, A11 and A12): game.sr5.matrix. A module puts marks
// and makes the grid converge through the system's own paths (marks of the devices, persona of an AI, PAN master,
// reboot, dumpshock, matrix damage resisted on a card), never by writing the sheets itself. A player's browser asks
// the active GM, who writes: on the target its sender owns at once, on any other only once the GM agrees, as nothing
// on a card stands behind the request. And A5: the hook told once a matrix action is resolved, read only.

// SR5 p. 237: three marks at most on an icon, from one owner
export const MAX_MARKS = 3

/**
 * The number of marks a request puts, or null when it is not one the API takes.
 * @param {Number} count   1 to 3; more is brought back to 3 (SR5 p. 237)
 * @return {Number|null}
 */
export function markCount(count){
  const value = Number(count)
  if (!Number.isInteger(value) || value < 1) return null
  return Math.min(value, MAX_MARKS)
}

/**
 * The actor a module names: an actor, a token (placeable or document), or the uuid of one of them.
 * An item is not an actor: see markTarget.
 */
export async function actorOf(value){
  if (!value) return null
  if (typeof value === "string") value = await fromUuid(value)
  if (!value) return null
  if (value.documentName === "Actor") return value
  if (value.documentName === "Token") return value.actor ?? null
  if (value.document?.documentName === "Token") return value.document.actor ?? null
  return null
}

// The id that names an actor to the system's helpers: its token's for an unlinked token (getRealActorFromID)
export const actorRef = actor => (actor?.isToken ? actor.token?.id : actor?.id) ?? null

/**
 * What a mark lands on: an item (a device, a file) carried by an actor, or an actor (its active device, or the
 * persona of an AI outside any device: SR5_MarkHelpers.markItem decides).
 * @return {{actor: Object, itemUuid: String|null}|null}
 */
export async function markTarget(value){
  if (typeof value === "string") value = await fromUuid(value)
  if (value?.documentName === "Item") return value.parent?.documentName === "Actor" ? {
    actor: value.parent, itemUuid: value.uuid
  } : null
  const actor = await actorOf(value)
  return actor ? {
    actor, itemUuid: null
  } : null
}

/**
 * Whether a mark can land there: an item, an active device of the actor, or the persona of an AI outside any device
 * (Data Trails p. 157). Anything else would be dropped by markItem without a word.
 */
export function markable(on){
  if (!on?.actor) return false
  if (on.itemUuid) return true
  if (on.actor.items?.some?.(i => i.type === "itemDevice" && i.system?.isActive)) return true
  return on.actor.system?.activeSpecialAttribute === "depth"
}

// The system's helpers, loaded when called: the tests give their own
async function systemHelpers(){
  const [{
    SR5_MarkHelpers
  }, {
    SR5_SocketHandler
  }] = await Promise.all([import("../rolls/roll-helpers/mark.js"), import("../socket.js")])
  return {
    markItem: (...args) => SR5_MarkHelpers.markItem(...args),
    emitForGM: (type, data) => SR5_SocketHandler.emitForGM(type, data),
  }
}

const isGM = () => !!game.user?.isGM
const activeGM = () => game.users?.activeGM ?? game.users?.find?.(u => u.isGM && u.active)

/**
 * Put marks of an attacker on a target, through the system's path (SR5_MarkHelpers.markItem): the marks of the device,
 * or of the persona of an AI, the record on the attacker's deck, the PAN master of a slaved device, the tokens of a
 * host. Three marks at most (SR5 p. 237).
 * @param {Object|String} attacker    who puts them: an actor, a token, or the uuid of one
 * @param {Object|String} target      on what: an actor, a token, an item (device, file), or the uuid of one
 * @param {Number} count              1 to 3
 * @param {Object} [options]
 * @param {String} [options.source]   the reason, named in the notification ("convergence"…)
 * @param {Boolean} [options.watchdog] Kill Code p. 45: the marks come from a Watchdog action
 * @return {Promise<Boolean|String>}  false when nothing is put (no attacker, no target, a wrong count, no GM to ask);
 *                                    true once put; "relayed" on a player's browser, the request sent to the active GM
 */
export async function placeMarks(attacker, target, count, options = {
}, helpers = null){
  const marks = markCount(count)
  const by = await actorOf(attacker), on = await markTarget(target)
  if (!marks || !by || !on || !markable(on)) return false
  const h = helpers ?? await systemHelpers()
  if (!isGM()) {
    if (!activeGM()) {
      ui.notifications?.warn(game.i18n.localize("SR5.WARN_NoActiveGM"))
      return false
    }
    await h.emitForGM("apiPlaceMarks", {
      attackerUuid: by.uuid, targetUuid: on.itemUuid ?? on.actor.uuid, count: marks,
      source: options.source ?? "", watchdog: !!options.watchdog,
    })
    return "relayed"
  }
  await h.markItem(actorRef(on.actor), actorRef(by), marks, on.itemUuid ?? undefined, !!options.watchdog)
  ui.notifications?.info(game.i18n.format("SR5.MatrixApiMarksPlaced", {
    attacker: by.name, target: on.actor.name, marks, source: sourceLabel(options.source)
  }))
  return true
}

function sourceLabel(source){
  if (!source) return ""
  const key = `SR5.MatrixApiSource_${source}`
  return game.i18n.has?.(key) ? game.i18n.localize(key) : String(source)
}

/* -------------------------------------------- */
/*  On the GM's browser                          */
/* -------------------------------------------- */

// Nothing on a card stands behind a module's request: the GM writes on what its sender owns, and asks him for the rest
async function agreed(sender, documents, what){
  const {
    ownsTarget
  } = await import("../rolls/roll-helpers/socket-guard.js")
  if (documents.every(d => ownsTarget(sender, d))) return true
  return foundry.applications.api.DialogV2.confirm({
    window: {
      title: game.i18n.localize("SR5.SocketUseConfirmTitle")
    },
    content: `<p>${game.i18n.format("SR5.MatrixApiConfirm", {
      user: foundry.utils.escapeHTML(sender?.name ?? "?"), what
    })}</p>`,
    rejectClose: false,
  })
}

export async function _socketPlaceMarks(message, senderId){
  const sender = game.users.get(senderId), data = message?.data ?? {
  }
  const by = await actorOf(data.attackerUuid), on = await markTarget(data.targetUuid)
  if (!sender || !by || !on || !markCount(data.count)) return false
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""))
  const what = game.i18n.format("SR5.MatrixApiConfirmMarks", {
    attacker: esc(by.name), target: esc(on.actor.name), marks: markCount(data.count)
  })
  if (!(await agreed(sender, [on.actor], what))) return false
  return placeMarks(by, on.itemUuid ?? on.actor, data.count, {
    source: data.source, watchdog: data.watchdog
  })
}

export const SR5MatrixApi = {
  placeMarks: (attacker, target, count, options) => placeMarks(attacker, target, count, options),
}
