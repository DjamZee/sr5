// Messages and calls between commcodes (lot 14): the register of the traffic, the requests the players' clients send
// to the gamemaster, and what each client does when the register changes. The rules are in system/commcode-rules.js,
// the window in commcode-window.js.
//
// Who writes: the active gamemaster, as every register of the system (gm-ledger.js). A player's client asks by socket;
// the gamemaster's checks that the sender owns the device it speaks through, that the device can reach the Matrix,
// and writes the entry in its turn. Every client reads the register (a world setting) and shows its own part of it:
// the gamemaster sees everything. Nothing here is hardened against the console (decision of 06/10).

import {
  updateLedger
} from "../system/gm-ledger.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  deviceModeOf
} from "../canvas/pan-crown/pan-device-mode.js"
import {
  realIdOf
} from "../canvas/pan-crown/pan-graph.js"
import {
  snoopHolds
} from "../system/shared-vision.js"
import {
  COMMCODE_SETTING, cleanText, deviceReachability, interceptedBy, isOpen, nextCallStatus, normalizeCommcode,
  pruneEntries, sameCommcode, seenByRecipient, trafficOf
} from "../system/commcode-rules.js"

export const COMMCODE_REFUSALS = ["noDevice", "owner", "noCommcode", "offline", "jammed", "bricked", "noRecipient", "self",
  "empty", "busy", "unknown", "noMark", "gm"]
const DIRECTORY_FLAG = "commcodeDirectory"

/* -------------------------------------------- */
/*  Reading the world                            */
/* -------------------------------------------- */

/** The register, in its shape */
export function readTraffic(){
  try {
    return trafficOf(game.settings.get("sr5", COMMCODE_SETTING))
  } catch {
    return trafficOf(null)
  }
}

/** The world's actors and the unlinked tokens' (a guard, a contact put on a scene are often unlinked) */
function allActors(){
  const tokens = Array.from(game.scenes ?? []).flatMap(scene => Array.from(scene.tokens ?? []))
    .filter(token => !token.actorLink).map(token => token.actor).filter(Boolean)
  return [...Array.from(game.actors ?? []), ...tokens]
}

/** The devices that answer to a commcode */
export function devicesOfCommcode(commcode){
  if (!normalizeCommcode(commcode)) return []
  return allActors().flatMap(actor => Array.from(actor.items ?? [])
    .filter(item => item.type === "itemDevice" && sameCommcode(item.system?.commcode, commcode))
    .map(item => ({
      actor, item
    })))
}

const isJammed = actor => Array.from(actor?.items ?? []).some(i => i.type === "itemEffect" && i.system?.type === "signalJammed" &&
  (Number(i.system?.value) || 0) > 0)

function isBricked(item){
  const monitor = item?.system?.conditionMonitors?.matrix
  return (monitor?.value ?? 0) > 0 && (monitor.actual?.value ?? 0) >= monitor.value
}

/** Can the device send and receive (commcode-rules.js, deviceReachability) */
export function deviceStateOf(item, actor = item?.parent){
  if (!item || !actor) return "offline"
  const panOwner = item.system?.isSlavedToPan ? SR5_EntityHelpers.getRealActorFromID(item.system?.panMaster) : null
  const {
    mode
  } = deviceModeOf(item, {
    actor, panOwner
  })
  return deviceReachability({
    mode, jammed: isJammed(actor), bricked: isBricked(item)
  })
}

const endOf = ({
  actor, item
}) => ({
  deviceUuid: item.uuid, actorUuid: actor.uuid, actorId: realIdOf(actor), actorName: actor.name, deviceName: item.name,
})

/** Does this user speak for the actor (its owner, or a gamemaster) */
export function speaksFor(user, actor){
  return !!user && !!actor && (user.isGM || actor.testUserPermission?.(user, "OWNER") === true)
}

/* -------------------------------------------- */
/*  Asking the gamemaster                        */
/* -------------------------------------------- */

/**
 * Send a request to the active gamemaster, or handle it here when this user is the gamemaster.
 * @param {String} op   "send", "answer", "refuse", "hangup", "line", "snoop", "stopSnoop"
 * @param {Object} data
 */
