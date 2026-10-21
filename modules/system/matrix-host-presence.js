// S3 (ticket 4 d'Adrore, 16/10): being inside a host, the book's rule, with no scene of its own.
// - SR5 p. 240: Enter / Exit Host, a complex action with no test; entering asks for one mark on the host (or its owner,
//   or an administrator, KC p. 51), anyone may leave. One host at a time: entering another leaves the first.
// - SR5 p. 248: inside, one sees and touches the inside only.
// - SR5 p. 249: the GOD does not track a persona inside a host; at convergence inside, the host puts three marks and
//   launches IC: the persona is NOT ejected (Adrore, 16/10: « la convergence n'éjecte pas du serveur »). Leaving after
//   the convergence, the demi-GOD converges at once: the gamemaster is told.
// - A reboot, and so a jack out (SR5 p. 244, matrix.js jackOut), leaves the host.
// The field system.matrix.currentHost holds the uuid of the host's instance (an unlinked token's, S0); userGrid is
// "host" inside and goes back to the grid of before (gridBeforeHost) on leaving. The hook sr5.matrixHostChanged
// (actor, host, previous, reason) tells the modules (C1 of the cahier, reason: enter, exit, reboot, jackOut).
// Pure rules first, with no Foundry in them, so that tests can read them.

export const HOST_CHANGED_HOOK = "sr5.matrixHostChanged"
export const HOST_EXIT_REASONS = ["exit", "reboot", "jackOut"]
// SR5 p. 233: the convergence at 40, the world's threshold (convergence-threshold.js)
export const CONVERGENCE_SCORE = 40

import {
  convergenceThreshold
} from "./convergence-threshold.js"

import {
  isSceneryDevice
} from "./pan-candidates.js"

const isHost = actor => actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "host"

/** The ids an actor answers to in marks: its token's for an unlinked token, else its own (matrix-ownership.js) */
export function markIdsOf(actor){
  return [actor?.isToken ? actor.token?.id : actor?.id].filter(Boolean)
}

/**
 * The marks the persona has on the host: those the host's device carries under the persona's id, or, for want of
 * reading them, those the persona's own record keeps (markedItems, by the uuid of the host's device)
 * @param {Object} persona
 * @param {Object} host
 * @return {Number}
 */
export function marksOnHost(persona, host){
  const ids = markIdsOf(persona)
  const devices = [...(host?.items ?? [])].filter(i => i.type === "itemDevice")
  const carried = devices.flatMap(d => d.system?.marks ?? []).filter(m => ids.includes(m.ownerId))
    .reduce((sum, m) => Math.max(sum, Number(m.value) || 0), 0)
  const uuids = new Set(devices.map(d => d.uuid).filter(Boolean))
  if (host?.uuid) uuids.add(host.uuid)
  const recorded = [...(persona?.system?.matrix?.markedItems ?? []), ...[...(persona?.items ?? [])].flatMap(i => i.system?.markedItems ?? [])]
    .filter(m => uuids.has(m.uuid)).reduce((sum, m) => Math.max(sum, Number(m.value) || 0), 0)
  return Math.max(carried, recorded)
}

/**
 * Can the persona enter the host (SR5 p. 240)?
 * @param {Object} options
 * @param {Object} options.host          the host
 * @param {String} options.current       the uuid of the host the persona is in, or ""
 * @param {Number} options.marks         its marks on the host
 * @param {Boolean} options.owner        it owns the host, or administers it (KC p. 51)
 * @return {"ok"|"notHost"|"already"|"noMark"}
 */
export function hostEntryCheck({
  host, current = "", marks = 0, owner = false
} = {
}){
  if (!isHost(host)) return "notHost"
  if (current && current === host.uuid) return "already"
  if (!owner && !(marks >= 1)) return "noMark"
  return "ok"
}

/** The update that puts a persona inside a host: the grid of before is kept, even when it leaves another host first */
export function enterHostUpdate(matrix = {
}, hostUuid){
  const before = matrix.currentHost ? (matrix.gridBeforeHost || "local") : (matrix.userGrid && matrix.userGrid !== "host" ? matrix.userGrid : "local")
  return {
    "system.matrix.currentHost": hostUuid,
    "system.matrix.gridBeforeHost": before,
    "system.matrix.userGrid": "host",
  }
}

/** The update that takes a persona out of its host, back to the grid of before; null when it is in none */
export function exitHostUpdate(matrix = {
}){
  if (!matrix.currentHost && matrix.userGrid !== "host") return null
  return {
    "system.matrix.currentHost": "",
    "system.matrix.gridBeforeHost": "",
    "system.matrix.userGrid": matrix.gridBeforeHost || "local",
  }
}

