import {
  sceneCandidates
} from "../system/pan-candidates.js"

// S1 (ticket 4 d'Adrore): the scene an actor stands on, and the actors of that scene for the menus that slave a device

/** The scene of an actor: its token's for an unlinked token, else the scene where one of its tokens stands on the
 *  canvas, else the scene shown */
export function sceneOfActor(actor) {
  if (actor?.isToken) return actor.token?.parent ?? null
  const token = actor?.getActiveTokens?.(false, true)?.[0]
  return token?.parent ?? globalThis.canvas?.scene ?? null
}

/** The candidates of the actor's scene (pan-candidates.js sceneCandidates), or the whole world with showAll */
export function sceneCandidatesOf(actor, showAll = false) {
  const scene = sceneOfActor(actor)
  return sceneCandidates({
    tokens: [...(scene?.tokens ?? [])], worldActors: [...(globalThis.game?.actors ?? [])], showAll,
  })
}
