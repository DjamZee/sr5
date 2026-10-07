// Vehicle chases (R12, part 2): the chase actions, as plain rules that do not need Foundry. chase-roll.js prepares the
// pilot's test from them and applies their outcome to the register (chase.js). Two rule sets: the core book's chase
// actions (SR5 p. 204-205), the default, and Rigger 5.0's vehicle actions (p. 176-181) when the world setting
// sr5Rigger5AdvancedDriving is on.
//
// Every action is a vehicle test: Vehicle skill + Reaction [Handling] (SR5 p. 205, R5 p. 176), rolled by the vehicle
// test of the drone sheet (manual, remote, jumped in, or Pilot + autosoft on autopilot). The thresholds below come
// before the control rig, which the vehicle test lowers itself (SR5 p. 200, 268).
//
// Part 3: the stunts (SR5 p. 205, R5 p. 182-183) and the Edge actions (Hang On Baby, Zen Driving, Leaf in the Wind)
// are entries of CHASE_ACTIONS too, added by registerChaseAction(); a stunt within another action goes through
// withStunt().

import {
  chaseRanges
} from "./chase-rules.js"

// Rigger 5.0's Discreet Pursuit: the distance part of the threshold, nearest first (R5 p. 178)
export const TRAIL_DISTANCE = {
  contact: 5, short: 3, medium: 2, long: 1, extreme: 0, spotting: 0
}

// Rigger 5.0's ranges under 100 m, for Sow Chaos (R5 p. 179) and Clear the Path (R5 p. 180-181): Long (51-150 m) is
// left out, most of it lies beyond
export const NEAR_RANGES = ["contact", "short", "medium"]

/**
 * The optimal Speed part of a threshold (R5 p. 176): the gap between the current Speed and the action's own.
 * No optimal Speed (« toute vitesse »): nothing.
 */
export function optimalSpeedModifier(speed, optimal) {
  if (optimal === null || optimal === undefined) return 0
  return Math.abs((Number(speed) || 0) - optimal)
}

/**
 * How many net hits an opposed Rigger 5.0 action wins (R5 p. 177-179): the initiator's hits less the target's, then
 * those beyond the threshold.
 * The book says « test opposé » and « seuil » without saying how they combine, in French (p. 177) as in English
 * (p. 174-175): arbitrage de DjamZ (08/10), net hits less the threshold, kept in this one place.
 */
export function opposedNet({
  hits, threshold = 0, opposingHits = 0
}) {
  const net = Math.max(0, Number(hits) || 0) - Math.max(0, Number(opposingHits) || 0)
  return Math.max(0, net - Math.max(0, Number(threshold) || 0))
}

/** Hits over a threshold (no opponent): 0 when it is missed */
export function excessHits(hits, threshold = 0) {
  return Math.max(0, (Number(hits) || 0) - Math.max(0, Number(threshold) || 0))
}

/** The initiator wins an opposed test: more hits than the target, its net hits reaching the threshold (as opposedNet) */
export function winsOpposed({
  hits, threshold = 0, opposingHits = 0
}) {
  const net = (Number(hits) || 0) - (Number(opposingHits) || 0)
  return net > 0 && net >= (Number(threshold) || 0)
}

// Catch-Up / Break Away: the pursuer closes in, the pursued opens the gap
function catchUpSign(role) {
  return role === "pursued" ? 1 : -1
}

/**
 * The range steps of a Catch-Up / Break Away and, when the vehicle would get past the farthest range, what is left for
 * the pursuer's last test (SR5 p. 205, R5 p. 177).
 * @returns {{steps: number, now: number, escape: null|{toEscape: number, total: number}}} now: the steps applied at
 *   once (up to the farthest range when it would escape)
 */
export function catchUpSteps({
  net, acceleration, role, range, advanced, aircraft = false
}) {
  const total = Math.min(Math.max(0, net), Math.max(0, Number(acceleration) || 0))
  const sign = catchUpSign(role)
  if (total === 0) return {
    steps: 0, now: 0, escape: null
  }
  if (sign < 0) return {
    steps: -total, now: -total, escape: null
  }
  const list = chaseRanges(advanced, aircraft)
  let index = list.indexOf(range)
  if (index < 0) index = list.length - 1
  const toEscape = list.length - index
  if (total < toEscape) return {
    steps: total, now: total, escape: null
  }
  return {
    steps: total, now: toEscape - 1, escape: {
      toEscape, total
    }
  }
}

/**
 * The range a vehicle ends at behind another, at the farthest range then nearer by each net hit after the first
 * (Quick Turn R5 p. 176, Six Pack R5 p. 179), never nearer than `nearest`.
 */
export function behindRange(net, advanced, nearest) {
  const list = chaseRanges(advanced)
  const extreme = list.indexOf("extreme")
  const floor = Math.max(0, list.indexOf(nearest))
  return list[Math.max(floor, extreme - Math.max(0, net - 1))]
}

/** Six Pack: the target gets +1 die per range beyond Short (R5 p. 179) */
export function sixPackBonus(range, advanced) {
  const list = chaseRanges(advanced, true)
  return Math.max(0, list.indexOf(range) - list.indexOf("short"))
}

