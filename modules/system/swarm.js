// Drone swarms on the canvas (Rigger 5.0 p. 35): swarm-rules.js holds the rules, this file reads Foundry.
// A swarm is made of the drones on the scene: each body is a token of its own, targeted on its own. Each client
// prepares its own documents, so a drone prepared before another member reads that member's last own values; any
// change to a member prepares the whole swarm again, which is how a lost drone "immediately" changes the swarm.
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  localAutosoftRating, droneAutopilot, rccAutosoftsForDrone, autosoftFitsDrone
} from "../entities/actors/rcc.js"
import {
  swarmNumber, swarmMembers, swarmState, swarmProfile, swarmAttributeDelta, swarmAutosoftDeltas, autosoftKey,
  SWARM_ATTRIBUTES, isSwarmProgram
} from "./swarm-rules.js"

// The id a drone is known by: the token's for an unlinked token, the actor's otherwise
export function realIdOf(actor){
  return actor?.isToken ? (actor.token?.id ?? actor.id) : actor?.id
}

// The drones on the scene, each once
export function sceneDrones(){
  const tokens = globalThis.canvas?.ready ? (canvas.tokens?.placeables ?? []) : []
  const seen = new Set()
  const out = []
  for (const token of tokens){
    const actor = token.actor
    if (actor?.type !== "actorDrone") continue
    const id = realIdOf(actor)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(actor)
  }
  return out
}

const isAutosoft = item => item?.type === "itemProgram" && item.system?.type === "autosoft"

// The autosofts a drone runs itself, at the rating its autopilot lets them run (Rigger 5.0 p. 131)
function ownAutosofts(actor){
  const autopilot = droneAutopilot(actor.system, actor.items)
  return [...(actor.items ?? [])].filter(i => isAutosoft(i) && i.system.isActive).map(i => ({
    name: i.name, model: i.system.isModelBased || i.system.model ? i.system.model : "", source: i,
    rating: localAutosoftRating(i.system.itemRating, autopilot),
  }))
}

// The autosofts running on the console: all of them, shared or not ("fonctionnant sur la CCR")
function consoleAutosofts(consoleItems){
  return (consoleItems ?? []).filter(i => isAutosoft(i) && i.system?.isActive).map(i => ({
    name: i.name, model: i.system.model ?? "", source: i, rating: Number(i.system.itemRating) || 0,
  }))
}

function ownValues(actor){
  const attributes = actor.system?.attributes ?? {
  }
  return Object.fromEntries(SWARM_ATTRIBUTES.map(key => [key, Number(attributes[key]?.augmented?.value) || 0]))
}

// A plain copy of an autosoft, at the rating the swarm adds, for applyCustomEffects
function autosoftAtRating(source, rating, label){
  const system = foundry.utils.deepClone(source.system?.toObject?.() ?? source.system ?? {
  })
  system.itemRating = rating
  return {
    name: `${source.name} (${label})`, type: "itemProgram", system, parent: null,
  }
}

/**
 * Works out the drone's swarm and applies it: called by the drone's preparation, once its attributes and monitors
 * are known and before its tests are.
 * @param {Actor} actor the drone
 * @param {Function} applyCustomEffects SR5_CharacterUtility.applyCustomEffects (passed in: utilityActor.js imports
 *   the rules, not the other way round)
 */
