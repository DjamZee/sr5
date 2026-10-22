// SR5 p. 236: "Les marks ne durent que le temps d'une session matricielle et sont effacées à chaque reboot". An actor
// deleted from the world, or an unlinked token removed from its scene (a host, an IC, an AI the GM puts away), has left
// the Matrix for good: the marks it placed go from their targets, and the traces its markers kept of their marks on it
// go from their decks. Left behind, they were counted by a Matrix Perception until the next reboot of each target.
// A linked token removed from a scene keeps its actor, still in the Matrix: nothing goes.

/** What a departed marker leaves behind: the items and personas it marked (its persona's and its devices' markedItems
 *  merged, as rebootDeck reads them), and the ids of those who marked it */
export function departedMarkerTraces(actor) {
  const marked = [], markers = new Set()
  if (!actor) return {
    marked, markers: []
  }
  const items = Array.from(actor.items ?? [])
  for (const m of [...(actor.system?.matrix?.markedItems ?? []), ...items.flatMap(i => i.system?.markedItems ?? [])]){
    if (m?.uuid && !marked.some(e => e.uuid === m.uuid)) marked.push(m)
  }
  for (const m of [...(actor.system?.matrix?.marks ?? []), ...items.flatMap(i => i.system?.marks ?? [])]){
    if (typeof m?.ownerId === "string" && m.ownerId) markers.add(m.ownerId)
  }
  return {
    marked, markers: [...markers]
  }
}

/** The marks `actor` placed go, then the traces of the marks placed on it. markerId: the id its marks bear (the token's
 *  for an unlinked token) */
export async function forgetDepartedMarker(actor, markerId, helpers = null) {
  const {
    marked, markers
  } = departedMarkerTraces(actor)
  if (!markerId || (!marked.length && !markers.length)) return
  const h = helpers ?? (await import("../entities/actors/entityActor-helpers.js")).SR5_ActorHelper
  if (marked.length) await h.deleteMarksOnActor({
    matrix: {
      markedItems: marked
    }
  }, markerId)
  for (const ownerId of markers) if (ownerId !== markerId) {
    await h.deleteMarkInfo(ownerId, `${actor.uuid}.`)
    // A persona marked directly is its own owner (mark.js): its trace bears the actor's uuid, without a dot
    await h.deleteMarkInfo(ownerId, actor.uuid, true)
  }
}

/** The active GM alone cleans up, once, whoever deleted; with no GM connected nothing is cleaned, nor later (the traces
 *  go at the next reboot of each marker's deck) */
export function registerDepartedMarkerHooks() {
  Hooks.on("deleteActor", actor => {
    if (game.users?.activeGM?.isSelf) forgetDepartedMarker(actor, actor.id)
  })
  Hooks.on("deleteToken", tokenDocument => {
    if (tokenDocument.actorLink || !game.users?.activeGM?.isSelf) return
    forgetDepartedMarker(tokenDocument.actor, tokenDocument.id)
  })
}