// Collision damage by Speed, Rigger 5.0 (R5 p. 179): the Body multiplier
export function collisionMultiplier(speed) {
  const s = Math.max(0, Number(speed) || 0)
  if (s <= 0) return 0
  if (s <= 2) return 0.5
  if (s <= 4) return 1
  if (s <= 6) return 2
  if (s <= 8) return 3
  if (s <= 10) return 5
  return 10
}

/**
 * Rigger 5.0's Collision (R5 p. 179): the Speed the damage is read from by angle (rear: the gap, side: the initiator's,
 * front: both), ×3 for an aircraft; the target takes Body × multiplier + net hits, the initiator half of it (rounded
 * up) from the rear or the side, all of it head on.
 */
export function collisionDamage({
  angle = "side", speed, targetSpeed, body, net = 0, aircraft = false
}) {
  const own = Number(speed) || 0
  const other = Number(targetSpeed) || 0
  let relative = angle === "rear" ? Math.abs(own - other) : angle === "front" ? own + other : own
  if (aircraft) relative *= 3
  const target = Math.ceil((Number(body) || 0) * collisionMultiplier(relative)) + Math.max(0, net)
  return {
    target, initiator: angle === "front" ? target : Math.ceil(target / 2), relative
  }
}

/*
 * The actions. Each one:
 *   rules     "book" (core book, setting off), "r5" (setting on), "both"
 *   page      where it is written
 *   target    it is taken against another vehicle of the chase
 *   opposed   the target rolls the same test against it
 *   ranges    the ranges of the pair it may be taken at (null: any)
 *   optimal   its optimal Speed (R5 p. 176), null for « toute vitesse »
 *   kinds     the vehicle kinds that may take it (null: any)
 *   limit     "environment": [Speed or Handling] by the chase environment of the turn (SR5 p. 205); else Handling
 *   roll      false for the Control a Vehicle action, which rolls nothing
 *   threshold (ctx) => the threshold before the control rig
 *   resolve   (r) => {success, net, effects, notes}
 */
const terrainOnly = ctx => ctx.terrain
const terrainAndSpeed = action => ctx => ctx.terrain + optimalSpeedModifier(ctx.speed, action.optimal)

function noEffect(success, net = 0, notes = []) {
  return {
    success, net, effects: [], notes
  }
}

export const CHASE_ACTIONS = {
}

/** Add a chase action, or replace one of the same key (part 3: the stunts and the Edge actions) */
export function registerChaseAction(key, action) {
  CHASE_ACTIONS[key] = {
    rules: "both", target: false, opposed: false, ranges: null, optimal: null, kinds: null, limit: "handling",
    roll: true, threshold: terrainOnly, ...action, key,
  }
  return CHASE_ACTIONS[key]
}

// Control a Vehicle (SR5 p. 203, R5 p. 176-177): a Complex Action, no test
registerChaseAction("control", {
  rules: "both", page: "SR5 p. 203", roll: false, complexAction: true, threshold: () => 0,
  resolve: r => ({
    success: true, net: 0, effects: [{
      type: "control", id: r.initiatorId
    }], notes: []
  }),
})

// ---- Core book (SR5 p. 204-205) ----

// Catch-Up / Break Away: [Speed or Handling], threshold of the maneuver (SR5 p. 200) + Terrain (p. 201); one range per
// net hit, at most the Acceleration. Past Extreme, the pursuer may roll the same test to stay at Extreme
registerChaseAction("catchUpBook", {
  rules: "book", page: "SR5 p. 205", target: true, limit: "environment",
  threshold: ctx => (ctx.maneuver ?? 2) + ctx.terrain,
  resolve: r => {
    const net = excessHits(r.hits, r.threshold)
    if (r.hits < r.threshold) return noEffect(false)
    const move = catchUpSteps({
      net, acceleration: r.acceleration, role: r.initiatorRole, range: r.range, advanced: false
    })
    const effects = []
    if (move.now) effects.push({
      type: "shift", a: r.initiatorId, b: r.targetId, steps: move.now
    })
    if (move.escape) effects.push({
      type: "followUp", vehicle: r.targetId, test: "stayAtExtreme", threshold: r.rawThreshold,
      a: r.initiatorId, b: r.targetId,
    })
    return {
      success: true, net, effects, notes: []
    }
  },
})

// Cut Off (Short only): opposed [Handling]; won, the target rolls a piloting test, threshold = net hits + Terrain, or
// crashes
registerChaseAction("cutOffBook", {
  rules: "book", page: "SR5 p. 205", target: true, opposed: true, ranges: ["short"], threshold: () => 0,
  resolve: r => {
    if (!winsOpposed(r)) return noEffect(false)
    const net = r.hits - r.opposingHits
    return {
      success: true, net, notes: [], effects: [{
        type: "followUp", vehicle: r.targetId, test: "avoidCrash", threshold: net + r.terrain, a: r.initiatorId,
        b: r.targetId,
      }]
    }
  },
})

