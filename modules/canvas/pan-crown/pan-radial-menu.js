// The radial menu of a crown (couronne du PAN, lot 4, decision 5 of DjamZ): a click on an icon lays the Matrix actions
// possible on that device around it, greyed out with their reason when marks are missing; a click on one launches the
// system's own Matrix action test, the target and the device already chosen by the attacker (Q6). The owner switches
// the device's mode (SR5 p. 236, Q7) and slaves it or frees it; the gamemaster keeps "Reveal / Hide" (lot 3).

import {
  SR5
} from "../../config.js"
import {
  menuEntries, modeSwitchCost, modeUpdate, ownModeOf, radialTargetOf, uuidTarget
} from "./pan-actions.js"
import {
  currentViewer, getGraph, setPanReveal, tokenOfNode, revealByPlayer, askPanRevealTo
} from "./pan-crown.js"
import {
  radialColumns
} from "./pan-layout.js"
import {
  contributeActions
} from "./pan-hooks.js"
import {
  switchDeviceMode
} from "./pan-device-switch.js"
import {
  hasDeviceMode
} from "./pan-device-mode.js"
import {
  canTryMatrixAction
} from "../../rolls/roll-prepare-case/rollData-MatrixAction.js"
import {
  SR5_ActorHelper
} from "../../entities/actors/entityActor-helpers.js"
import {
  SR5Combat
} from "../../system/srcombat.js"
import {
  SR5_SocketHandler
} from "../../socket.js"
import {
  monitorOf
} from "./pan-perception-card.js"
import {
  refuseByRule, ruleLockBinds
} from "../../system/rule-locks.js"

const MODE_LABELS = {
  active: "SR5.PanMenuModeActive", silent: "SR5.PanMenuModeSilent", offline: "SR5.PanMenuModeOffline"
}
const MODE_HELPS = {
  active: "SR5.PanMenuModeActive_D", silent: "SR5.PanMenuModeSilent_D", offline: "SR5.PanMenuModeOffline_D"
}
const REASON_LABELS = {
  marks: "SR5.PanMenuReasonMarks",
  owner: "SR5.PanMenuReasonOwner",
  noAntenna: "SR5.PanMenuReasonNoAntenna",
  unknown: "SR5.PanMenuReasonUnknown",
  cannotTry: "SR5.PanMenuReasonCannotTry",
  varies: "SR5.PanMenuReasonVaries",
}

/**
 * Launch a Matrix action of the system against a device chosen on a crown (lot 4, Q6). The token is targeted for
 * the user, as a click on it would, so that every check of the existing test reads it; the device goes in the card's
 * target.itemUuid and the defender is not asked to choose it again.
 * A1 (API pour Matrice v1): without a token, a uuid alone (an actor, a token or an item) names the target, wherever
 * its token stands, or with none at all; the user's targets are then released, so that no other token is read in
 * its place.
 * @param {Object} actor           the attacker
 * @param {String} actionKey       a key of matrix.actions
 * @param {Object} target
 * @param {String} [target.targetTokenId]  the token that carries the device, on the scene shown
 * @param {String} [target.targetUuid]     the device aimed at; none for the persona. Alone, the target itself
 */
export async function rollMatrixActionOn(actor, actionKey, {
  targetTokenId, targetUuid = null
} = {
}){
  const token = targetTokenId ? canvas?.tokens?.get(targetTokenId) : null
  if (actor && token) {
    token.setTarget(true, {
      releaseOthers: true, groupSelection: false
    })
    return actor.rollTest("matrixAction", actionKey, {
      panTarget: {
        tokenId: token.id, itemUuid: targetUuid
      }
    })
  }
  const aimed = actor && !targetTokenId && targetUuid ? uuidTarget(await globalThis.fromUuid?.(targetUuid)) : null
  if (!aimed) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_PanTargetMissing"))
  for (const targeted of Array.from(game.user?.targets ?? [])) targeted.setTarget(false, {
    releaseOthers: false, groupSelection: false
  })
  return actor.rollTest("matrixAction", actionKey, {
    panTarget: {
      actorId: aimed.actor.isToken ? aimed.actor.token.id : aimed.actor.id, itemUuid: aimed.itemUuid
    }
  })
}

