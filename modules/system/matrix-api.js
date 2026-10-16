// The public API of the Matrix for the modules (API pour Matrice v1, A11 and A12): game.sr5.matrix. A module puts marks
// and makes the grid converge through the system's own paths (marks of the devices, persona of an AI, PAN master,
// reboot, dumpshock, matrix damage resisted on a card), never by writing the sheets itself. A player's browser asks
// the active GM, who writes: on the target its sender owns at once, on any other only once the GM agrees, as nothing
// on a card stands behind the request. And A5: the hook told once a matrix action is resolved, read only.

// SR5 p. 237: three marks at most on an icon, from one owner
export const MAX_MARKS = 3
// SR5 p. 233: the demigods deal matrix damage of DV 12, resisted normally
export const CONVERGENCE_DAMAGE = 12
// SR5 p. 249: in a host, the host puts three marks on the persona instead
export const HOST_CONVERGENCE_MARKS = 3
// A5, read only: told on the browser that resolves the action
export const MATRIX_ACTION_RESOLVED_HOOK = "sr5.matrixActionResolved"

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
  return isConnectedPersona(on.actor)
}

/** A persona in the Matrix: an active device, or an AI (Data Trails p. 157). The grid converges on nothing else
 * (arbitrage de DjamZ du 08/10 : une persona sans appareil actif ne subit pas la convergence) */
export function isConnectedPersona(actor){
  if (!actor) return false
  if (actor.items?.some?.(i => i.type === "itemDevice" && i.system?.isActive)) return true
  return actor.system?.activeSpecialAttribute === "depth"
}

/**
 * What a convergence does (SR5 p. 233, 249). On the grid: matrix damage DV 12 resisted normally, a forced reboot that
 * erases the marks and brings the Overwatch Score back to 0, dumpshock in VR, the physical location told to the owner
 * of the grid (unless Sneak, VF « Discrétion », runs: SR5 p. 247). In a host: nothing of that, the host puts three marks on the persona and
 * launches IC; the score keeps rising, and the demigods converge the moment the persona leaves the host.
 */