// Ram (Short only): opposed [Speed or Handling]; won, the vehicles collide: the target takes the attacker's Body + net
// hits, the attacker half its Body (rounded up, as for any ramming, SR5 p. 204)
registerChaseAction("rammingBook", {
  rules: "book", page: "SR5 p. 205", target: true, opposed: true, ranges: ["short"], limit: "environment",
  threshold: () => 0,
  resolve: r => {
    if (!winsOpposed(r)) return noEffect(false)
    const net = r.hits - r.opposingHits
    return {
      success: true, net, effects: [], notes: [{
        key: "SR5.CHASE_NoteRamming", data: {
          target: (Number(r.body) || 0) + net, initiator: Math.ceil((Number(r.body) || 0) / 2)
        }
      }]
    }
  },
})

// ---- Rigger 5.0 (R5 p. 176-181) ----

// Quick Turn: threshold Terrain + the target's Speed; one net hit puts the vehicle behind the target at Extreme, each
// further one a range nearer, down to Contact
registerChaseAction("quickTurn", {
  rules: "r5", page: "R5 p. 176", target: true,
  threshold: ctx => ctx.terrain + (Number(ctx.targetSpeed) || 0),
  resolve: r => {
    const net = excessHits(r.hits, r.threshold)
    if (net < 1) return noEffect(false)
    return {
      success: true, net, notes: [], effects: [{
        type: "setRange", a: r.initiatorId, b: r.targetId, range: behindRange(net + stuntRangeBonus(r.stunt, "quickTurn"), true, "contact")
      }, {
        type: "roles", pursuer: r.initiatorId, pursued: r.targetId
      }]
    }
  },
})

// Catch-Up / Break Away: opposed [Handling], threshold Terrain + the Speed gap, the Terrain alone for the fastest
// vehicle of all; one range per net hit, at most the Acceleration. Past Extreme, each pursuer rolls a last test
// (Terrain + the gap), each of its net hits takes a range off the move
registerChaseAction("catchUp", {
  rules: "r5", page: "R5 p. 177", target: true, opposed: true,
  threshold: ctx => ctx.terrain + (ctx.fastest ? 0 : Math.ceil(Number(ctx.gap) || 0)),
  resolve: r => {
    const net = opposedNet(r)
    if (!net) return noEffect(false)
    // A won stunt's successes may go past the Acceleration, never past its double (R5 p. 182)
    const bonus = stuntRangeBonus(r.stunt, "catchUp")
    const acceleration = (Number(r.acceleration) || 0) * (bonus ? 2 : 1)
    const move = catchUpSteps({
      net: net + bonus, acceleration, role: r.initiatorRole, range: r.range, advanced: true, aircraft: r.aircraft
    })
    const effects = []
    if (move.now) effects.push({
      type: "shift", a: r.initiatorId, b: r.targetId, steps: move.now
    })
    if (move.escape) effects.push({
      type: "followUp", vehicle: r.targetId, test: "escapeR5", threshold: r.rawThreshold, a: r.initiatorId,
      b: r.targetId, applied: move.now, total: move.escape.total, toEscape: move.escape.toEscape,
    })
    return {
      success: true, net, effects, notes: []
    }
  },
})

// Crazy Ivan: (Terrain); each net hit lowers the threshold of the Sensor or Perception test that spots a tail
registerChaseAction("crazyIvan", {
  rules: "r5", page: "R5 p. 178",
  resolve: r => {
    const net = excessHits(r.hits, r.threshold)
    return noEffect(r.hits >= r.threshold, net, net ? [{
      key: "SR5.CHASE_NoteCrazyIvan", data: {
        net
      }
    }] : [])
  },
})

// Cut Off (Short only): opposed (Terrain); won, the target rolls a driving test, threshold Terrain + net hits, or crashes
registerChaseAction("cutOff", {
  rules: "r5", page: "R5 p. 178", target: true, opposed: true, ranges: ["short"],
  resolve: r => {
    if (!winsOpposed(r)) return noEffect(false)
    const net = opposedNet(r)
    return {
      success: true, net, notes: [], effects: [{
        type: "followUp", vehicle: r.targetId, test: "avoidCrash", threshold: r.terrain + net, a: r.initiatorId,
        b: r.targetId,
      }]
    }
  },
})

// Discreet Pursuit: (Terrain + distance); net hits raise the threshold to spot the tail, at most 1 + Terrain
registerChaseAction("discreetPursuit", {
  rules: "r5", page: "R5 p. 178", target: true,
  threshold: ctx => ctx.terrain + (TRAIL_DISTANCE[ctx.range] ?? 0),
  resolve: r => {
    const net = Math.min(excessHits(r.hits, r.threshold), 1 + Math.max(0, r.terrain))
    return noEffect(r.hits >= r.threshold, net, net ? [{
      key: "SR5.CHASE_NoteDiscreetPursuit", data: {
        net
      }
    }] : [])
  },
})

// Drive-By (Medium or Short, optimal Speed 2): net hits go to the passengers who shoot, as a teamwork test
const driveBy = registerChaseAction("driveBy", {
  rules: "r5", page: "R5 p. 178", target: true, ranges: ["short", "medium"], optimal: 2,
  resolve: r => {
    const net = excessHits(r.hits, r.threshold)
    return noEffect(r.hits >= r.threshold, net, net ? [{
      key: "SR5.CHASE_NoteDriveBy", data: {
        net
      }
    }] : [])
  },
})
driveBy.threshold = terrainAndSpeed(driveBy)