export function applySwarm(actor, applyCustomEffects){
  const system = actor.system
  // The drone's own ratings, before the swarm: what the other members read of it
  const own = {
    values: ownValues(actor), autosofts: ownAutosofts(actor)
  }
  actor._swarmOwn = own
  actor._swarmProfile = null
  if (!swarmNumber(system)) {
    system.swarmState = swarmState(system, [], [])
    return
  }
  const selfId = realIdOf(actor)
  const drones = sceneDrones()
  const candidates = drones.map(d => realIdOf(d) === selfId ? {
    id: selfId, system, actor
  } : {
    id: realIdOf(d), system: d.system, actor: d
  })
  // A drone off the scene is no body of the swarm
  const onScene = candidates.some(c => c.id === selfId)
  const members = onScene ? swarmMembers(system, candidates) : []
  const consoleItems = system.vehicleOwner?.items ?? []
  const state = swarmState(system, members, consoleItems)
  if (!onScene && state.reason === "alone") state.reason = "notMember"
  state.label = game.i18n.format(state.active ? "SR5.SwarmActive" : `SR5.SwarmInactive_${state.reason}`, {
    number: state.number, count: state.count, bonus: state.bonus
  })
  system.swarmState = state
  if (!state.active) return

  const profile = swarmProfile(members.map(m => m.id === selfId ? own : (m.actor._swarmOwn ?? {
    values: ownValues(m.actor), autosofts: ownAutosofts(m.actor)
  })), {
    deviceRating: system.vehicleOwner?.system?.matrix?.deviceRating, autosofts: consoleAutosofts(consoleItems),
  })
  actor._swarmProfile = profile
  const label = game.i18n.localize("SR5.SwarmValue")

  // Autopilot and Sensor at the highest, Handling, Speed and Acceleration at the lowest
  for (const key of SWARM_ATTRIBUTES){
    const augmented = system.attributes?.[key]?.augmented
    if (!augmented) continue
    const delta = swarmAttributeDelta(profile, key, own.values[key])
    if (!delta) continue
    SR5_EntityHelpers.updateModifier(augmented, label, "swarm", delta)
    SR5_EntityHelpers.updateValue(augmented, 0)
  }

  // Each autosoft at the swarm's highest rating: what the drone runs already (its own, or the console's it uses),
  // raised to it. Targeting [Weapon] is read by the weapon's pool (swarmTargetingRating)
  const used = {
  }
  const shared = rccAutosoftsForDrone(system, actor.items).map(i => ({
    name: i.name, model: i.system.model ?? "", rating: Number(i.system.itemRating) || 0
  }))
  for (const a of [...own.autosofts, ...shared]){
    const key = autosoftKey(a)
    used[key] = Math.max(used[key] ?? 0, a.rating)
  }
  const weapons = new Set([...(actor.items ?? [])].filter(i => i.type === "itemWeapon").map(i => i.name))
  const fits = source => autosoftFitsDrone(source.system, system.model) && !isTargeting(source, weapons)
  for (const {
    source, delta
  } of swarmAutosoftDeltas(profile, used, fits)){
    if (!source || !Object.keys(source.system?.customEffects ?? {
    }).length) continue
    applyCustomEffects(autosoftAtRating(source, delta, label), actor)
  }
}

// Targeting [Weapon], an autosoft whose model is a weapon's name, works through the weapon's pool (utilityItem.js)
function isTargeting(source, weapons){
  return !!source?.system?.model && weapons.has(source.system.model)
}

/** The swarm's best Targeting rating for a weapon of the drone (the autosoft whose weapon is that one), 0 if none */
export function swarmTargetingRating(actor, weaponName){
  const profile = actor?._swarmProfile
  if (!profile) return 0
  let best = 0
  for (const entry of Object.values(profile.autosofts)){
    if (entry.source?.system?.model === weaponName) best = Math.max(best, Number(entry.rating) || 0)
  }
  return best
}

/** The two boxes of a swarm's action, ticked: dice pool and limit, the number of drones minus one (Rigger 5.0 p. 35).
 *  Not for a defense nor a resistance, which are no actions of the swarm */
export function swarmOffersFor(rollData, actor){
  const state = actor?.type === "actorDrone" ? actor.system?.swarmState : null
  if (!state?.active || !state.bonus) return []
  if (/defen|resist/i.test(String(rollData?.test?.type ?? ""))) return []
  const label = game.i18n.format("SR5.SwarmBonus", {
    count: state.count
  })
  const base = {
    label, when: "", value: state.bonus, isMalus: false, checked: true, hidden: false, indirect: true
  }
  return [{
    ...base, key: "indirect_swarm", kind: "dicePool"
  }, {
    ...base, key: "indirect_swarmLimit", kind: "limit"
  }]
}

/** The number of drones of the swarm a vehicle belongs to, for Swarm Control (Rigger 5.0 p. 181); 0 if none */
export function swarmCountOf(actor){
  const state = actor?.system?.swarmState
  return state?.active ? state.count : 0
}

// Every drone of the scene with a swarm number, prepared again; open sheets redrawn
function prepareSwarmsAgain(){
  for (const drone of sceneDrones()){
    if (!swarmNumber(drone.system) && !drone.system?.swarmState?.active) continue
    drone.prepareData()
    if (drone.sheet?.rendered) drone.sheet.render(false)
  }
}

// Debounced, built at the first call: a test importing this file has no foundry global
let debounced = null
const refresh = () => (debounced ??= foundry.utils.debounce(prepareSwarmsAgain, 100))()

function concernsSwarms(document){
  const actor = document instanceof Actor ? document : (document?.actor ?? document?.parent)
  if (actor?.type === "actorDrone") return true
  // A console whose Swarm program goes on or off reaches its drones through their copy (updateControledVehicle)
  return isSwarmProgram(document)
}

/** A drone that changes, enters or leaves the scene prepares its swarm again */
export function registerSwarmHooks(){
  Hooks.on("canvasReady", () => refresh())
  for (const hook of ["updateActor", "updateToken", "createToken", "deleteToken", "deleteActor", "createItem", "updateItem", "deleteItem"]){
    Hooks.on(hook, (document, changed) => {
      // A token that only moves changes nothing of its swarm
      if (hook === "updateToken" && !("delta" in (changed ?? {
      })) && !("actorLink" in (changed ?? {
      }))) return
      if (concernsSwarms(document)) refresh()
    })
  }
}
