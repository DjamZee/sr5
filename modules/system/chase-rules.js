// Vehicle chases (R12): the rules that do not need Foundry. The window (chase.js) and, later, the chase actions read
// plain numbers through these. Two rule sets: the core book's chase (SR5 p. 199-205), the default, and the advanced
// driving rules of Rigger 5.0 (p. 175-185) when the world setting sr5Rigger5AdvancedDriving is on.

// Engagement ranges, nearest first. The core book has four (SR5 p. 204); Rigger 5.0 adds Contact before Short and,
// for a chase with an aircraft, Spotting beyond Extreme (R5 p. 176).
export const RANGES_BOOK = ["short", "medium", "long", "extreme"]
export const RANGES_R5 = ["contact", "short", "medium", "long", "extreme"]
export const RANGE_SPOTTING = "spotting"

export function chaseRanges(advanced, aircraft = false) {
  if (!advanced) return [...RANGES_BOOK]
  return aircraft ? [...RANGES_R5, RANGE_SPOTTING] : [...RANGES_R5]
}

/**
 * A range that fits the rule set in force: the rule set or a vehicle's kind may change during a chase, and a range
 * the list no longer has moves to the nearest one it has (Contact → Short, Spotting → Extreme). Unset: Medium.
 */
export function normalizeRange(range, advanced, aircraft = false) {
  const list = chaseRanges(advanced, aircraft)
  if (list.includes(range)) return range
  if (range === "contact") return list[0]
  if (range === RANGE_SPOTTING) return list[list.length - 1]
  return "medium"
}

// Approximate distances in metres. Core book: by chase environment, speed or handling (SR5 p. 204);
// Rigger 5.0: one table, no environment (R5 p. 176)
export const RANGE_DISTANCES = {
  speed: {
    short: [0, 10], medium: [11, 50], long: [51, 150], extreme: [151, 300]
  },
  handling: {
    short: [0, 5], medium: [6, 20], long: [21, 80], extreme: [81, 150]
  },
  r5: {
    contact: [0, 2], short: [2, 10], medium: [11, 50], long: [51, 150], extreme: [151, 300], spotting: [301, 500]
  },
}

export function rangeDistance(range, advanced, environment = "speed") {
  const table = advanced ? RANGE_DISTANCES.r5 : (RANGE_DISTANCES[environment] ?? RANGE_DISTANCES.speed)
  return table[range] ?? null
}

/**
 * Move a pair of vehicles along the ranges: positive steps open the gap, negative close it. Past the farthest range
 * the pursued vehicle gets away (SR5 p. 205, R5 p. 177): the range stays the farthest one and `escaped` is true.
 * Closing never goes nearer than the nearest range. An unknown range counts as the farthest.
 * @returns {{range: string, escaped: boolean}}
 */
export function shiftRange(range, steps, advanced, aircraft = false) {
  const list = chaseRanges(advanced, aircraft)
  let index = list.indexOf(range)
  if (index < 0) index = list.length - 1
  const next = index + (Math.trunc(Number(steps)) || 0)
  if (next >= list.length) return {
    range: list[list.length - 1], escaped: true
  }
  return {
    range: list[Math.max(0, next)], escaped: false
  }
}

// Terrain modifiers to the threshold. The two books use the same word, « Restreint », for two values (+3 in the core
// book, +2 in Rigger 5.0): the lists stay apart, each with its own keys and the book's own labels.
export const TERRAINS_BOOK = [
  {
    key: "clear", value: 0
  }, {
    key: "normal", value: 1
  }, {
    key: "limited", value: 2
  }, {
    key: "restricted", value: 3
  },
]
// Keys of their own (r5…), so that no terrain of one list is ever read as the other's
export const TERRAINS_R5 = [
  {
    key: "r5Open", value: 0
  }, {
    key: "r5Light", value: 1
  }, {
    key: "r5Restricted", value: 2
  }, {
    key: "r5Obstructed", value: 3
  }, {
    key: "r5Tight", value: 4
  }, {
    key: "r5Impossible", value: 6
  },
]

