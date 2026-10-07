// The crown of a PAN in Foundry (couronne du PAN). Lot 1: the public API, game.sr5.panCrown.getGraph(), which
// reads the graph (pan-graph.js) and what the observer sees of it (pan-visibility.js). Lot 2: open and close a
// crown, drawn by the layer of pan-crown-layer.js. Lot 3: the world setting "the gamemaster decides", the
// gamemaster's reveal device by device (flags.sr5.panReveal, written by the gamemaster alone, for the whole table:
// Q4), the observer's own marks, and what the players do not see, for the gamemaster.

import {
  buildPanGraph, hasAntenna, idsOf
} from "./pan-graph.js"
import {
  hiddenFromPlayers, nodeVisibility, pickViewer, viewerMarksOn
} from "./pan-visibility.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"

// A token placeable, a TokenDocument, an Actor, or the id of a token of the canvas or of a world actor
function resolveSubject(subject){
  if (!subject) return {
    actor: null, token: null
  }
  if (typeof subject === "string") {
    const token = canvas?.tokens?.get(subject) ?? null
    return {
      actor: token?.actor ?? game.actors?.get(subject) ?? null, token
    }
  }
  if (subject.documentName === "Actor") return {
    actor: subject, token: tokenOfActor(subject)
  }
  if (subject.documentName === "Token") return {
    actor: subject.actor ?? null, token: subject.object ?? null
  }
  // A token placeable
  if (subject.document?.documentName === "Token") return {
    actor: subject.actor ?? null, token: subject
  }
  return {
    actor: null, token: null
  }
}

// The token of an actor on the canvas: its own for an unlinked token, the first linked one otherwise
function tokenOfActor(actor){
  if (!actor) return null
  if (actor.isToken) return actor.token?.object ?? null
  return canvas?.tokens?.placeables?.find(t => t.document?.actorLink && t.actor?.id === actor.id) ?? null
}

// The token that carries a node: the drone's own token, the crown's token for its own devices, the token of the
// character who carries a slave lent to the PAN
export function tokenOfNode(node, crown){
  const ids = node.droneId ? [node.droneId] : node.holderIds
  if (crown.token && idsOf(crown.actor).some(id => ids.includes(id))) return crown.token
  return canvas?.tokens?.placeables?.find(t => t.actor && idsOf(t.actor).some(id => ids.includes(id))) ?? null
}

// Meters between two tokens of the scene on the canvas, or null (SR5 counts in meters: arbitrage of 24/09)
function distanceInMeters(a, b){
  if (!a || !b || !canvas?.scene || a.scene !== canvas.scene || b.scene !== canvas.scene) return null
  if (a === b) return 0
  const units = canvas.grid.measurePath([a.center, b.center]).distance
  return units * SR5_SystemHelpers.getSceneUnitInMeters(canvas.scene)
}

function isHostActor(actor){
  return actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "host"
}

function holderActorOf(node, crown){
  const ids = node.holderIds
  if (idsOf(crown.actor).some(id => ids.includes(id))) return crown.actor
  return game.actors?.find(a => ids.includes(a.id)) ?? null
}

// What the observer knows from her Matrix Perceptions (lot 5 writes it): flags.sr5.matrixIntel[uuid].spotted
function spottedBy(actor){
  const intel = actor?.flags?.sr5?.matrixIntel ?? {
  }
  return new Set(Object.keys(intel).filter(uuid => intel[uuid]?.spotted))
}

function viewerFrom(options){
  if (options.viewer) {
    const {
      actor, token
    } = resolveSubject(options.viewer)
    return actor ? {
      actor, token, isGM: false
    } : null
  }
  const picked = pickViewer({
    controlled: canvas?.tokens?.controlled, character: game.user?.character
  })
  return {
    actor: picked?.actor ?? null,
    token: picked?.token ?? tokenOfActor(picked?.actor),
    isGM: !!game.user?.isGM,
  }
}