export async function requestCommcode(op, data = {
}){
  const payload = {
    ...data, op
  }
  if (game.user?.isGM) return handleCommcodeRequest(payload, game.user.id)
  return SR5_SocketHandler.emitForGM("commcodeRequest", payload)
}

function refuse(reason, senderId){
  if (senderId === game.user?.id) return warnRefusal(reason)
  SR5_SocketHandler.emitForPlayer("commcodeRefused", {
    reason
  }, senderId)
}

export function warnRefusal(reason){
  const key = COMMCODE_REFUSALS.includes(reason) ? reason : "unknown"
  ui.notifications?.warn(game.i18n.localize(`SR5.COMMCODE_Refused_${key}`))
}

/** The socket handlers (socket.js) */
export async function _socketCommcodeRequest(message, senderId){
  return handleCommcodeRequest(message.data ?? {
  }, senderId)
}

export async function _socketCommcodeRefused(message){
  warnRefusal(message.data?.reason)
}

/** The device a request speaks through, if this user speaks for its holder */
function deviceOf(uuid, user){
  const item = uuid ? globalThis.fromUuidSync?.(uuid) ?? null : null
  if (item?.type !== "itemDevice" || !item.parent) return {
    error: "noDevice"
  }
  if (!speaksFor(user, item.parent)) return {
    error: "owner"
  }
  return {
    item, actor: item.parent
  }
}

/**
 * The gamemaster's answer to a request. Only the active gamemaster writes the register.
 * @param {Object} data       {op, ...}
 * @param {String} senderId   from the server, never from the message
 */
export async function handleCommcodeRequest(data, senderId){
  if (!game.user?.isActiveGM) return
  const user = game.users?.get(senderId)
  if (!user) return
  switch (data.op) {
    case "send": return send(data, user)
    case "answer":
    case "refuse":
    case "hangup": return callEvent(data, user)
    case "line": return callLine(data, user)
    case "snoop": return startInterception(data, user)
    case "stopSnoop": return stopInterception(data, user)
    default: return refuse("unknown", user.id)
  }
}

async function send(data, user){
  const kind = data.kind === "call" ? "call" : "message"
  const text = cleanText(data.text)
  if (kind === "message" && !text) return refuse("empty", user.id)
  const to = String(data.to ?? "").trim()
  if (!normalizeCommcode(to)) return refuse("noRecipient", user.id)

  // The gamemaster speaks for a commcode that no actor carries (a contact played without a sheet)
  let from
  if (data.asCommcode) {
    if (!user.isGM) return refuse("gm", user.id)
    from = {
      commcode: String(data.asCommcode).trim(), deviceUuid: null, actorUuid: null, actorId: null,
      actorName: String(data.asName ?? "").trim(), deviceName: "", gm: true,
    }
    if (!normalizeCommcode(from.commcode)) return refuse("noCommcode", user.id)
  } else {
    const {
      item, actor, error
    } = deviceOf(data.deviceUuid, user)
    if (error) return refuse(error, user.id)
    if (!normalizeCommcode(item.system?.commcode)) return refuse("noCommcode", user.id)
    const state = deviceStateOf(item, actor)
    if (state !== "online") return refuse(state, user.id)
    from = {
      commcode: String(item.system.commcode).trim(), ...endOf({
        actor, item
      })
    }
  }
  if (sameCommcode(from.commcode, to)) return refuse("self", user.id)

  const targets = devicesOfCommcode(to).filter(d => d.item.uuid !== from.deviceUuid)
  const reachable = targets.filter(d => deviceStateOf(d.item, d.actor) === "online")
  const now = Date.now()
  let status
  if (kind === "message") status = reachable.length || !targets.length ? "delivered" : "pending"
  else status = reachable.length || !targets.length ? "ringing" : "unreachable"

  let busy = false
  await updateLedger(COMMCODE_SETTING, raw => {
    const traffic = trafficOf(raw)
    // One call at a time on a device
    if (kind === "call" && traffic.entries.some(e => isOpen(e) && (sameCommcode(e.from?.commcode, from.commcode) || sameCommcode(e.to?.commcode, from.commcode)))) {
      busy = true
      return null
    }
    traffic.entries.push({
      id: foundry.utils.randomID(), kind, status, text, lines: [], sentAt: now, worldTime: game.time?.worldTime ?? 0,
      deliveredAt: status === "delivered" ? now : null,
      from, to: {
        commcode: to, devices: (reachable.length ? reachable : targets).map(endOf)
      },
    })
    traffic.entries = pruneEntries(traffic.entries)
    return traffic
  })
  if (busy) refuse("busy", user.id)
}

