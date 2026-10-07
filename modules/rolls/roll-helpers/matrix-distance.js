import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  SR5_ConverterHelpers
} from "./converter.js"
import {
  isMatrixScene
} from "../../canvas/pan-crown/pan-visibility.js"

// The noise of a Matrix action grows with the physical distance to the target (SR5 p. 232). SR5 counts in meters
// and the scene is converted, whatever its unit (arbitrage de DjamZ, 24/09).

function isHost(actor){
  return actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "host"
}

/**
 * The acting actor's token on the scene shown: the controlled one first, as the user picked it
 * @param {Object} actor  the acting actor
 * @param {Object} scene  the scene on the canvas
 * @param {Array} placeables  the tokens of that scene
 * @return {Object|null} a Token placeable
 */
function actorToken(actor, scene, placeables){
  const onScene = placeables.filter(t => t.document?.parent === scene)
  // An unlinked token's actor is its own synthetic actor: its own token, never another one made from the same base
  // actor, a guard of the same model across the room (relecture)
  if (actor.isToken) return onScene.find(t => t.actor === actor || (actor.token && t.document === actor.token)) ?? null
  // A world actor: its linked tokens; an unlinked one of it only when it is the one the user controls
  const own = onScene.filter(t => t.actor === actor || (actor.id && t.document?.actorId === actor.id))
  return own.find(t => t.controlled) ?? own.find(t => t.actor === actor || t.document?.actorLink) ?? null
}

/**
 * Meters between the acting actor's token and the single targeted token, both on the scene shown.
 * Null when it cannot be measured: no target or several, a target or an actor on another scene, no token,
 * or a host on either side, which has no physical distance (p. 236), as the inside of a host has none (a scene
 * marked flags.sr5.matrixScene, A2 of the API pour Matrice v1).
 * @param {Object} actor     the acting actor
 * @param {Object} [canvasLike]  {scene, grid, tokens: {placeables}}, the canvas by default
 * @param {Set} [targets]    the user's targets
 * @return {Number|null}
 */
export function matrixTargetDistance(actor, canvasLike = globalThis.canvas, targets = globalThis.game?.user?.targets){
  const scene = canvasLike?.scene, grid = canvasLike?.grid
  if (!actor || !scene || !grid || targets?.size !== 1 || isHost(actor) || isMatrixScene(scene)) return null
  const target = Array.from(targets)[0]
  if (target?.document?.parent !== scene || isHost(target.actor)) return null
  const token = actorToken(actor, scene, canvasLike.tokens?.placeables ?? [])
  if (!token) return null
  if (token === target) return 0
  const units = grid.measurePath([token.center, target.center]).distance
  return Number.isFinite(units) ? units * SR5_SystemHelpers.getSceneUnitInMeters(scene) : null
}

/**
 * The noise band the dialog opens on, or null to leave its default
 * @param {Object} actor  the acting actor
 * @return {String|null} a key of SR5.matrixNoiseDistance
 */
export function matrixTargetBand(actor, canvasLike, targets){
  return SR5_ConverterHelpers.matrixDistanceToBand(matrixTargetDistance(actor, canvasLike, targets))
}