/**
 * The entries in the order of the alphabet of their labels.
 * @param {Array} entries
 * @param {Function} labelOf   entry -> label
 * @param {String} [lang]
 */
export function sortedByLabel(entries, labelOf, lang = "fr"){
  return [...entries].sort((a, b) => labelOf(a).localeCompare(labelOf(b), lang, {
    sensitivity: "base"
  }))
}

/**
 * The Matrix condition monitor the menu of an icon shows: the device's own for its owner and the gamemaster, what a
 * Matrix Perception brought back for the others (SR5 p. 237), or nothing.
 * @param {Object} node
 * @param {Object} [options]
 * @param {Function} [options.resolve]   uuid -> document
 * @param {Boolean} [options.isGM]
 * @return {{damage: Number, boxes: Number}|null}
 */
export function menuMonitorOf(node, {
  resolve = uuid => globalThis.fromUuidSync?.(uuid) ?? null, isGM = !!game.user?.isGM
} = {
}){
  const document = node?.uuid ? resolve(node.uuid) : null
  if (document && (isGM || document.isOwner)) {
    const own = monitorOf(document) ?? monitorOf(document.actor)
    if (own) return own
  }
  return node?.intel?.monitor?.boxes > 0 ? node.intel.monitor : null
}

function monitorElement(monitor){
  if (!monitor) return null
  const element = document.createElement("span")
  element.className = "sr5-pan-radial-monitor"
  const damage = Math.min(monitor.damage, monitor.boxes)
  element.dataset.tooltip = game.i18n.format("SR5.PanMenuMonitor", {
    damage, boxes: monitor.boxes
  })
  for (let i = 0; i < monitor.boxes; i++){
    const box = document.createElement("i")
    if (i < damage) box.className = "damaged"
    element.appendChild(box)
  }
  const count = document.createElement("small")
  count.textContent = `${monitor.boxes - damage}/${monitor.boxes}`
  element.appendChild(count)
  return element
}

let openMenu = null
// The token whose crown the open menu belongs to: the menu goes with it (deleted, or another scene shown)
let openMenuTokenId = null

function closeMenu(){
  openMenu?.remove()
  openMenu = null
  openMenuTokenId = null
  document.removeEventListener("pointerdown", onPointerOutside, true)
  document.removeEventListener("keydown", onEscape, true)
}

function onPointerOutside(event){
  if (openMenu && !openMenu.contains(event.target)) closeMenu()
}

function onEscape(event){
  if (event.key !== "Escape" || !openMenu) return
  // Escape closes this menu only, not Foundry's main menu as well
  event.stopPropagation()
  event.preventDefault()
  closeMenu()
}

function reasonOf(entry){
  if (!entry.reason) return ""
  const key = entry.key === "spoofCommand" && entry.reason === "marks" ? "SR5.PanMenuReasonSpoof" : REASON_LABELS[entry.reason]
  return game.i18n.format(key, {
    needed: entry.needed, marks: entry.marks
  })
}

function button(label, {
  tooltip = "", disabled = false, current = false, onClick, key = ""
} = {
}){
  const element = document.createElement("button")
  element.type = "button"
  element.className = "sr5-pan-radial-entry"
  // The key a module reads in sr5.panCrownActions (lot 11)
  if (key) element.dataset.key = key
  if (current) element.classList.add("current")
  element.textContent = label
  if (tooltip) element.dataset.tooltip = tooltip
  // Greyed out, but its reason still shows on hover
  if (disabled) element.setAttribute("aria-disabled", "true")
  else element.addEventListener("click", async event => {
    event.preventDefault()
    closeMenu()
    await onClick?.()
  })
  return element
}