/** The end of a call the user speaks for: "from", "to", or null */
function sideOf(entry, user, wanted){
  const holder = uuid => uuid ? globalThis.fromUuidSync?.(uuid) ?? null : null
  const fromOk = entry.from?.gm ? user.isGM : speaksFor(user, holder(entry.from?.actorUuid))
  const toDevices = entry.to?.devices ?? []
  const toOk = toDevices.length ? toDevices.some(d => speaksFor(user, holder(d.actorUuid))) : user.isGM
  if (wanted === "from") return fromOk ? "from" : null
  if (wanted === "to") return toOk ? "to" : null
  return fromOk ? "from" : (toOk ? "to" : null)
}

async function callEvent(data, user){
  let refused = null
  await updateLedger(COMMCODE_SETTING, raw => {
    const traffic = trafficOf(raw)
    const entry = traffic.entries.find(e => e.id === data.entryId && e.kind === "call")
    if (!entry) {
      refused = "unknown"
      return null
    }
    const side = sideOf(entry, user, data.side)
    if (!side) {
      refused = "owner"
      return null
    }
    const next = nextCallStatus(entry.status, data.op, side)
    // A second click, or the other end hung up meanwhile: nothing to say
    if (!next) return null
    entry.status = next
    if (next === "active") {
      entry.answeredAt = Date.now()
      if (data.deviceUuid) entry.to.answeredBy = data.deviceUuid
    } else entry.endedAt = Date.now()
    return traffic
  })
  if (refused) refuse(refused, user.id)
}

async function callLine(data, user){
  const text = cleanText(data.text, 500)
  if (!text) return
  let refused = null
  await updateLedger(COMMCODE_SETTING, raw => {
    const traffic = trafficOf(raw)
    const entry = traffic.entries.find(e => e.id === data.entryId && e.kind === "call" && e.status === "active")
    if (!entry) {
      refused = "unknown"
      return null
    }
    const side = sideOf(entry, user, data.side)
    if (!side) {
      refused = "owner"
      return null
    }
    entry.lines = [...(entry.lines ?? []), {
      side, text, at: Date.now()
    }].slice(-200)
    return traffic
  })
  if (refused) refuse(refused, user.id)
}

/**
 * A Snoop succeeded (SR5 p. 241): the hacker intercepts the traffic of her target while she keeps a mark on it. The
 * gamemaster checks the mark, as a Snoop through a device's eyes does (shared-vision.js).
 */
async function startInterception(data, user){
  const target = SR5_EntityHelpers.getRealActorFromID(data.targetId)
  const snooper = SR5_EntityHelpers.getRealActorFromID(data.snooperId)
  if (!target || !snooper) return refuse("unknown", user.id)
  if (!speaksFor(user, snooper)) return refuse("owner", user.id)
  if (!snoopHolds(target, data.snooperId)) return refuse("noMark", user.id)
  await updateLedger(COMMCODE_SETTING, raw => {
    const traffic = trafficOf(raw)
    if (traffic.interceptions.some(i => i.snooperId === data.snooperId && i.targetId === data.targetId)) return null
    traffic.interceptions.push({
      id: foundry.utils.randomID(), snooperId: data.snooperId, snooperName: snooper.name, targetId: data.targetId,
      targetName: target.name, since: Date.now(),
    })
    return traffic
  })
  return true
}

async function stopInterception(data, user){
  await updateLedger(COMMCODE_SETTING, raw => {
    const traffic = trafficOf(raw)
    const found = traffic.interceptions.find(i => i.id === data.interceptionId)
    if (!found || !speaksFor(user, SR5_EntityHelpers.getRealActorFromID(found.snooperId))) return null
    traffic.interceptions = traffic.interceptions.filter(i => i !== found)
    return traffic
  })
}

/** Is the snooper's mark still on her target */
export function interceptionHolds(interception){
  const target = SR5_EntityHelpers.getRealActorFromID(interception.targetId)
  return !!target && snoopHolds(target, interception.snooperId)
}