/** The same, on a copy of system.matrix (rebootDeck writes the whole system) */
export function exitHostInPlace(matrix){
  const update = exitHostUpdate(matrix)
  if (!update) return false
  matrix.currentHost = ""
  matrix.gridBeforeHost = ""
  matrix.userGrid = update["system.matrix.userGrid"]
  return true
}

/**
 * Where an icon stands for the eyes of a persona (SR5 p. 248): the uuid of the host it is inside ("inside"), the host
 * itself and the devices slaved to it, seen from inside it and from the grid ("both"), or the grid.
 * @param {Object} actor                   the actor of the icon
 * @param {Function} resolve               uuid -> document
 * @return {{side: "inside"|"both"|"grid", host: String|null}}
 */
export function hostSideOf(actor, resolve = () => null){
  const matrix = actor?.system?.matrix ?? {
  }
  if (isHost(actor)) return {
    side: "both", host: actor.uuid ?? null
  }
  if (actor?.type === "actorDevice" && matrix.deviceType === "ice") return matrix.hostUuid ? {
    side: "inside", host: matrix.hostUuid
  } : {
    side: "grid", host: null
  }
  if (matrix.currentHost) return {
    side: "inside", host: matrix.currentHost
  }
  if (isSceneryDevice(actor) && matrix.panMaster) {
    let master = null
    try {
      master = resolve(matrix.panMaster)
    } catch {
      master = null
    }
    const holder = master?.items ? master : master?.parent ?? null
    if (isHost(holder)) return {
      side: "both", host: holder.uuid ?? null
    }
  }
  return {
    side: "grid", host: null
  }
}

/** Does a persona in viewerHost ("" on the grid) see an icon standing there (hostSideOf)? SR5 p. 248 */
export function seenFromHost(viewerHost, {
  side, host
}){
  if (viewerHost) return host === viewerHost
  return side !== "inside"
}

/* -------------------------------------------- */
/*  In Foundry                                  */
/* -------------------------------------------- */

function resolveSync(uuid){
  try {
    return uuid ? (globalThis.fromUuidSync?.(uuid) ?? null) : null
  } catch {
    return null
  }
}

/** The host a persona is in, or null */
export function currentHostOf(actor){
  const host = resolveSync(actor?.system?.matrix?.currentHost)
  return isHost(host) ? host : null
}

/**
 * Put a persona inside a host. Checks the mark (or ownership, or administration), leaves its host first, spends the
 * complex action in combat unless told not to (a module that has paid for it), and tells the table.
 * @param {Object} actor
 * @param {Object|String} hostOrUuid
 * @param {Object} [options]
 * @param {Boolean} [options.spendAction=true]
 * @param {Boolean} [options.force=false]   the gamemaster or a module puts it in without the mark
 * @param {Boolean} [options.chat=true]
 * @return {Promise<Boolean>}
 */
export async function enterHost(actor, hostOrUuid, {
  spendAction = true, force = false, chat = true
} = {
}){
  const host = typeof hostOrUuid === "string" ? resolveSync(hostOrUuid) : hostOrUuid
  if (!actor || !host) return false
  const {
    matrixOwnership, OWNER
  } = await import("./matrix-ownership.js")
  const {
    iceHostOf
  } = await import("./ice-host.js")
  const owner = matrixOwnership(actor, host, {
    speakerId: markIdsOf(actor)[0], resolve: resolveSync, hostOf: iceHostOf, actorById: id => game.actors?.get(id) ?? null,
  }) === OWNER
  const check = hostEntryCheck({
    host, current: actor.system?.matrix?.currentHost ?? "", marks: marksOnHost(actor, host), owner: owner || force,
  })
  if (check === "already") return true
  if (check === "noMark") {
    const text = game.i18n.format("SR5.HostEnterNoMark", {
      host: nameOf(host)
    })
    // The gamemaster arbitrates: her security spider owns the host, which the system does not record (SR5 p. 238)
    const allowed = game.user?.isGM && await foundry.applications.api.DialogV2.confirm({
      window: {
        title: "SR5.MatrixActionEnterOrExitHost"
      }, content: `<p>${text}</p><p>${game.i18n.localize("SR5.HostEnterAnyway")}</p>`, rejectClose: false,
    })
    if (!allowed) {
      if (!game.user?.isGM) ui.notifications.info(text)
      return false
    }
  } else if (check !== "ok") return false
  if (spendAction && !(await spendComplex(actor, "enterOrExitHost"))) return false
  const previous = actor.system.matrix.currentHost || null
  if (previous) Hooks.callAll(HOST_CHANGED_HOOK, actor, null, previous, "exit")
  await actor.update(enterHostUpdate(actor.system.matrix, host.uuid))
  Hooks.callAll(HOST_CHANGED_HOOK, actor, host.uuid, previous, "enter")
  if (chat) await tell(actor, game.i18n.format("SR5.HostEntered", {
    host: nameOf(host)
  }))
  return true
}

