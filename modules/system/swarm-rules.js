// Drone swarms (Rigger 5.0 p. 35): drones slaved to one rigger command console running the Swarm program act as one
// drone with several bodies. Pure functions; swarm.js reads Foundry and hands them the members.
// - a swarm is the drones of one rigger sharing the same swarm number (system.swarm, 0: none);
// - its Autopilot is the highest Pilot of its drones or the console's Device Rating; each autosoft and the Sensor
//   are the highest among its drones (and the console for the autosofts); Handling, Speed and Acceleration the lowest;
// - its actions get a dice pool and limit modifier equal to the number of drones minus one;
// - a drone destroyed or bricked (rigging-rules.js droneWrecked), unslaved, or of another rigger is no member: the
//   swarm is worked out again at each preparation, so a loss "immediately" changes its ratings and bonus.
import {
  droneWrecked
} from "./rigging-rules.js"

// The Swarm rigging program (600 ¥), a program type of its own: the only rigging program of Rigger 5.0
export const isSwarmProgram = item => item?.type === "itemProgram" && item.system?.type === "swarm"

// Whether the console (its items, or the copy a drone carries) runs the Swarm program
export function consoleRunsSwarm(consoleItems){
  return (consoleItems ?? []).some(i => isSwarmProgram(i) && i.system.isActive)
}

// The swarm number of a drone, 0 when it belongs to none
export function swarmNumber(droneSystem){
  const n = Math.floor(Number(droneSystem?.swarm) || 0)
  return n > 0 ? n : 0
}

// Whether a drone can be a member of its rigger's swarm: slaved to a rigger, numbered, neither destroyed nor bricked
export function swarmEligible(droneSystem){
  return !!droneSystem?.vehicleOwner?.id && !!droneSystem.slaved && swarmNumber(droneSystem) > 0 && !droneWrecked(droneSystem)
}

/**
 * The members of a drone's swarm among candidate drones (the drone itself among the candidates).
 * @param {object} droneSystem the system of the drone asking
 * @param {Array<{id: string, system: object}>} candidates the drones to look among, each once by its own id
 * @returns {Array} the members, the asking drone included; empty when it is no member itself
 */
export function swarmMembers(droneSystem, candidates){
  if (!swarmEligible(droneSystem)) return []
  const owner = droneSystem.vehicleOwner.id
  const number = swarmNumber(droneSystem)
  const seen = new Set()
  return (candidates ?? []).filter(c => {
    if (!c?.id || seen.has(c.id)) return false
    if (c.system?.vehicleOwner?.id !== owner || swarmNumber(c.system) !== number || !swarmEligible(c.system)) return false
    seen.add(c.id)
    return true
  })
}

// The bonus of a swarm's actions: dice pool and limit, the number of drones minus one (never below 0)
export const swarmBonus = count => Math.max(0, (Number(count) || 0) - 1)

// The attributes the swarm takes the highest of, and those it takes the lowest of. Off-road ratings: a drone
// without any (0) does not drag the swarm down
export const SWARM_HIGHEST = ["pilot", "sensor"]
export const SWARM_LOWEST = ["handling", "speed", "acceleration"]
export const SWARM_LOWEST_IF_ANY = ["handlingOffRoad", "speedOffRoad", "accelerationOffRoad"]
export const SWARM_ATTRIBUTES = [...SWARM_HIGHEST, ...SWARM_LOWEST, ...SWARM_LOWEST_IF_ANY]

const numberOf = v => Number(v) || 0

// The key of an autosoft: its name, then its model or weapon when it has one (Maneuvering [Model], Targeting [Weapon])
export function autosoftKey(autosoft){
  const name = String(autosoft?.name ?? "").trim().toLowerCase()
  const model = String(autosoft?.model ?? "").trim().toLowerCase()
  return model ? `${name}|${model}` : name
}

/**
 * The ratings of a swarm (Rigger 5.0 p. 35).
 * @param {Array<{values: Object<string, number>, autosofts: Array<{name, model, rating, source}>}>} members the
 *   members' own ratings (before the swarm), and the autosofts each one runs at the rating it runs them
 * @param {{deviceRating, autosofts: Array<{name, model, rating, source}>}} console the console running the program,
 *   with the autosofts running on it
 * @returns {null|{count, bonus, values: Object<string, number>, autosofts: Object<string, {rating, source}>}}
 *   null below two drones: a single drone is no swarm (Swarm Control also asks two at least, p. 181)
 */
export function swarmProfile(members, console = {
}){
  const list = members ?? []
  if (list.length < 2) return null
  const autosofts = {
  }
  for (const a of [...(console.autosofts ?? []), ...list.flatMap(m => m.autosofts ?? [])]){
    const key = autosoftKey(a)
    if (!key) continue
    const rating = numberOf(a.rating)
    if (!autosofts[key] || rating > autosofts[key].rating) autosofts[key] = {
      rating, source: a.source ?? null
    }
  }
  const of = key => list.map(m => numberOf(m.values?.[key]))
  const values = {
  }
  for (const key of SWARM_HIGHEST) values[key] = Math.max(...of(key))
  // The Autopilot: the console's Device Rating when it is higher
  values.pilot = Math.max(values.pilot, numberOf(console.deviceRating))
  for (const key of SWARM_LOWEST) values[key] = Math.min(...of(key))
  for (const key of SWARM_LOWEST_IF_ANY){
    const rated = of(key).filter(v => v > 0)
    if (rated.length) values[key] = Math.min(...rated)
  }
  return {
    count: list.length, bonus: swarmBonus(list.length), values, autosofts,
  }
}

/**
 * What a member gets from its swarm for one attribute: the difference between the swarm's value and its own, 0 when
 * the swarm does not set it (an off-road rating no member has).
 */
export function swarmAttributeDelta(profile, key, own){
  if (!profile || !(key in profile.values)) return 0
  if (SWARM_LOWEST_IF_ANY.includes(key) && !(numberOf(own) > 0)) return 0
  return profile.values[key] - numberOf(own)
}

/**
 * The autosofts a member gets from its swarm, above what it already runs: for each autosoft of the swarm that fits
 * the drone, the rating to add to the one it uses now (0 if none).
 * @param {object} profile swarmProfile
 * @param {Object<string, number>} used the rating the drone already runs for each autosoft key
 * @param {(autosoft) => boolean} fits whether an autosoft works for this drone (an autosoft [Model])
 * @returns {Array<{key, source, delta}>}
 */
export function swarmAutosoftDeltas(profile, used = {
}, fits = () => true){
  if (!profile) return []
  const out = []
  for (const [key, best] of Object.entries(profile.autosofts)){
    if (best.source && !fits(best.source)) continue
    const delta = best.rating - numberOf(used[key])
    if (delta > 0) out.push({
      key, source: best.source, delta
    })
  }
  return out
}

/**
 * The swarm state shown on the drone's sheet and read by its tests.
 * @returns {{number, active, reason, count, bonus, memberIds}}
 */
export function swarmState(droneSystem, members, consoleItems){
  const number = swarmNumber(droneSystem)
  const state = {
    number, active: false, reason: "", count: 0, bonus: 0, memberIds: []
  }
  if (!number) return state
  if (!consoleRunsSwarm(consoleItems)) return {
    ...state, reason: "noProgram"
  }
  if (!swarmEligible(droneSystem)) return {
    ...state, reason: "notMember"
  }
  if ((members ?? []).length < 2) return {
    ...state, reason: "alone", count: (members ?? []).length
  }
  return {
    ...state, active: true, count: members.length, bonus: swarmBonus(members.length), memberIds: members.map(m => m.id)
  }
}