/* -------------------------------------------- */
/*  The world moves: messages waiting, calls cut */
/* -------------------------------------------- */

/**
 * The gamemaster delivers the messages that waited for a device back in reach, and cuts the calls whose end went out
 * of it. Run after any change of an item or an actor, a little later so that a burst of changes runs it once.
 */
export async function settlePending(){
  if (!game.user?.isActiveGM) return
  const traffic = readTraffic()
  // A Snoop whose mark is gone is over: a new mark asks for a new Snoop (SR5 p. 241)
  const lapsed = new Set(traffic.interceptions.filter(i => !interceptionHolds(i)).map(i => i.id))
  if (!lapsed.size && !traffic.entries.some(e => e.status === "pending" || isOpen(e))) return
  const now = Date.now()
  const online = ({
    item, actor
  }) => deviceStateOf(item, actor) === "online"
  const holderOf = uuid => uuid ? globalThis.fromUuidSync?.(uuid) ?? null : null
  await updateLedger(COMMCODE_SETTING, raw => {
    const next = trafficOf(raw)
    let changed = false
    const kept = next.interceptions.filter(i => !lapsed.has(i.id) || interceptionHolds(i))
    if (kept.length !== next.interceptions.length) {
      next.interceptions = kept
      changed = true
    }
    for (const entry of next.entries) {
      if (entry.status === "pending") {
        const reachable = devicesOfCommcode(entry.to?.commcode).filter(d => d.item.uuid !== entry.from?.deviceUuid).filter(online)
        if (!reachable.length) continue
        entry.status = "delivered"
        entry.deliveredAt = now
        entry.to.devices = reachable.map(endOf)
        changed = true
        continue
      }
      if (!isOpen(entry)) continue
      const fromItem = holderOf(entry.from?.deviceUuid)
      const fromLost = !entry.from?.gm && (!fromItem || deviceStateOf(fromItem) !== "online")
      const toUuids = entry.to?.answeredBy ? [entry.to.answeredBy] : (entry.to?.devices ?? []).map(d => d.deviceUuid)
      const toLost = toUuids.length > 0 && !toUuids.some(uuid => {
        const item = holderOf(uuid)
        return item && deviceStateOf(item) === "online"
      })
      if (!fromLost && !toLost) continue
      entry.status = nextCallStatus(entry.status, "cut", "from") ?? entry.status
      entry.endedAt = now
      changed = true
    }
    return changed ? next : null
  })
}

let settleTimer = null
function scheduleSettle(){
  if (!game.user?.isActiveGM) return
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => settlePending().catch(error => console.error("SR5 | commcode", error)), 400)
}

let refreshTimer = null
function scheduleRefresh(){
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(async () => {
    const {
      SR5CommcodeWindow
    } = await import("./commcode-window.js")
    SR5CommcodeWindow.refreshAll()
  }, 300)
}

/* -------------------------------------------- */
/*  Every client: what reached this user         */
/* -------------------------------------------- */

let seen = null
const stateKey = entry => `${entry.status}:${(entry.lines ?? []).length}`

/** The devices of the entry's recipient this user holds (the gamemaster is told otherwise) */
function myDevices(entry, side = "to"){
  const ends = side === "to" ? (entry.to?.devices ?? []) : [entry.from]
  return ends.filter(end => {
    const actor = end?.actorUuid ? globalThis.fromUuidSync?.(end.actorUuid) ?? null : null
    return actor && !game.user.isGM && actor.testUserPermission?.(game.user, "OWNER")
  })
}

function playRing(){
  try {
    foundry.audio.AudioHelper.play({
      src: "sounds/notify.wav", volume: 0.6, autoplay: true, loop: false
    }, false)
  } catch {
    // No sound is no fault
  }
}

async function openFor(deviceUuid, focus){
  const {
    SR5CommcodeWindow
  } = await import("./commcode-window.js")
  return SR5CommcodeWindow.openDevice(deviceUuid, {
    focus
  })
}