/**
 * Take a persona out of its host, back to its grid (SR5 p. 240). After a convergence inside (Overwatch Score 40 or
 * more), the demi-GOD converges at once (SR5 p. 249): the gamemaster is told, the system does not converge by itself.
 * @param {Object} actor
 * @param {Object} [options]
 * @param {String} [options.reason="exit"]
 * @param {Boolean} [options.spendAction]   true for the action Exit Host
 * @param {Boolean} [options.chat=true]
 * @param {Boolean} [options.warn=true]    the gamemaster told of the demi-GOD after a convergence
 * @return {Promise<Boolean>}
 */
export async function exitHost(actor, {
  reason = "exit", spendAction = reason === "exit", chat = true, warn = true
} = {
}){
  const update = exitHostUpdate(actor?.system?.matrix)
  if (!update) return false
  if (spendAction && !(await spendComplex(actor, "enterOrExitHost"))) return false
  const previous = actor.system.matrix.currentHost || null
  const host = resolveSync(previous)
  await actor.update(update)
  Hooks.callAll(HOST_CHANGED_HOOK, actor, null, previous, reason)
  if (chat) await tell(actor, game.i18n.format("SR5.HostLeft", {
    host: host ? nameOf(host) : game.i18n.localize("SR5.HostUnknown")
  }))
  //A module that tracks the demi-GOD itself (Matrice) passes warn: false
  if (warn) warnConvergenceOnExit(actor)
  return true
}

/** SR5 p. 249: leaving a host after the convergence, the demi-GOD converges at once; whispered to the gamemasters */
export function warnConvergenceOnExit(actor){
  if (!((Number(actor?.system?.matrix?.overwatchScore) || 0) >= convergenceThreshold(actor))) return
  const gms = (game.users ?? []).filter(u => u.isGM).map(u => u.id)
  ChatMessage.create({
    whisper: gms, speaker: ChatMessage.getSpeaker({
      actor
    }),
    content: `<p>${game.i18n.format("SR5.HostLeftAfterConvergence", {
      name: actor.isToken ? actor.token.name : actor.name
    })}</p>`,
  })
}

/** The sheet's button: enter a host of the persona's scene (S1), or leave the one it is in */
export async function takeHostPresence(actor){
  if (!actor) return false
  const {
    sceneCandidatesOf
  } = await import("../interface/scene-actors.js")
  const {
    hostChoices
  } = await import("./pan-candidates.js")
  const current = actor.system?.matrix?.currentHost ?? ""
  const hosts = hostChoices(sceneCandidatesOf(actor), actor).filter(h => h.value !== current)
  const here = currentHostOf(actor)
  const options = hosts.map(h => `<option value="${h.value}">${foundry.utils.escapeHTML(h.label)}</option>`).join("")
  const buttons = []
  if (hosts.length) buttons.push({
    action: "enter", label: "SR5.HostEnter", default: true,
    callback: (_event, button) => ({
      action: "enter", host: button.form.elements.host?.value
    })
  })
  if (current) buttons.push({
    action: "exit", label: "SR5.HostExit", default: !hosts.length, callback: () => ({
      action: "exit"
    })
  })
  if (!buttons.length) {
    ui.notifications.info(game.i18n.localize("SR5.HostNoneOnScene"))
    return false
  }
  const content = `${current ? `<p>${game.i18n.format("SR5.HostCurrently", {
    host: here ? foundry.utils.escapeHTML(nameOf(here)) : game.i18n.localize("SR5.HostUnknown")
  })}</p>` : ""}${hosts.length ? `<div class="form-group"><select name="host">${options}</select></div>` : ""}`
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {
      title: "SR5.MatrixActionEnterOrExitHost"
    }, content, buttons, rejectClose: false,
  })
  if (choice?.action === "enter" && choice.host) return enterHost(actor, choice.host)
  if (choice?.action === "exit") return exitHost(actor)
  return false
}

function nameOf(host){
  return host?.isToken ? (host.token?.name ?? host.name) : host?.name
}

async function spendComplex(actor, source){
  const {
    SR5Combat
  } = await import("./srcombat.js")
  const actions = [{
    type: "complex", value: 1, source
  }]
  if (!SR5Combat.hasActionsLeft(actor, actions)) return false
  if (game.combat) await SR5Combat.changeActionInCombat(markIdsOf(actor)[0], actions)
  return true
}

async function tell(actor, text){
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor
    }), content: `<p>${text}</p>`,
  })
}
