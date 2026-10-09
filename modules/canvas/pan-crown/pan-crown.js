// The crown of a PAN in Foundry (couronne du PAN). Lot 1: the public API, game.sr5.panCrown.getGraph(), which
// reads the graph (pan-graph.js) and what the observer sees of it (pan-visibility.js). Lot 2: open and close a
// crown, drawn by the layer of pan-crown-layer.js. Lot 3: the world setting "the gamemaster decides", the
// gamemaster's reveal device by device (flags.sr5.panReveal, written by the gamemaster alone, for the whole table:
// Q4), the observer's own marks, and what the players do not see, for the gamemaster. Lot 4: the radial menu of an
// icon (pan-radial-menu.js), which also holds the gamemaster's reveal. Lot 11: the hooks for the modules
// (pan-hooks.js), registerIcon and refresh.

import {
  PAN_TOKEN_KINDS, buildPanGraph, hasAntenna, hasCommDevice, idsOf
} from "./pan-graph.js"
import {
  hiddenFromPlayers, isMatrixScene, nodeVisibility, pickViewer, viewerMarksOn
} from "./pan-visibility.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  rollMatrixActionOn
} from "./pan-radial-menu.js"
import {
  intelFor, spottedUuids
} from "./pan-perception.js"
import {
  applyVisibilityHooks, contributeToGraph
} from "./pan-hooks.js"
import {
  registerPanIcon
} from "./pan-icons.js"

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

// Meters between two tokens of the scene on the canvas, or null (SR5 counts in meters: arbitrage of 24/09). On a
// scene marked as the inside of a host (A2), there is no distance: 0, so that the 100 m of p. 236 never hide an icon
function distanceInMeters(a, b){
  if (!a || !b || !canvas?.scene || a.scene !== canvas.scene || b.scene !== canvas.scene) return null
  if (a === b || isMatrixScene(canvas.scene)) return 0
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

// What the observer knows from her Matrix Perceptions (lot 5 writes it, pan-perception-card.js): the register
// flags.sr5.matrixIntel, one entry per icon {uuid, spotted, monitor, marks}
function intelOf(actor){
  return actor?.flags?.sr5?.matrixIntel ?? {
  }
}

function spottedBy(actor){
  return new Set(spottedUuids(intelOf(actor)))
}

/** The user who looks at the crowns (Q3: her controlled token, else her assigned character), for the radial menu */
export function currentViewer(){
  return viewerFrom({
  })
}

/**
 * May the user open the crown of a token she does not own, by the HUD button (séance de DjamZ du 09/10)? A token she
 * sees, while she looks through a character who carries a commlink, a cyberdeck or a rigger command console. What the
 * crown shows her follows the setting "PAN crowns visibility", as any crown.
 * @param {Object} token    a Token of the canvas
 * @param {Object} [viewer] {actor} of currentViewer()
 */
export function playerMayOpenPan(token, viewer = currentViewer()){
  if (!token?.actor || token.actor.type === "actorStorage" || !token.visible) return false
  return hasCommDevice(viewer?.actor)
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
// the scene. The gamemaster's yellow ring (purple before lot 8) is therefore "no player can see it from any of her characters".
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
  // Lot 11: the nodes and lines of the modules (sr5.panCrownGraph), added to what the system builds
  const crownContext = {
    token: crown.token ?? null, actor: crown.actor
  }
  contributeToGraph(graph, crownContext)
  const viewer = viewerFrom(options)
  const looker = lookerOf(viewer?.actor, !!viewer?.isGM)
  graph.viewer = {
    name: viewer?.actor?.name ?? null, ids: looker.ids, hasAntenna: looker.hasAntenna, isGM: looker.isGM,
    gmDecides: looker.gmDecides
  }
  // The gamemaster's yellow ring (lot 3, yellow since lot 8): what no player sees
  const players = looker.isGM ? playerViewers().map(p => ({
    actor: p.actor, token: p.token, looker: lookerOf(p.actor, false)
  })) : null
  for (const node of graph.nodes){
    // A sprite stands where its technomancer stands (SR5 p. 256): measured from her token (anchorIds)
    const nodeToken = tokenOfNode(node.anchorIds ? {
      holderIds: node.anchorIds
    } : node, crown)
    const isHost = isHostActor(holderActorOf(node, crown))
    // A drone, a rigger, a master or a device of the scenery is a line to its token (lot 7): none to a hidden token
    const tokenHidden = PAN_TOKEN_KINDS.includes(node.kind) && nodeToken !== crown.token && nodeToken?.document?.hidden === true
    node.distance = distanceInMeters(viewer?.token, nodeToken)
    // Lot 11: a module may hide it (sr5.panCrownVisibility), never show what the system hides
    node.visibility = applyVisibilityHooks(node, {
      actor: viewer?.actor ?? null, token: viewer?.token ?? null, isGM: looker.isGM, ids: looker.ids
    }, nodeVisibility(node, looker, {
      distance: node.distance, isHost, tokenHidden
    }), crownContext)
    // The observer's own marks on it, which she alone sees (SR5 p. 238)
    node.viewerMarks = viewerMarksOn(node, looker.ids)
    // What her Matrix Perceptions brought back that the crown draws: the monitor, the number of marks (lot 5)
    node.intel = intelFor(intelOf(viewer?.actor), node.uuid)
    if (players) node.hiddenFromPlayers = hiddenFromPlayers(players.map(p => applyVisibilityHooks(node, {
      actor: p.actor, token: p.token ?? null, isGM: false, ids: p.looker.ids
    }, nodeVisibility(node, p.looker, {
      distance: distanceInMeters(p.token, nodeToken), isHost, tokenHidden
    }), crownContext)))
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
  // Lot 4: launch a Matrix action of the system against a device chosen on a crown, {targetTokenId, targetUuid}
  rollMatrixActionOn,
  // Lot 11: draw a crown again (a token, an actor or an id), or every open crown
  refresh: subject => {
    if (!subject) return canvas?.sr5PanCrown?.refresh()
    const id = tokenOf(subject)?.id
    if (id) canvas?.sr5PanCrown?.refresh([id])
  },
  // Lot 11: a generic icon of a module, a category of its own or in place of the system's (pan-icons.js)
  registerIcon: (category, path) => {
    CONFIG.SR5.panIcons ??= {
    }
    const done = registerPanIcon(CONFIG.SR5.panIcons, category, path)
    if (done) canvas?.sr5PanCrown?.refresh()
    return done
  },
}