// The entries laid out in their two columns; the whole menu kept on the screen
function layOut(menu, {
  right, left
}){
  const all = [...right.flat(), ...left.flat()]
  for (const entry of all) menu.appendChild(entry)
  const center = menu.querySelector(".sr5-pan-radial-center")
  const step = Math.max(...all.map(e => e.offsetHeight || 0), 22) + 5
  const {
    right: rightAt, left: leftAt
  } = radialColumns({
    right: right.map(f => f.length), left: left.map(f => f.length)
  }, {
    step, minRadius: Math.max(70, (center?.offsetWidth ?? 0) / 2 + 14)
  })
  const set = (entry, {
    x, y
  }, side) => {
    entry.classList.add(side)
    entry.style.left = `${Math.round(side === "left" ? -x : x)}px`
    entry.style.top = `${Math.round(y)}px`
  }
  right.flat().forEach((entry, i) => set(entry, rightAt[i], "right"))
  left.flat().forEach((entry, i) => set(entry, leftAt[i], "left"))

  // Near an edge of the screen, the menu moves in rather than spill over it
  const margin = 8
  const boxes = [center, ...all].filter(Boolean).map(e => e.getBoundingClientRect())
  const box = {
    left: Math.min(...boxes.map(b => b.left)), right: Math.max(...boxes.map(b => b.right)),
    top: Math.min(...boxes.map(b => b.top)), bottom: Math.max(...boxes.map(b => b.bottom)),
  }
  const shift = (low, high, size) => low < margin ? margin - low : high > size - margin ? Math.max(margin - low, size - margin - high) : 0
  const dx = shift(box.left, box.right, window.innerWidth)
  const dy = shift(box.top, box.bottom, window.innerHeight)
  if (dx || dy) {
    menu.style.left = `${parseFloat(menu.style.left) + dx}px`
    menu.style.top = `${parseFloat(menu.style.top) + dy}px`
  }
}

/**
 * Open the radial menu of an icon.
 * @param {Object} data   the payload of the hook sr5.panCrownClickIcon: {token, node, point: {x, y} on the screen}
 */