// Like a Glove: a harder Terrain the pilot picks, its modifier as the threshold. Failed: collision damage = Speed +
// that Terrain, the Terrain stays. Won: every opposing vehicle rolls with the new Terrain; failed, it falls two ranges
// back and has −2 dice to Catch-Up while that Terrain lasts. The new Terrain stays until the end of the combat.
// End Run (R5 p. 178 sidebar, VO p. 176): a path the pursuers cannot follow, +2 when the vehicles differ in kind or
// size; won, the chase ends for them
registerChaseAction("likeAGlove", {
  rules: "r5", page: "R5 p. 178",
  threshold: ctx => (Number(ctx.newTerrainValue) || 0) + (ctx.endRun && ctx.endRunHarder ? 2 : 0),
  resolve: r => {
    if (r.hits < r.threshold) return noEffect(false, 0, [{
      key: "SR5.CHASE_NoteLikeAGloveFailed", data: {
        dv: (Number(r.speed) || 0) + (Number(r.newTerrainValue) || 0)
      }
    }])
    const opponents = r.opponents ?? []
    if (r.endRun) return {
      success: true, net: excessHits(r.hits, r.threshold), notes: [], effects: opponents.map(id => ({
        type: "escape", a: r.initiatorId, b: id
      }))
    }
    return {
      success: true, net: excessHits(r.hits, r.threshold), notes: [], effects: [{
        type: "terrain", key: r.newTerrain
      }, ...opponents.map(id => ({
        type: "followUp", vehicle: id, test: "newTerrain", threshold: Number(r.newTerrainValue) || 0, a: r.initiatorId,
        b: id, terrain: r.newTerrain,
      }))]
    }
  },
})

// Pull Ahead / Snatch and Grab (Contact, optimal Speed 2): the target is aboard; failed, the collision rules
const snatch = registerChaseAction("snatch", {
  rules: "r5", page: "R5 p. 179", optimal: 2,
  resolve: r => noEffect(r.hits >= r.threshold, excessHits(r.hits, r.threshold), [{
    key: r.hits >= r.threshold ? "SR5.CHASE_NoteSnatchWon" : "SR5.CHASE_NoteSnatchFailed", data: {
    }
  }]),
})
snatch.threshold = terrainAndSpeed(snatch)

// PIT (Short only): opposed (Terrain); won, the target's Handling goes down by the net hits (0: pinned); lost, the
// initiator's Speed goes down by the gap
registerChaseAction("pit", {
  rules: "r5", page: "R5 p. 179", target: true, opposed: true, ranges: ["short"],
  resolve: r => {
    if (winsOpposed(r)) {
      const net = opposedNet(r)
      return {
        success: true, net, notes: [], effects: net ? [{
          type: "handling", id: r.targetId, delta: -net
        }] : []
      }
    }
    const gap = Math.max(0, (Number(r.opposingHits) || 0) - (Number(r.hits) || 0))
    return {
      success: false, net: 0, notes: [], effects: gap ? [{
        type: "speed", id: r.initiatorId, value: Math.max(0, (Number(r.speed) || 0) - gap)
      }] : []
    }
  },
})

// Collision (Short only): opposed (Terrain); won, damage by the Collision table (R5 p. 179)
registerChaseAction("collision", {
  rules: "r5", page: "R5 p. 179", target: true, opposed: true, ranges: ["short"],
  resolve: r => {
    if (!winsOpposed(r)) return noEffect(false)
    const net = opposedNet(r)
    const damage = collisionDamage({
      angle: r.angle, speed: r.speed, targetSpeed: r.targetSpeed, body: r.body, net, aircraft: r.aircraft
    })
    return noEffect(true, net, [{
      key: "SR5.CHASE_NoteCollision", data: {
        target: damage.target, initiator: damage.initiator
      }
    }])
  },
})

// Sow Chaos: (Terrain); won, Terrain +1 for the actions of the pursuers under 100 m until the end of the Combat Turn,
// once a turn
registerChaseAction("sowChaos", {
  rules: "r5", page: "R5 p. 179", oncePerTurn: true,
  resolve: r => {
    if (r.hits < r.threshold) return noEffect(false)
    const net = excessHits(r.hits, r.threshold)
    if (!r.nearOpponents?.length) return noEffect(true, net, [{
      key: "SR5.CHASE_NoteNobodyNear", data: {
      }
    }])
    return {
      success: true, net, notes: [], effects: [{
        type: "turnTerrain", ids: r.nearOpponents, delta: 1
      }]
    }
  },
})

// Six Pack: opposed, the target +1 die per range beyond Short; won, the initiator gets behind the target at Extreme,
// a range nearer per further net hit, down to Short. No threshold is printed: the Terrain, as every vehicle action
// (R5 p. 176)
registerChaseAction("sixPack", {
  rules: "r5", page: "R5 p. 179", target: true, opposed: true,
  resolve: r => {
    if (!winsOpposed(r)) return noEffect(false)
    const net = Math.max(1, opposedNet(r))
    return {
      success: true, net, notes: [], effects: [{
        type: "setRange", a: r.initiatorId, b: r.targetId, range: behindRange(net + stuntRangeBonus(r.stunt, "sixPack"), true, "short")
      }, {
        type: "roles", pursuer: r.initiatorId, pursued: r.targetId
      }]
    }
  },
})