// The world setting of lot 3: "book" (default, SR5 p. 236-238) or "gm" (the gamemaster decides)
export function gmDecides(){
  try {
    return game.settings.get("sr5", "panCrownVisibility") === "gm"
  } catch {
    return false
  }
}

function lookerOf(actor, isGM){
  return {
    isGM,
    ids: idsOf(actor),
    hasAntenna: hasAntenna(actor),
    spotted: spottedBy(actor),
    gmDecides: gmDecides(),
  }
}

// Who may look at a crown for the players, as the gamemaster's client can tell (Q3 lets a player look through any
// token she controls): every non-gamemaster user's assigned character, and the actors she owns that have a token on
// the scene. The gamemaster's purple ring is therefore "no player can see it from any of her characters".
function playerViewers(){
  const viewers = new Map()
  const add = (actor, token) => {
    const key = token?.id ?? actor?.id
    if (actor && key && !viewers.has(key)) viewers.set(key, {
      actor, token: token ?? tokenOfActor(actor)
    })
  }
  const users = (game.users ?? []).filter(u => !u.isGM)
  for (const user of users) add(user.character, null)
  for (const token of canvas?.tokens?.placeables ?? []){
    if (token.actor && users.some(u => token.actor.testUserPermission?.(u, "OWNER"))) add(token.actor, token)
  }
  return [...viewers.values()]
}

function sceneActors(){
  const tokenActors = (canvas?.tokens?.placeables ?? []).map(t => t.actor).filter(a => a?.isToken)
  return [...(game.actors ?? []), ...tokenActors]
}

/**
 * The graph of a crown, each node with what the observer sees of it.
 * @param {Object|String} subject   a token, a TokenDocument, an actor, or an id
 * @param {Object} [options]
 * @param {Object|String} [options.viewer]  look as this token or actor (the gamemaster checking a player's view);
 *                                          by default, the user (Q3: controlled token, else assigned character)
 * @return {Object|null}  the graph of buildPanGraph, with viewer: {name, ids, hasAntenna, isGM} and, on each
 *                        node, distance (meters, or null) and visibility: {visible, reason}
 */
export function getGraph(subject, options = {
}){
  const crown = resolveSubject(subject)
  if (!crown.actor) return null
  const graph = buildPanGraph(crown.actor, {
    resolve: uuid => globalThis.fromUuidSync?.(uuid) ?? null,
    actors: sceneActors(),
  })
  const viewer = viewerFrom(options)
  const looker = lookerOf(viewer?.actor, !!viewer?.isGM)
  graph.viewer = {
    name: viewer?.actor?.name ?? null, ids: looker.ids, hasAntenna: looker.hasAntenna, isGM: looker.isGM,
    gmDecides: looker.gmDecides
  }
  // The gamemaster's purple ring (lot 3): what no player sees
  const players = looker.isGM ? playerViewers().map(p => ({
    token: p.token, looker: lookerOf(p.actor, false)
  })) : null
  for (const node of graph.nodes){
    const nodeToken = tokenOfNode(node, crown)
    const isHost = isHostActor(holderActorOf(node, crown))
    node.distance = distanceInMeters(viewer?.token, nodeToken)
    node.visibility = nodeVisibility(node, looker, {
      distance: node.distance, isHost
    })
    // The observer's own marks on it, which she alone sees (SR5 p. 238)
    node.viewerMarks = viewerMarksOn(node, looker.ids)
    if (players) node.hiddenFromPlayers = hiddenFromPlayers(players.map(p => nodeVisibility(node, p.looker, {
      distance: distanceInMeters(p.token, nodeToken), isHost
    })))
  }
  return graph
}

// The items and the deployed drone a node reads its reveal from (pan-graph.js, nodeOf)
function revealSourcesOf(node){
  const item = globalThis.fromUuidSync?.(node.uuid) ?? null
  const drone = node.droneId ? (canvas?.tokens?.get(node.droneId)?.actor ?? game.actors?.get(node.droneId) ?? null) : null
  return [item, drone]
}

