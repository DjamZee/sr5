// The crown of a PAN in Foundry (couronne du PAN). Lot 1: the public API, game.sr5.panCrown.getGraph(), which
// reads the graph (pan-graph.js) and what the observer sees of it (pan-visibility.js). Lot 2: open and close a
// crown, drawn by the layer of pan-crown-layer.js. Nothing is written.

import {
  buildPanGraph, hasAntenna, idsOf
} from "./pan-graph.js"
import {
  nodeVisibility, pickViewer
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
  const looker = {
    isGM: !!viewer?.isGM,
    ids: idsOf(viewer?.actor),
    hasAntenna: hasAntenna(viewer?.actor),
    spotted: spottedBy(viewer?.actor),
  }
  graph.viewer = {
    name: viewer?.actor?.name ?? null, ids: looker.ids, hasAntenna: looker.hasAntenna, isGM: looker.isGM
  }
  for (const node of graph.nodes){
    node.distance = distanceInMeters(viewer?.token, tokenOfNode(node, crown))
    node.visibility = nodeVisibility(node, looker, {
      distance: node.distance, isHost: isHostActor(holderActorOf(node, crown))
    })
  }
  return graph
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
}