// Ground vehicles

// Controlled Exit (optimal Speed 1): won, a Simple Action of combat this turn; failed, Bail Out (R5 p. 181)
const controlledExit = registerChaseAction("controlledExit", {
  rules: "r5", page: "R5 p. 180", optimal: 1, kinds: ["ground"],
  resolve: r => noEffect(r.hits >= r.threshold, 0, [{
    key: r.hits >= r.threshold ? "SR5.CHASE_NoteExitWon" : "SR5.CHASE_NoteExitFailed", data: {
      dv: (Number(r.speed) || 0) * 3
    }
  }]),
})
controlledExit.threshold = terrainAndSpeed(controlledExit)

// Drift (optimal Speed 2): won, +1 die to Catch-Up / Break Away this turn
const drift = registerChaseAction("drift", {
  rules: "r5", page: "R5 p. 180", optimal: 2, kinds: ["ground"],
  resolve: r => r.hits >= r.threshold ? {
    success: true, net: excessHits(r.hits, r.threshold), notes: [], effects: [{
      type: "flag", id: r.initiatorId, flag: "drift"
    }]
  } : noEffect(false),
})
drift.threshold = terrainAndSpeed(drift)

// Clear the Path (Medium, optimal Speed 4): each net hit takes 1 off the Terrain for the vehicles following at Medium
// or Short this turn; the initiator takes (Body / 2) + Terrain
const clearPath = registerChaseAction("clearPath", {
  rules: "r5", page: "R5 p. 180-181", optimal: 4, kinds: ["ground"],
  resolve: r => {
    const net = excessHits(r.hits, r.threshold)
    const notes = [{
      key: "SR5.CHASE_NoteClearPath", data: {
        dv: Math.ceil((Number(r.body) || 0) / 2) + (Number(r.terrain) || 0)
      }
    }]
    if (r.hits < r.threshold || !net) return noEffect(r.hits >= r.threshold, net, notes)
    if (!r.nearAllies?.length) return noEffect(true, net, [...notes, {
      key: "SR5.CHASE_NoteNobodyNear", data: {
      }
    }])
    return {
      success: true, net, notes, effects: [{
        type: "turnTerrain", ids: r.nearAllies ?? [], delta: -net
      }]
    }
  },
})
clearPath.threshold = terrainAndSpeed(clearPath)

// Aircraft

// Falling Leaf (optimal Speed 2): the aircraft drops out of the chase, its Speed falls to 0. A glitch puts it out of
// control, and a test with its Handling as the threshold follows: each hit short takes 1 off the Handling (−4 dice on
// a critical glitch)
const fallingLeaf = registerChaseAction("fallingLeaf", {
  rules: "r5", page: "R5 p. 181", optimal: 2, kinds: ["rotor", "jet"],
  resolve: r => {
    const effects = []
    if (r.hits >= r.threshold) effects.push({
      type: "speed", id: r.initiatorId, value: 0
    }, {
      type: "leave", id: r.initiatorId, reason: "fallingLeaf"
    })
    if (r.glitch) effects.push({
      type: "outOfControl", id: r.initiatorId
    }, {
      type: "followUp", vehicle: r.initiatorId, test: "handlingCheck", threshold: Number(r.handling) || 0,
      a: r.initiatorId, dice: r.criticalGlitch ? -4 : 0,
    })
    return {
      success: r.hits >= r.threshold, net: excessHits(r.hits, r.threshold), effects, notes: []
    }
  },
})
fallingLeaf.threshold = terrainAndSpeed(fallingLeaf)

// Strafe (Short or Medium, optimal Speed 2): net hits go to the vehicle's weapon fire this turn; no Catch-Up / Break
// Away this turn
const strafe = registerChaseAction("strafe", {
  rules: "r5", page: "R5 p. 181", target: true, ranges: ["short", "medium"], optimal: 2, kinds: ["rotor", "jet"],
  resolve: r => {
    const net = excessHits(r.hits, r.threshold)
    return {
      success: r.hits >= r.threshold, net, effects: [{
        type: "flag", id: r.initiatorId, flag: "noCatchUp"
      }], notes: net ? [{
        key: "SR5.CHASE_NoteStrafe", data: {
          net
        }
      }] : []
    }
  },
})
strafe.threshold = terrainAndSpeed(strafe)

// Drones

// Swarm Control (Contact or Short): (Terrain + the number of drones, two at least); won, net hits to the drones'
// attacks this turn (teamwork); failed, each drone takes the shortfall as a dice penalty
registerChaseAction("swarm", {
  rules: "r5", page: "R5 p. 181", target: true, ranges: ["contact", "short"],
  threshold: ctx => ctx.terrain + Math.max(2, Number(ctx.droneCount) || 2),
  resolve: r => r.hits >= r.threshold ? noEffect(true, excessHits(r.hits, r.threshold), [{
    key: "SR5.CHASE_NoteSwarmWon", data: {
      net: excessHits(r.hits, r.threshold)
    }
  }]) : noEffect(false, 0, [{
    key: "SR5.CHASE_NoteSwarmFailed", data: {
      malus: r.threshold - r.hits
    }
  }]),
})

// ---- Part 3: the stunts and the Edge actions ----

