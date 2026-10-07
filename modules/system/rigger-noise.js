// The noise between a rigger and her drones (SR5 p. 268): "Un rigger en wifi subit à toutes ses actions un modificateur
// de bruit (voir p. 232). En cas de connexion directe, pas la peine de s'inquiéter de ce modificateur." The noise of
// the physical distance (p. 232 table, arbitrage N32 of DjamZ: 0 up to 100 m, 1 from 101 m to 1 km) is measured
// between the tokens of the controller and of the drone, less the controller's Noise Reduction (Q11 of the rigging
// plan, DjamZ 07/10). Rigger 5.0 p. 170: a relay unit of the drone network measures the noise from itself, and a chain
// of relays keeps the highest noise of its links.

import {
  SR5_ConverterHelpers
} from "../rolls/roll-helpers/converter.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  isMatrixScene
} from "../canvas/pan-crown/pan-visibility.js"
import {
  idsOf
} from "../canvas/pan-crown/pan-graph.js"
import {
  streamOf, noiseIgnoredByStream
} from "../entities/actors/technomancer-streams.js"

// The modes where the drone obeys a rigger through the Matrix: remote control (p. 239) and jumped in (p. 268). On
// autopilot the drone acts on its own, and a driver at the wheel has no signal to lose
export const RIGGER_NOISE_MODES = ["remote", "rigging"]
// The actions of the drone: the tests it rolls, never its defenses nor its resistances
export const RIGGER_NOISE_TESTS = ["vehicleTest", "ramming", "attack", "skillDicePool", "sensorTarget"]

/** Noise of a distance in meters (p. 232), as a positive number; null when nothing was measured */
export function noiseOfMeters(meters){
  const band = SR5_ConverterHelpers.matrixDistanceToBand(meters)
  return band ? Math.abs(SR5_ConverterHelpers.matrixDistanceToMod(band)) : null
}

/**
 * The noise of the link once relayed (R5 p. 170): the path from the controller to the drone whose worst link is the
 * least noisy, each relay a step of the chain. Links are the noise between two points; null when not measured.
 * @param {Function} link  (a, b) => noise between two points, or null
 * @param {Object} from    the controller's point
 * @param {Object} to      the drone's point
 * @param {Array} relays   the points of the relays of the network
 * @return {Number|null}
 */
export function relayedNoise(link, from, to, relays = []){
  const points = [from, ...relays, to]
  const best = points.map((p, i) => i === 0 ? 0 : Infinity)
  const done = new Set()
  while (done.size < points.length){
    let current = -1
    points.forEach((p, i) => {
      if (!done.has(i) && (current < 0 || best[i] < best[current])) current = i
    })
    if (best[current] === Infinity) break
    done.add(current)
    points.forEach((p, i) => {
      if (done.has(i)) return
      const noise = link(points[current], p)
      if (noise === null || noise === undefined) return
      best[i] = Math.min(best[i], Math.max(best[current], noise))
    })
  }
  const result = best[points.length - 1]
  return Number.isFinite(result) ? result : null
}

/** The dice pool modifier: the noise less the Noise Reduction, never a bonus (p. 232) */
export function riggerNoiseModifier(noise, reduction = 0){
  const net = Math.max(0, (Number(noise) || 0) - Math.max(0, Number(reduction) || 0))
  return net ? -net : 0
}

/** Does the drone's test suffer the noise of its link? Not when wired (direct connection) nor wireless off */
export function riggerNoiseApplies(drone, testType){
  const system = drone?.system
  if (drone?.type !== "actorDrone" || !RIGGER_NOISE_MODES.includes(system?.controlMode)) return false
  if (!RIGGER_NOISE_TESTS.includes(testType)) return false
  if (system.riggerCabled || system.wirelessTurnedOn === false) return false
  return !!controllerIdOf(drone)
}

/** The controller of the drone: the one chosen on its sheet, or failing that the rigger who deployed it (the link the
 *  crown draws, pan-graph.js) */
export function controllerIdOf(drone){
  return drone?.system?.vehicleOwner?.id || drone?.system?.creatorId || null
}

/** Is this mod a relay unit (R5 p. 170)? Its system effect "relayUnit", or failing that its name (the mods of the
 *  compendiums do not carry the effect), as nanomaintenance does */