export function convergencePlan({
  inHost = false, stealth = false
} = {
}){
  if (inHost) return {
    damage: 0, reboot: false, marks: HOST_CONVERGENCE_MARKS, located: false
  }
  return {
    damage: CONVERGENCE_DAMAGE, reboot: true, marks: 0, located: !stealth
  }
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
    converge: gmConverge,
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

/**
 * The grid converges on a persona (SR5 p. 233), or the host it is in does (SR5 p. 249): see convergencePlan.
 * @param {Object|String} persona     the actor (or token, or uuid) the demigods converge on
 * @param {Object} [options]
 * @param {Object|String} [options.host]  the host the persona is in, when it is in one
 * @return {Promise<Boolean|String>}  false when nothing is done (no persona, no GM to ask); true once done; "relayed" on
 *                                    a player's browser, the request sent to the active GM
 */
export async function converge(persona, {
  host = null
} = {
}, helpers = null){
  const actor = await actorOf(persona)
  if (!actor) return false
  //S3: a persona inside a host is converged on by its host, and stays inside (SR5 p. 249, Adrore 16/10)
  host ||= actor.system?.matrix?.currentHost || null
  const hostActor = host ? await actorOf(host) : null
  if (host && !hostActor) return false
  const h = helpers ?? await systemHelpers()
  if (!isGM()) {
    if (!activeGM()) {
      ui.notifications?.warn(game.i18n.localize("SR5.WARN_NoActiveGM"))
      return false
    }
    await h.emitForGM("apiConverge", {
      personaUuid: actor.uuid, hostUuid: hostActor?.uuid ?? null
    })
    return "relayed"
  }
  return h.converge(actor, hostActor)
}

// On the GM's browser: the convergence itself
async function gmConverge(actor, hostActor){
  //Not connected (no active device, not an AI): no damage, no reboot, no mark; the GM is told why nothing happened
  if (!isConnectedPersona(actor)) {
    await ChatMessage.create({
      content: `<p>${game.i18n.format("SR5.MatrixConvergenceNotConnected", {
        name: foundry.utils.escapeHTML(String(actor.name ?? ""))
      })}</p>`,
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    })
    return false
  }
  const plan = convergencePlan({
    inHost: !!hostActor, stealth: !!actor.system?.matrix?.programs?.sneak?.isActive
  })
  //A persona with no active device (turned off, a persona offline) carries no mark: placeMarks then puts none. A sprite
  //has its own active device and takes them (measured on the 30009, 07/10)
  const placed = plan.marks ? await placeMarks(hostActor, actor, plan.marks, {
    source: "convergence"
  }) === true : false
  if (plan.damage) await postConvergenceCard(actor, plan.damage)
  //The reboot erases the marks, brings the score back to 0 and deals dumpshock in VR (entityActor.js)
  if (plan.reboot && typeof actor.rebootDeck === "function") await actor.rebootDeck()
  await whisperConvergence(actor, hostActor, plan, placed)
  return true
}

/** The lines the GM is whispered after a convergence, [key, data] each: in a host, whether its marks were put or not */
export function convergenceLines({
  name, host = null, plan, placed = false, sprite = false
}){
  const lines = []
  if (host) lines.push([placed ? "SR5.MatrixConvergenceHost" : "SR5.MatrixConvergenceHostNoMark", {
    name, host, marks: plan.marks
  }])
  else {
    lines.push(["SR5.MatrixConvergenceGrid", {
      name, damage: plan.damage
    }])
    lines.push([plan.located ? "SR5.MatrixConvergenceLocated" : "SR5.MatrixConvergenceStealth"])
  }
  if (sprite) lines.push(["SR5.MatrixConvergenceSprite"])
  return lines
}

/** The card of the demigods: the matrix damage to resist, as a data bomb's (file-actions.js), the GM's card */
async function postConvergenceCard(actor, damage){
  const [{
    SR5_PrepareRollTest
  }, {
    SR5_RollTest
  }, {
    SR5_RollMessage
  }] = await Promise.all([import("../rolls/roll-prepare.js"), import("../rolls/roll-test.js"), import("../rolls/roll-message.js")])
  const rollData = SR5_PrepareRollTest.getBaseRollData(null, actor)
  rollData.test.type = "falseTest"
  rollData.test.title = game.i18n.localize("SR5.MatrixConvergence")
  rollData.edge.canUseEdge = false
  rollData.roll = {
    rollMode: game.settings.get("core", "rollMode")
  }
  const device = actor.items?.find(i => i.type === "itemDevice" && i.system.isActive)
  if (device) rollData.target.itemUuid = device.uuid
  rollData.damage.matrix.value = damage
  rollData.damage.matrix.base = damage
  //Its reboot throws the character out with dumpshock: a deck it bricks deals none again (matrix.js, miscellaneous.js)
  rollData.damage.convergence = true
  rollData.chatCard.buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize("SR5.TakeOnDamageMatrix")} (${damage})`)
  return SR5_RollTest.renderRollCard(rollData)
}

/** What the GM must play himself: the location told, the IC launched, a sprite that vanishes (SR5 p. 233, 249, 256) */
async function whisperConvergence(actor, hostActor, plan, placed){
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""))
  const lines = convergenceLines({
    name: esc(actor.name), host: hostActor ? esc(hostActor.name) : null, plan, placed, sprite: actor.type === "actorSprite"
  }).map(([key, data]) => data ? game.i18n.format(key, data) : game.i18n.localize(key))
  await ChatMessage.create({
    content: lines.map(l => `<p>${l}</p>`).join(""),
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
  })
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

export async function _socketConverge(message, senderId){
  const sender = game.users.get(senderId), data = message?.data ?? {
  }
  const actor = await actorOf(data.personaUuid), hostActor = data.hostUuid ? await actorOf(data.hostUuid) : null
  if (!sender || !actor || (data.hostUuid && !hostActor)) return false
  const what = game.i18n.format("SR5.MatrixApiConfirmConverge", {
    name: foundry.utils.escapeHTML(actor.name)
  })
  if (!(await agreed(sender, [actor], what))) return false
  return converge(actor, {
    host: hostActor
  })
}

/* -------------------------------------------- */
/*  A5: a matrix action resolved                 */
/* -------------------------------------------- */

/**
 * The payload of sr5.matrixActionResolved: a copy, so that a subscriber changes nothing of the card.
 * @param {Object} entry
 * @param {Object} entry.actor        the actor who acted
 * @param {Object} entry.card         the data of the card that resolves it (the defense card, or the action card)
 * @param {Object} [entry.target]     the actor who defended, or null
 * @param {Number} entry.successes    the hits of the actor who acted
 * @param {Number} entry.netHits      its net hits (over the defense, or over the threshold); 0 or less: failed
 * @param {Number} [entry.marksPlaced] the marks the actor wins on the target (the card's button puts them)
 * @param {Number} [entry.defenderMarks] the marks the defender wins on the actor (a failed Sleaze action, SR5 p. 232)
 */
export function matrixActionPayload({
  actor, card, target = null, successes, netHits, marksPlaced = 0, defenderMarks = 0
}){
  const copy = (globalThis.foundry?.utils?.deepClone ?? structuredClone)(card ?? {
  })
  return {
    actor, key: copy.test?.typeSub ?? null, target, successes: Number(successes) || 0, netHits: Number(netHits) || 0,
    marksPlaced: Number(marksPlaced) || 0, defenderMarks: Number(defenderMarks) || 0, itemUuid: copy.target?.itemUuid ?? null,
    refreshed: !!card?.matrix?.resolvedAnnounced, card: copy,
  }
}

/**
 * Tell the modules a matrix action is resolved, on this browser. Called again when the card is rolled again (Second
 * Chance, Push the Limit): `refreshed` is then true. A subscriber that fails is logged and the others go on.
 */
export function announceMatrixAction(entry, call = (...args) => globalThis.Hooks?.callAll(...args)){
  //Told, never in the way: whatever fails here, the card of the roll is posted as the system builds it
  try {
    const payload = matrixActionPayload(entry)
    if (entry.card?.matrix) entry.card.matrix.resolvedAnnounced = true
    //Hooks.callAll logs a subscriber that fails, and calls the next
    call(MATRIX_ACTION_RESOLVED_HOOK, payload)
    return payload
  } catch (error) {
    console.error(`SR5 | ${MATRIX_ACTION_RESOLVED_HOOK}`, error)
    return null
  }
}

// S3: being inside a host (matrix-host-presence.js), loaded when called
const presence = () => import("./matrix-host-presence.js")

export const SR5MatrixApi = {
  placeMarks: (attacker, target, count, options) => placeMarks(attacker, target, count, options),
  converge: (persona, options) => converge(persona, options),
  /** Put a persona inside a host (SR5 p. 240): options {spendAction = true, force = false, chat = true} */
  enterHost: async (persona, host, options) => (await presence()).enterHost(await actorOf(persona), await actorOf(host), options),
  /** Take a persona out of its host: options {reason = "exit", spendAction, chat = true} */
  exitHost: async (persona, options) => (await presence()).exitHost(await actorOf(persona), options),
  /** The host a persona is inside, or null */
  currentHost: async persona => (await presence()).currentHostOf(await actorOf(persona)),
}