/** The register changed: redraw the windows, and tell this user what reached her */
export async function onTrafficChanged(){
  const traffic = readTraffic()
  const previous = seen
  seen = new Map(traffic.entries.map(e => [e.id, stateKey(e)]))
  const {
    SR5CommcodeWindow
  } = await import("./commcode-window.js")
  SR5CommcodeWindow.refreshAll()
  if (!previous) return
  for (const entry of traffic.entries) {
    const before = previous.get(entry.id)
    if (before === stateKey(entry)) continue
    const fresh = !before || before.split(":")[0] !== entry.status
    if (!fresh) continue
    if (game.user.isGM) {
      // The gamemaster sees everything
      if (!before) ui.notifications?.info(game.i18n.format(entry.kind === "call" ? "SR5.COMMCODE_GMCall" : "SR5.COMMCODE_GMMessage", {
        from: entry.from?.actorName || entry.from?.commcode, to: (entry.to?.devices ?? [])[0]?.actorName || entry.to?.commcode,
      }))
      continue
    }
    if (!seenByRecipient(entry)) continue
    const mine = myDevices(entry)
    if (!mine.length) continue
    if (entry.kind === "message" && entry.status === "delivered") {
      playRing()
      await openFor(mine[0].deviceUuid, {
        commcode: entry.from?.commcode
      })
    }
    if (entry.kind === "call" && entry.status === "ringing") {
      playRing()
      await openFor(mine[0].deviceUuid, {
        commcode: entry.from?.commcode
      })
    }
  }
  // The snooper hears the traffic she intercepts
  if (game.user.isGM) return
  for (const {
    interception, entries
  } of mySnoops(traffic)) {
    const fresh = entries.filter(e => !previous.has(e.id))
    if (fresh.length) ui.notifications?.info(game.i18n.format("SR5.COMMCODE_Intercepted", {
      target: interception.targetName
    }))
  }
}

/** The interceptions of the actors this user plays */
export function mySnoops(traffic = readTraffic()){
  const snoopers = new Set(traffic.interceptions.map(i => i.snooperId))
  const result = []
  for (const snooperId of snoopers) {
    const snooper = SR5_EntityHelpers.getRealActorFromID(snooperId)
    if (!snooper || !(game.user.isGM || snooper.testUserPermission?.(game.user, "OWNER"))) continue
    result.push(...interceptedBy(traffic, snooperId, interceptionHolds))
  }
  return result
}

/* -------------------------------------------- */
/*  The character's directory                    */
/* -------------------------------------------- */

export function directoryFlagOf(actor){
  return actor?.getFlag?.("sr5", DIRECTORY_FLAG) ?? []
}

export async function setDirectory(actor, directory){
  if (!actor?.isOwner) return
  return actor.setFlag("sr5", DIRECTORY_FLAG, directory)
}

/* -------------------------------------------- */
/*  Registration                                 */
/* -------------------------------------------- */

export function registerCommcodeHooks(){
  Hooks.once("init", () => {
    game.settings.register("sr5", COMMCODE_SETTING, {
      scope: "world", config: false, type: Object, default: trafficOf(null),
      onChange: () => onTrafficChanged().catch(error => console.error("SR5 | commcode", error)),
    })
    // A key to open the messaging of one's device, unbound by default: no button is added to the toolbars
    game.keybindings.register("sr5", "commcodeOpen", {
      name: "SR5.COMMCODE_Key_T", hint: "SR5.COMMCODE_Key_D", editable: [],
      onDown: () => {
        import("./commcode-window.js").then(({
          SR5CommcodeWindow
        }) => SR5CommcodeWindow.openMine())
        return true
      },
      precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    })
  })
  Hooks.once("ready", () => {
    seen = new Map(readTraffic().entries.map(e => [e.id, stateKey(e)]))
    if (game.sr5) game.sr5.commcode = {
      open: () => import("./commcode-window.js").then(({
        SR5CommcodeWindow
      }) => SR5CommcodeWindow.openMine()),
      openDevice: uuid => openFor(uuid),
    }
    scheduleSettle()
  })
  for (const hook of ["updateItem", "createItem", "deleteItem", "updateActor", "createToken", "deleteToken", "updateToken"]) {
    Hooks.on(hook, scheduleSettle)
    // An open window shows its device's state: switched off, jammed, bricked
    Hooks.on(hook, scheduleRefresh)
  }
}