// The same places in both tables, by their printed examples (SR5 p. 201, R5 p. 175): highways → Ouvert, wide avenues
// → Léger, side streets → Restreint (+2), dense forests, steep slopes, swamps → Exigu (+4). Obstrué and Impossible
// have no core book counterpart: going back, they take the hardest one.
const BOOK_TO_R5 = {
  clear: "r5Open", normal: "r5Light", limited: "r5Restricted", restricted: "r5Tight"
}
const R5_TO_BOOK = {
  r5Open: "clear", r5Light: "normal", r5Restricted: "limited", r5Obstructed: "restricted", r5Tight: "restricted",
  r5Impossible: "restricted",
}

export function terrainList(advanced) {
  return advanced ? TERRAINS_R5 : TERRAINS_BOOK
}

/**
 * The terrain in the list of the rule set in force. When the rule set changes during a chase, the terrain moves to the
 * same place in the other table; an unknown key falls back on the easiest terrain.
 */
export function normalizeTerrain(key, advanced) {
  const list = terrainList(advanced)
  if (list.some(t => t.key === key)) return key
  const moved = advanced ? BOOK_TO_R5[key] : R5_TO_BOOK[key]
  return moved ?? list[0].key
}

export function terrainValue(key, advanced) {
  const normalized = normalizeTerrain(key, advanced)
  return terrainList(advanced).find(t => t.key === normalized)?.value ?? 0
}

// Vehicle kinds and the factor that makes their Speeds comparable in a chase (R5 p. 184): ×0.8 water, ×1 ground,
// ×3 rotorcraft, ×4 jet
export const VEHICLE_KINDS = {
  ground: 1, water: 0.8, rotor: 3, jet: 4
}

const KIND_OF_CATEGORY = {
  boat: "water", submarine: "water", rotorCraft: "rotor", vectorThrustCraft: "rotor", lta: "rotor",
  fixedWingAircraft: "jet",
}

// A drone's category is only its size: what it flies or sails comes from its piloting skill (an aircraft drone is a
// rotorcraft by default; the gamemaster still changes the kind in the chase window, Lancelot F7)
const KIND_OF_PILOT_SKILL = {
  pilotAircraft: "rotor", pilotAerospace: "jet", pilotWatercraft: "water",
}

/** The kind of a vehicle from its category (SR5.vehiclesCategories), else its piloting skill, ground when both say nothing */
export function kindOfCategory(category, pilotSkill) {
  return KIND_OF_CATEGORY[category] ?? KIND_OF_PILOT_SKILL[pilotSkill] ?? "ground"
}

export function isAircraft(kind) {
  return kind === "rotor" || kind === "jet"
}

export function effectiveSpeed(speed, kind = "ground") {
  return (Number(speed) || 0) * (VEHICLE_KINDS[kind] ?? 1)
}

/**
 * The Speeds a vehicle may reach this Combat Turn. Rigger 5.0: up by its Acceleration at most, down by one at most,
 * from the Speed it had when the turn began (R5 p. 176); never above its Speed attribute nor under 0. The core book
 * tracks no current Speed in a chase: anything from 0 to the attribute.
 */
export function speedBounds(turnStart, acceleration, maxSpeed, advanced) {
  const max = Math.max(0, Number(maxSpeed) || 0)
  if (!advanced) return {
    min: 0, max
  }
  const start = Math.max(0, Number(turnStart) || 0)
  return {
    min: Math.min(max, Math.max(0, start - 1)),
    max: Math.min(max, start + Math.max(0, Number(acceleration) || 0)),
  }
}

export function clampSpeed(value, bounds) {
  const v = Math.trunc(Number(value)) || 0
  return Math.min(bounds.max, Math.max(bounds.min, v))
}

/**
 * The Speed a vehicle gets back at the end of the Combat Turn a stunt slowed it (R5 p. 182: "during this Combat
 * Turn"), never past its Speed attribute
 */
export function restoreTurnSpeed(speed, loss, maxSpeed) {
  const s = Number(speed) || 0
  const l = Math.max(0, Number(loss) || 0)
  return l ? Math.min(Math.max(s, Number(maxSpeed) || 0), s + l) : s
}