export function isRelayUnit(item){
  if (item?.type !== "itemVehicleMod" || item.system?.isActive === false) return false
  const effects = Object.values(item.system?.systemEffects ?? {
  })
  return effects.some(e => e?.value === "relayUnit") || /relais|relay/i.test(item.name ?? "")
}

/** A drone of the controller's network that carries a relay unit, its wireless on */
export function isRelayOf(actor, controllerIds, drone){
  if (actor?.type !== "actorDrone" || actor === drone || actor.system?.wirelessTurnedOn === false) return false
  if (!controllerIds.includes(controllerIdOf(actor))) return false
  return Array.from(actor.items ?? []).some(isRelayUnit)
}

/**
 * The token of an actor on the scene shown (rule shared with the crown's fix, Pauline): an unlinked actor has its own
 * token only, never another of the same model; a world actor, the token one controls, else a linked one
 */
export function tokenOfActor(actor, scene, placeables){
  if (!actor) return null
  const onScene = placeables.filter(t => t.document?.parent === scene)
  if (actor.isToken) return onScene.find(t => t.actor === actor || t.document === actor.token) ?? null
  const own = onScene.filter(t => t.actor === actor || (t.document?.actorLink && t.document?.actorId === actor.id))
  // An unlinked token of this actor counts only when one controls it: among several of a model, it is the one picked
  const picked = onScene.find(t => t.controlled && t.document?.actorId === actor.id)
  return own.find(t => t.controlled) ?? own[0] ?? picked ?? null
}

/**
 * The noise of the drone's link to its controller, measured on the scene shown, before Noise Reduction.
 * Null when it cannot be measured: the drone or its controller off the scene shown, or a scene of the Matrix.
 * @param {Object} drone        the drone's actor
 * @param {Object} controller   the controller's actor
 * @param {Object} [canvasLike] {scene, grid, tokens: {placeables}}, the canvas by default
 */
export function riggerLinkNoise(drone, controller, canvasLike = globalThis.canvas){
  const scene = canvasLike?.scene, grid = canvasLike?.grid
  if (!drone || !controller || !scene || !grid || isMatrixScene(scene)) return null
  const placeables = canvasLike.tokens?.placeables ?? []
  const from = tokenOfActor(controller, scene, placeables), to = tokenOfActor(drone, scene, placeables)
  if (!from || !to) return null
  const unit = SR5_SystemHelpers.getSceneUnitInMeters(scene)
  const link = (a, b) => {
    if (a === b) return 0
    const units = grid.measurePath([a.center, b.center]).distance
    return Number.isFinite(units) ? noiseOfMeters(units * unit) : null
  }
  const ids = idsOf(controller)
  const relays = placeables.filter(t => t.document?.parent === scene && t !== to && isRelayOf(t.actor, ids, drone))
  return relayedNoise(link, from, to, relays)
}

/** The controller's Noise Reduction (her RCC, and what lowers it until the end of the turn), plus the noise a
 *  Morphinae daemon ignores (Kill Code p. 145), as the Matrix dialog counts it */
export function controllerNoiseReduction(controller){
  const system = controller?.system
  return (Number(system?.matrix?.attributes?.noiseReduction?.value) || 0) +
    noiseIgnoredByStream(streamOf(controller), system?.matrix?.submersionGrade)
}

/**
 * Adds the noise of the rigger's link to the dice pool modifiers of the drone's action. Unmeasured (the drone or its
 * controller off the scene shown), nothing is added: the gamemaster sets the noise by hand, as before.
 * @param {Object} rollData
 * @param {Object} drone
 * @param {Object} options  {resolve: id => actor, canvasLike, label}
 * @return {Number} the modifier added, 0 when none
 */
export function applyRiggerNoise(rollData, drone, {
  resolve, canvasLike = globalThis.canvas, label = ""
} = {
}){
  if (!rollData?.dicePool || !riggerNoiseApplies(drone, rollData.test?.type)) return 0
  const controller = resolve?.(controllerIdOf(drone))
  const noise = riggerLinkNoise(drone, controller, canvasLike)
  if (noise === null) return 0
  const value = riggerNoiseModifier(noise, controllerNoiseReduction(controller))
  if (!value) return 0
  rollData.dicePool.modifiers = (rollData.dicePool.modifiers || []).filter(m => m.type !== "riggerNoise").concat({
    type: "riggerNoise", label, value
  })
  return value
}