export function openRadialMenu({
  token, node: clicked, point
} = {
}){
  closeMenu()
  if (!token || !clicked) return
  const viewer = currentViewer()
  const graph = getGraph(token)
  const node = graph?.nodes.find(n => n.uuid === clicked.uuid)
  if (!node || (!node.visibility?.visible && !game.user?.isGM)) return
  // A node a module added (lot 11) has the system's actions only if it asks for them
  const entries = node.contributed && node.systemActions !== true ? {
    actions: [], modes: [], slave: null
  } : menuEntries(node, graph, viewer, {
    canTry: canTryMatrixAction, rigger5: !!game.settings?.get("sr5", "sr5Rigger5Actions"),
    // The "matrix" rule lock lifted (B13): the entries the marks grey out are enabled, the roll tells the gamemaster
    ruleLocked: ruleLockBinds("matrix"),
  })

  // Three families: the Matrix actions on the right; the owner's (mode, PAN) and the gamemaster's on the left
  const buttons = []
  const owners = []
  const gm = []
  // In the order of the alphabet, as they read (séance de DjamZ du 09/10)
  const labelOf = action => game.i18n.localize(SR5.matrixRolledActions[action.key] ?? action.key)
  const actions = sortedByLabel(entries.actions, labelOf, game.i18n.lang)
  for (const action of actions){
    buttons.push(button(game.i18n.localize(SR5.matrixRolledActions[action.key] ?? action.key), {
      key: action.key,
      tooltip: reasonOf(action),
      disabled: !action.enabled,
      onClick: () => rollMatrixActionOn(viewer.actor, action.key, radialTargetOf(node, graph, {
        token: tokenOfNode(node, {
          actor: token.actor, token
        }),
        resolve: uuid => globalThis.fromUuidSync?.(uuid) ?? null,
        actorById: id => game.actors?.get(id) ?? null,
      })),
    }))
  }
  for (const mode of entries.modes){
    // What the mode is, also on the current one, greyed out (séance de DjamZ du 09/10: a "?" and no help)
    const help = game.i18n.localize(MODE_HELPS[mode.mode])
    owners.push(button(game.i18n.localize(MODE_LABELS[mode.mode]), {
      key: `mode-${mode.mode}`, current: mode.current,
      tooltip: mode.current ? `${game.i18n.localize("SR5.PanMenuModeCurrent")} ${help}` : help, disabled: mode.current, onClick: () => switchMode(node, mode.mode, graph)
    }))
  }
  if (entries.slave) owners.push(button(entries.slave.action === "free" ?
    game.i18n.localize("SR5.PanMenuUnslave") :
    game.i18n.format("SR5.PanMenuSlave", {
      master: graph.nodes.find(n => n.uuid === graph.master)?.name ?? ""
    }), {
    key: `pan-${entries.slave.action}`,
    onClick: () => entries.slave.action === "free" ? freeFromPan(node, graph) : slaveToPan(node, graph)
  }))
  // Lot 14: the messaging of a device its holder speaks through (SR5 p. 241), to its owner and the gamemaster
  const commDevice = node.itemType === "itemDevice" && !node.contributed ? globalThis.fromUuidSync?.(node.uuid) ?? null : null
  if (commDevice?.type === "itemDevice" && commDevice.parent && (commDevice.isOwner || game.user?.isGM)) owners.push(button(game.i18n.localize("SR5.COMMCODE_Open"), {
    key: "commcode",
    onClick: async () => (await import("../../interface/commcode-window.js")).SR5CommcodeWindow.openDevice(commDevice.uuid),
  }))
  // The gamemaster's reveal (lot 3), for the whole table; player by player when the world says so (idea 10): he ticks
  // the characters. A device revealed to the whole table keeps its "Hide" first
  const byPlayer = revealByPlayer() && !node.revealed
  if (game.user?.isGM && !node.contributed) gm.push(button(game.i18n.localize(byPlayer ? "SR5.PanCrownRevealTo" :
    node.revealed ? "SR5.PanCrownHide" : "SR5.PanCrownReveal"), {
    key: "reveal",
    tooltip: node.hiddenFromPlayers === undefined ? "" : game.i18n.localize(node.hiddenFromPlayers ? "SR5.PanCrownHiddenFromPlayers" : "SR5.PanCrownSeenByPlayers"),
    onClick: () => byPlayer ? askPanRevealTo(node) : setPanReveal(node, !node.revealed),
  }))

  // Lot 11: the entries of the modules (sr5.panCrownActions), and the system's they grey out
  const describe = (element, group) => ({
    key: element.dataset.key, label: element.textContent, enabled: element.getAttribute("aria-disabled") !== "true",
    tooltip: element.dataset.tooltip ?? "", group
  })
  const {
    greyed, added
  } = contributeActions(node, {
    actor: viewer?.actor ?? null, token: viewer?.token ?? null, isGM: !!game.user?.isGM
  }, [...buttons.map(e => describe(e, "actions")), ...owners.map(e => describe(e, "owner")), ...gm.map(e => describe(e, "gm"))])
  for (const list of [buttons, owners, gm]) list.forEach((element, i) => {
    if (greyed.has(element.dataset.key)) list[i] = button(element.textContent, {
      key: element.dataset.key, tooltip: greyed.get(element.dataset.key), disabled: true
    })
  })
  const modules = added.map(entry => button(entry.label, {
    key: entry.key, tooltip: entry.tooltip, disabled: !entry.enabled,
    onClick: async () => {
      try {
        await entry.onClick({
          token, node, viewer, graph
        })
      } catch (error) {
        console.error(`SR5 | sr5.panCrownActions: the entry "${entry.label}" failed`, error)
      }
    },
  }))

  const menu = document.createElement("nav")
  menu.className = "sr5-pan-radial"
  menu.style.left = `${Math.round(point?.x ?? 0)}px`
  menu.style.top = `${Math.round(point?.y ?? 0)}px`
  const center = document.createElement("strong")
  center.className = "sr5-pan-radial-center"
  center.textContent = node.name
  // The device's Matrix condition monitor, without opening its sheet (séance de DjamZ du 09/10)
  const monitor = monitorElement(menuMonitorOf(node))
  if (monitor) center.appendChild(monitor)
  menu.appendChild(center)
  if (!buttons.length && !owners.length && !gm.length && !modules.length) {
    const empty = document.createElement("span")
    empty.className = "sr5-pan-radial-empty"
    empty.textContent = game.i18n.localize("SR5.PanMenuNoViewer")
    buttons.push(empty)
  }
  for (const entry of gm) entry.classList.add("gm")
  // In the page first: the layout measures the entries
  document.body.appendChild(menu)
  layOut(menu, {
    right: [buttons, modules], left: [owners, gm]
  })
  openMenu = menu
  openMenuTokenId = token.id ?? null
  document.addEventListener("pointerdown", onPointerOutside, true)
  document.addEventListener("keydown", onEscape, true)
}