/**
 * Threshold of a Rigger 5.0 chase action taken against another vehicle (R5 p. 177): Terrain + the gap between the two
 * Speeds, only the Terrain when the initiator is the fastest of all; lowered by a jumped in rigger's control rig, never
 * under 1 once lowered (SR5 p. 200, 268). Speeds are compared once made comparable by kind (R5 p. 184).
 * @param {object} p {terrain, initiator: {speed, kind}, target: {speed, kind}, fastest, controlRig}
 */
export function chaseThreshold({
  terrain = 0, initiator, target, fastest = false, controlRig = 0
}) {
  const gap = fastest || !target ? 0 :
    Math.abs(effectiveSpeed(initiator?.speed, initiator?.kind) - effectiveSpeed(target.speed, target.kind))
  const base = (Number(terrain) || 0) + Math.ceil(gap)
  const rig = Math.max(0, Number(controlRig) || 0)
  if (base <= 0 || rig === 0) return base
  return Math.max(1, base - rig)
}

/** Whether a vehicle goes at least as fast as every other vehicle still in the chase */
export function isFastest(vehicle, vehicles) {
  const own = effectiveSpeed(vehicle?.speed, vehicle?.kind)
  return (vehicles ?? []).every(v => v === vehicle || v.id === vehicle?.id || effectiveSpeed(v.speed, v.kind) <= own)
}

/** The key of a pair of vehicles in the range table, the same whichever comes first */
export function pairKey(a, b) {
  return [a, b].sort().join("|")
}

/**
 * The pilot takes the Control a Vehicle action (SR5 p. 203): the vehicle is no longer out of control, at once
 * (R5 p. 176: the −2 lasts "until a control action is taken"), and the autopilot gives it back.
 */
export function markControlled(vehicle) {
  return {
    ...vehicle, controlled: true, outOfControl: false, autopilot: false, uncontrolledTurns: 0
  }
}

/**
 * End of a Combat Turn for one vehicle of the chase (SR5 p. 203, R5 p. 176), the same in both rule sets:
 * - controlled this turn, or driven by its autopilot: nothing happens;
 * - first turn without control: out of control, −2 dice for everyone aboard;
 * - a second one: the autopilot takes over at the end of that turn, if the vehicle has one (Pilot rating);
 *   without one, the vehicle goes on straight, out of control, and makes no defense test ("adrift").
 * @param {object} vehicle its chase state
 * @param {{hasAutopilot: boolean, onAutopilot: boolean}} p onAutopilot: the vehicle is driven by its autopilot
 *   (control mode "autopilot"), which takes the action itself
 * @returns {{vehicle: object, event: null|"outOfControl"|"autopilot"|"adrift"}}
 */
export function endOfTurn(vehicle, {
  hasAutopilot = false, onAutopilot = false
} = {
}) {
  const next = {
    ...vehicle, controlled: false
  }
  if (vehicle.controlled || vehicle.autopilot || onAutopilot) return {
    vehicle: {
      ...next, outOfControl: false, uncontrolledTurns: 0
    }, event: null
  }
  const turns = (Number(vehicle.uncontrolledTurns) || 0) + 1
  if (turns === 1) return {
    vehicle: {
      ...next, outOfControl: true, uncontrolledTurns: turns
    }, event: "outOfControl"
  }
  if (hasAutopilot) return {
    vehicle: {
      ...next, outOfControl: false, autopilot: true, uncontrolledTurns: 0
    }, event: "autopilot"
  }
  return {
    vehicle: {
      ...next, outOfControl: true, uncontrolledTurns: turns
    }, event: turns === 2 ? "adrift" : null
  }
}

/**
 * Why a vehicle leaves the chase at the end of a Combat Turn, or null. Both rule sets: its condition monitor is full
 * (destroyed). Rigger 5.0 adds (p. 175): Handling down to 0 (pinned), Speed and Acceleration both down to 0
 * (immobilized). Getting away past Extreme comes from shiftRange.
 */
export function chaseEndReason({
  monitorFull = false, handling, speed, acceleration
}, advanced) {
  if (monitorFull) return "destroyed"
  if (!advanced) return null
  if (handling !== undefined && Number(handling) <= 0) return "pinned"
  if (Number(speed) <= 0 && Number(acceleration) <= 0) return "immobilized"
  return null
}