// Core book's Stunt (SR5 p. 205): the pursued only, [Speed or Handling] by the environment, threshold set by the
// gamemaster from the maneuver (p. 200) and the Terrain (p. 201). Failed: out of control at once, the gamemaster
// decides what comes of it. Made: every pursuer rolls the same test, same threshold, or falls a range back (getting
// away past Extreme)
registerChaseAction("stuntBook", {
  rules: "book", page: "SR5 p. 205", limit: "environment", pursuedOnly: true, stunt: true,
  threshold: ctx => (ctx.maneuver ?? 2) + ctx.terrain,
  resolve: r => {
    if (r.hits < r.threshold) return {
      success: false, net: 0, effects: [{
        type: "outOfControl", id: r.initiatorId
      }], notes: [{
        key: "SR5.CHASE_NoteStuntBookFailed", data: {
        }
      }]
    }
    const pursuers = r.pursuers ?? []
    return {
      success: true, net: excessHits(r.hits, r.threshold), notes: pursuers.length ? [] : [{
        key: "SR5.CHASE_NoteNobodyNear", data: {
        }
      }], effects: pursuers.map(id => ({
        type: "followUp", vehicle: id, test: "stuntFollow", threshold: r.rawThreshold, a: r.initiatorId, b: id,
        limit: r.limit,
      }))
    }
  },
})

// Rigger 5.0's stunts (« Conduire avec style », R5 p. 183, the advantages p. 182). The pilot picks the level. Alone, a
// Complex Action (level + Terrain); within another action, the level goes on its threshold. Never the autopilot.
export const STUNT_ADVANTAGES = ["range", "handling", "slow", "soak", "dodge", "social", "crazy"]
// The advantages written to dice never add more than +4 to a test (R5 p. 182)
export const STUNT_DICE_CAP = 4
// The actions whose range change a stunt's successes add to (R5 p. 182)
export const STUNT_RANGE_ACTIONS = ["catchUp", "quickTurn", "sixPack"]

/** The level of a stunt, 0 for none */
export function stuntLevel(stunt) {
  return Math.max(0, Math.floor(Number(stunt?.level) || 0))
}

/** The successes a won stunt adds to a range change (R5 p. 182), 0 when it is not this advantage or action */
export function stuntRangeBonus(stunt, key) {
  return stunt?.advantage === "range" && STUNT_RANGE_ACTIONS.includes(key) ? stuntLevel(stunt) : 0
}

/**
 * A crazy stunt costs a point of the pilot's Edge to try, and gets the usual Edge dice for it (R5 p. 182): the Edge
 * rating the test pushes its limit with, 0 when the stunt is not a crazy one
 */
export function crazyStuntEdge(stunt, edgeRating) {
  return stunt?.advantage === "crazy" && stuntLevel(stunt) > 0 ? Math.max(0, Number(edgeRating) || 0) : 0
}

/** The advantages a stunt may give within the action `key` (alone: `key` is "stunt") */
export function stuntAdvantagesFor(key) {
  return STUNT_ADVANTAGES.filter(a => a !== "range" || STUNT_RANGE_ACTIONS.includes(key))
}

/**
 * What a won stunt gives (R5 p. 182), its value being its level: the Handling of the vehicle for the turn (never past
 * the double), the Speed or the Handling of another vehicle, or, out of the chase, a note on the card.
 * @param {object} r turnHandling: the Handling the vehicle already gained this turn
 */
export function stuntAdvantage(stunt, {
  initiatorId, targetId, handling = 0, turnHandling = 0, targetSpeed = 0
}) {
  const level = stuntLevel(stunt)
  const none = {
    effects: [], notes: []
  }
  if (!level) return none
  const note = (key, data = {
  }) => ({
    effects: [], notes: [{
      key, data
    }]
  })
  switch (stunt.advantage) {
    case "handling": {
      const bonus = Math.max(0, Math.min(level, (Number(handling) || 0) - Math.max(0, Number(turnHandling) || 0)))
      return bonus ? {
        effects: [{
          type: "turnHandling", id: initiatorId, delta: bonus
        }], notes: []
      } : note("SR5.CHASE_NoteStuntCapped")
    }
    case "slow":
      if (!targetId) return note("SR5.CHASE_NoteNobodyNear")
      // Its Speed for this Combat Turn only, as its Handling (R5 p. 182)
      return stunt.slow === "speed" ? {
        effects: [{
          type: "turnSpeed", id: targetId, value: Math.max(0, (Number(targetSpeed) || 0) - level)
        }], notes: []
      } : {
        effects: [{
          type: "turnHandling", id: targetId, delta: -level
        }], notes: []
      }
    case "soak": return note("SR5.CHASE_NoteStuntSoak", {
      dice: Math.min(level, STUNT_DICE_CAP)
    })
    case "dodge": return note("SR5.CHASE_NoteStuntDodge", {
      hits: level
    })
    case "social": return note("SR5.CHASE_NoteStuntSocial", {
      dice: Math.min(level, STUNT_DICE_CAP)
    })
    case "crazy": return note("SR5.CHASE_NoteStuntCrazy")
    default: return none
  }
}