/**
 * The owner switches a device's mode (SR5 p. 236: silent is a simple action, Q7; the wireless switch costs what it
 * costs on the sheet). The master's silent mode is its user's, the box of the sheet (system.matrix.runningSilent).
 * A device the sheets switch goes their way (pan-device-switch.js): a master left silent on its own item is cleared
 * too, and a second click while the first is written is ignored (relecture, M6).
 */
export async function switchMode(node, mode, graph){
  const item = globalThis.fromUuidSync?.(node.uuid) ?? null
  const holder = item?.parent ?? null
  if (!item || !holder?.isOwner) return void ui.notifications.warn(game.i18n.localize("SR5.WARN_PanNotOwner"))
  if (item.isEmbedded && hasDeviceMode(item)) return switchDeviceMode(item, mode)
  const from = ownModeOf(node)
  const actions = modeSwitchCost(from, mode, turningOn => SR5_ActorHelper.wirelessSwitchActionType(turningOn,
    game.settings.get("sr5", "sr5WifiRequiresDNI"), holder.system?.hasDNI))
  if (!SR5Combat.hasActionsLeft(holder, actions)) return
  if (node.kind === "master" || node.uuid === graph?.master) {
    await holder.update({
      "system.matrix.runningSilent": mode === "silent"
    })
    // masterMode reads the item's own box too: left checked, the master would stay silent
    if (item.system?.isSilent) await item.update({
      "system.isSilent": false
    })
  } else await item.update(modeUpdate(mode))
  if (actions.length) await SR5Combat.changeActionInCombat(holder.isToken ? holder.token.id : holder.id, actions)
}

// The PAN's owner takes a slave out, or its holder takes it back: the sheet's own path (entityActor-helpers.js)
async function freeFromPan(node, graph){
  const index = masterItemOf(graph)?.system?.pan?.content?.findIndex(p => p.uuid === node.uuid)
  const data = {
    targetItem: node.uuid, actorId: graph.owner.id, index: index >= 0 ? index : null
  }
  if (game.user?.isGM) return SR5_ActorHelper.deleteItemFromPan(data.targetItem, data.actorId, data.index)
  return SR5_SocketHandler.emitForGM("deleteItemFromPan", data)
}

// The owner slaves one of her devices to her PAN, within its Device Rating x 3 (SR5 p. 233), the sheet's own path
async function slaveToPan(node, graph){
  const pan = masterItemOf(graph)?.system?.pan
  // The "matrix" rule lock lifted (B13), the PAN grows past it, and the gamemaster hears of it
  if (pan && Number(pan.current) >= Number(pan.max) && refuseByRule("matrix", "SR5.INFO_PanFullOf", {
    actor: graph.owner.name
  }, {
    actor: graph.owner, level: "info"
  })) return
  if (game.user?.isGM) return SR5_ActorHelper.addItemtoPan(node.uuid, graph.owner.id)
  return SR5_SocketHandler.emitForGM("addItemToPan", {
    targetItem: node.uuid, actorId: graph.owner.id
  })
}

function masterItemOf(graph){
  return graph?.master ? (globalThis.fromUuidSync?.(graph.master) ?? null) : null
}

/** Close the radial menu if it belongs to this token's crown (the token was deleted) */
export function closeRadialMenuOf(tokenId){
  if (openMenu && openMenuTokenId === tokenId) closeMenu()
}

export {
  closeMenu as closeRadialMenu
}