/**
 * Reveal a device to the whole table, or hide it again (lot 3, Q4). The gamemaster alone writes it.
 * @param {Object} node       a node of getGraph
 * @param {Boolean} revealed
 */
export async function setPanReveal(node, revealed){
  if (!game.user?.isGM || !node?.uuid) return
  const [item, drone] = revealSourcesOf(node)
  if (!item) return
  if (revealed) return item.setFlag("sr5", "panReveal", true)
  // Hidden again: from the item and from the drone that may carry it too
  for (const document of [item, drone]){
    if (document?.flags?.sr5?.panReveal !== undefined) await document.unsetFlag("sr5", "panReveal")
  }
}

let gmMenu = null

function closeGmMenu(){
  gmMenu?.remove()
  gmMenu = null
  document.removeEventListener("pointerdown", onPointerOutside, true)
  document.removeEventListener("keydown", onEscape, true)
}

function onPointerOutside(event){
  if (gmMenu && !gmMenu.contains(event.target)) closeGmMenu()
}

function onEscape(event){
  if (event.key !== "Escape" || !gmMenu) return
  // Escape closes this menu only, not Foundry's main menu as well
  event.stopPropagation()
  event.preventDefault()
  closeGmMenu()
}

/**
 * The gamemaster's small menu on an icon of a crown (lot 3, provisional: the radial menu of lot 4 takes it over):
 * reveal the device to the whole table, or hide it again.
 * @param {Object} data   the payload of the hook sr5.panCrownClickIcon: {token, node, point: {x, y} on the screen}
 */
export function openGmMenu({
  node, point
} = {
}){
  closeGmMenu()
  if (!game.user?.isGM || !node) return
  const menu = document.createElement("nav")
  menu.className = "sr5-pan-gm-menu"
  menu.style.cssText = `position: fixed; left: ${Math.round(point?.x ?? 0) + 8}px; top: ${Math.round(point?.y ?? 0) + 8}px;` +
    "z-index: 1000; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 12rem;" +
    "background: rgba(4, 19, 17, 0.95); border: 1px solid #39f3b1; border-radius: 4px; color: #bfffee;"
  const title = document.createElement("strong")
  title.textContent = node.name
  title.style.cssText = "padding: 2px 4px; border-bottom: 1px solid #39f3b1;"
  menu.appendChild(title)
  if (node.hiddenFromPlayers !== undefined) {
    const state = document.createElement("span")
    state.textContent = game.i18n.localize(node.hiddenFromPlayers ? "SR5.PanCrownHiddenFromPlayers" : "SR5.PanCrownSeenByPlayers")
    state.style.cssText = "padding: 2px 4px; font-size: 0.85em; opacity: 0.8;"
    menu.appendChild(state)
  }
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = game.i18n.localize(node.revealed ? "SR5.PanCrownHide" : "SR5.PanCrownReveal")
  button.addEventListener("click", async () => {
    closeGmMenu()
    await setPanReveal(node, !node.revealed)
  })
  menu.appendChild(button)
  document.body.appendChild(menu)
  gmMenu = menu
  document.addEventListener("pointerdown", onPointerOutside, true)
  document.addEventListener("keydown", onEscape, true)
}

// The token placeable of a subject, for the layer (lot 2)
function tokenOf(subject){
  return resolveSubject(subject).token
}

export const SR5PanCrown = {
  getGraph,
  // Lot 2: open and close the crown of a token on the canvas (layer pan-crown-layer.js)
  toggle: subject => canvas?.sr5PanCrown?.toggle(tokenOf(subject)),
  open: subject => canvas?.sr5PanCrown?.open(tokenOf(subject)),
  close: subject => canvas?.sr5PanCrown?.close(tokenOf(subject)),
  isOpen: subject => !!canvas?.sr5PanCrown?.isOpen(tokenOf(subject)),
  // Lot 3: the gamemaster reveals a node of getGraph to the whole table, or hides it again
  setReveal: setPanReveal,
}