/**
 * A stunt within an action, or alone (R5 p. 183): won, its advantage; failed, a driving test at once, the level as a
 * dice penalty, or a crash. The book gives neither the sign of that modifier nor the threshold: −level dice and the
 * Terrain, the threshold every vehicle action starts from (R5 p. 176): arbitrage de DjamZ (08/10), kept in this one place.
 */
export function withStunt(outcome, r) {
  const level = stuntLevel(r.stunt)
  if (!level) return outcome
  if (!outcome.success) return {
    ...outcome, effects: [...(outcome.effects ?? []), {
      type: "followUp", vehicle: r.initiatorId, test: "stuntCrash", threshold: Number(r.terrain) || 0,
      a: r.initiatorId, dice: -level, diceKey: "SR5.CHASE_DiceStunt",
    }]
  }
  const gained = stuntAdvantage(r.stunt, r)
  return {
    ...outcome, effects: [...(outcome.effects ?? []), ...gained.effects], notes: [...(outcome.notes ?? []), ...gained.notes]
  }
}

// A stunt alone: a Complex Action, (level + Terrain) — the level comes with every stunt in actionThreshold
registerChaseAction("stunt", {
  rules: "r5", page: "R5 p. 182-183", targetOptional: true, stunt: true, noAutopilot: true,
  resolve: r => noEffect(r.hits >= r.threshold, excessHits(r.hits, r.threshold)),
})

// Edge (R5 p. 178-181): one point of the pilot's Edge, spent by the system's own path as the action is launched

// Zen Driving (riggers only, jumped into this vehicle): a point of Edge keeps the vehicle under control this turn, in
// place of the Control a Vehicle action, once a turn (R5 p. 176, 179)
registerChaseAction("zenDriving", {
  rules: "r5", page: "R5 p. 179", roll: false, oncePerTurn: true, edge: "rigger", threshold: () => 0,
  resolve: r => ({
    success: true, net: 0, effects: [{
      type: "control", id: r.initiatorId
    }], notes: []
  }),
})

// Hang On Baby (riggers only, jumped in): the condition monitor is full, a point of Edge keeps the vehicle going for
// this Combat Turn, again each turn; its damage modifiers stay (R5 p. 178)
registerChaseAction("holdOn", {
  rules: "r5", page: "R5 p. 178", roll: false, edge: "rigger", needs: "destroyed", threshold: () => 0,
  resolve: r => ({
    success: true, net: 0, effects: [{
      type: "flag", id: r.initiatorId, flag: "holdOn"
    }], notes: []
  }),
})

// Leaf in the Wind (aircraft destroyed or at Speed 0, any pilot but the autopilot): a point of Edge, then a test
// (Terrain + damage modifier); each net hit takes 1 off the damage modifier of the Control a Vehicle test that softens
// the landing (R5 p. 181). Its threshold is written out: no optimal Speed gap is added
registerChaseAction("leafInWind", {
  rules: "r5", page: "R5 p. 181", kinds: ["rotor", "jet"], edge: "pilot", needs: "falling",
  threshold: ctx => ctx.terrain + Math.abs(Number(ctx.damageModifier) || 0),
  resolve: r => {
    const net = excessHits(r.hits, r.threshold)
    return noEffect(r.hits >= r.threshold, net, [{
      key: "SR5.CHASE_NoteLeafInWind", data: {
        net
      }
    }])
  },
})

/**
 * The combat actions an action that rolls nothing spends, as the vehicle test counts its own (rollData-VehicleTest.js):
 * Control a Vehicle is a Complex Action (SR5 p. 203); Zen Driving takes its place without one (R5 p. 176), and Hang On
 * Baby is no action at all (R5 p. 178). An action that rolls spends its actions through its roll.
 */
export function cardActions(key) {
  return CHASE_ACTIONS[key]?.complexAction ? [{
    type: "complex", value: 1, source: "vehicleTest"
  }] : []
}

/** The actions of a rule set, in the order of the book */
export function actionsFor(advanced) {
  return Object.values(CHASE_ACTIONS).filter(a => a.rules === "both" || a.rules === (advanced ? "r5" : "book"))
}

/**
 * Why an action may not be taken now, or null. `range`: the range of the pair with the target.
 * @param {object} p {advanced, kind, range, hasTarget, flags}; for part 3: role, controlMode (of the vehicle), edgeLeft
 *   (its pilot has a point of Edge left), monitorFull, speed
 */
export function actionRefusal(key, {
  advanced, kind, range, hasTarget, flags = {
  }, role, controlMode, edgeLeft = false, monitorFull = false, speed = 0
}) {
  const action = CHASE_ACTIONS[key]
  if (!action || !actionsFor(advanced).includes(action)) return "unknown"
  if (action.kinds && !action.kinds.includes(kind)) return "kind"
  if (action.target && !hasTarget) return "target"
  if (action.target && action.ranges && !action.ranges.includes(range)) return "range"
  if (action.oncePerTurn && flags[`${key}Used`]) return "once"
  if ((key === "catchUp" || key === "catchUpBook") && flags.noCatchUp) return "noCatchUp"
  if (action.pursuedOnly && role !== "pursued") return "pursuedOnly"
  if ((action.noAutopilot || action.edge) && controlMode === "autopilot") return "autopilot"
  if (action.edge === "rigger" && controlMode !== "rigging") return "jumpedIn"
  if (action.needs === "destroyed" && !monitorFull) return "notDestroyed"
  if (action.needs === "falling" && !monitorFull && (Number(speed) || 0) > 0) return "notFalling"
  if (action.edge && !edgeLeft) return "noEdge"
  return null
}

/** The threshold of an action, before the control rig, never under 0; a stunt's level comes on top (R5 p. 183) */
export function actionThreshold(key, ctx) {
  const action = CHASE_ACTIONS[key]
  if (!action) return 0
  return Math.max(0, Math.ceil(Number(action.threshold({
    ...ctx, terrain: Number(ctx?.terrain) || 0
  })) || 0) + stuntLevel(ctx?.stunt))
}

/**
 * The dice an action adds or takes, for the initiator or the target that opposes it.
 * @returns {Array<{key: string, value: number}>}
 */
export function actionDice(key, {
  side, range, flags = {
  }, gloveMalus = false, advanced = true
}) {
  const dice = []
  if (key === "sixPack" && side === "target") {
    const value = sixPackBonus(range, advanced)
    if (value) dice.push({
      key: "SR5.CHASE_DiceSixPack", value
    })
  }
  if ((key === "catchUp" || key === "catchUpBook") && side === "initiator") {
    if (flags.drift) dice.push({
      key: "SR5.CHASE_DiceDrift", value: 1
    })
    if (gloveMalus) dice.push({
      key: "SR5.CHASE_DiceLikeAGlove", value: -2
    })
  }
  return dice
}

/**
 * Resolve an action from its tests. `r` carries the hits, the threshold as rolled, the opposing hits, and what the
 * action reads of the chase (ids, roles, range, Speeds, Body…).
 */
export function resolveAction(key, r) {
  const action = CHASE_ACTIONS[key]
  if (!action?.resolve) return noEffect(false)
  const full = {
    opposingHits: 0, terrain: 0, ...r, hits: Number(r.hits) || 0, threshold: Number(r.threshold) || 0,
  }
  return withStunt(action.resolve(full), full)
}

/**
 * The outcome of a follow-up test a chase action asked for.
 * @param {object} pending what the action asked: {test, vehicle, threshold, a, b, …}
 * @param {{hits: number, threshold: number}} roll the threshold as rolled (lowered by a control rig)
 */
export function resolveFollowUp(pending, {
  hits, threshold
}) {
  const h = Number(hits) || 0
  const t = Number(threshold ?? pending.threshold) || 0
  const won = h >= t
  switch (pending.test) {
  // Past Extreme in the core book: the pursuer keeps a line of sight, or the pursued gets away (SR5 p. 205)
    case "stayAtExtreme":
      return won ? noEffect(true) : {
        success: false, net: 0, notes: [], effects: [{
          type: "escape", a: pending.a, b: pending.b
        }]
      }
      // Past Extreme in Rigger 5.0: each net hit of the pursuer takes a range off the move (R5 p. 177)
    case "escapeR5": {
      const net = excessHits(h, t)
      const final = Math.max(0, pending.total - net)
      if (final >= pending.toEscape) return {
        success: false, net, notes: [], effects: [{
          type: "escape", a: pending.a, b: pending.b
        }]
      }
      const back = final - pending.applied
      return {
        success: true, net, notes: [], effects: back ? [{
          type: "shift", a: pending.a, b: pending.b, steps: back
        }] : []
      }
    }
    // Cut Off: missed, the target crashes and is out of control (SR5 p. 205, R5 p. 178)
    case "avoidCrash":
      return won ? noEffect(true) : {
        success: false, net: 0, notes: [{
          key: "SR5.CHASE_NoteCrash", data: {
          }
        }], effects: [{
          type: "outOfControl", id: pending.vehicle
        }]
      }
      // Like a Glove: missed, two ranges back and −2 dice to Catch-Up while the Terrain lasts (R5 p. 178)
    case "newTerrain":
      return won ? noEffect(true) : {
        success: false, net: 0, notes: [], effects: [{
          type: "shift", a: pending.a, b: pending.b, steps: 2
        }, {
          type: "glove", id: pending.vehicle, terrain: pending.terrain
        }]
      }
      // Falling Leaf after a glitch: each hit short takes 1 off the Handling (R5 p. 181)
    case "handlingCheck":
      return won ? noEffect(true) : {
        success: false, net: 0, notes: [], effects: [{
          type: "handling", id: pending.vehicle, delta: -(t - h)
        }]
      }
      // The core book's Stunt made: a pursuer who misses the same test falls a range back, getting away past Extreme
      // (SR5 p. 205)
    case "stuntFollow":
      return won ? noEffect(true) : {
        success: false, net: 0, notes: [], effects: [{
          type: "shift", a: pending.a, b: pending.b, steps: 1
        }]
      }
      // A Rigger 5.0 stunt that failed: missed, the vehicle crashes (R5 p. 183)
    case "stuntCrash":
      return won ? noEffect(true) : {
        success: false, net: 0, notes: [{
          key: "SR5.CHASE_NoteCrash", data: {
          }
        }], effects: [{
          type: "outOfControl", id: pending.vehicle
        }]
      }
    default:
      return noEffect(false)
  }
}
