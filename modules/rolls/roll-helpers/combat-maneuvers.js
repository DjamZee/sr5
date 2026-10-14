// Combat maneuvers of a small unit (Run & Gun p. 112-116, Street Lethal p. 180-181). Pure rules, without Foundry: the
// window, the card and the GM's ledger live in system/combat-maneuvers.js.
//
// RG p. 113: the leader rolls Small Unit Tactics + Intuition [Mental] (errata p. 98: the limit), the members a teamwork
// test (SR5 p. 51) with the skill or Intuition - 1 by default; ordering it and rolling it are free actions, explaining an
// unknown maneuver a complex action (a simple one through an RP-Tac of level II or III, RG p. 119). The bonuses come at
// once and hold for the combat turn: a new test is needed the next turns. A failed test leaves every member out of place
// with a penalty on his defense tests equal to the bonus, for the initiative pass; a member's complication on a success
// leaves him alone out of place; a critical glitch of anyone fails the maneuver, its penalties for the whole turn.

// The rolls a bonus goes to (system/combat-maneuvers.js tells them from a prepared roll):
// attack, rangedAttack, meleeAttack, autoAttack (SA, BF, FA, Run & Gun p. 116), defense, perception, pilot
// info: a bonus the table applies (to the enemies, to another unit, to the armor), told on the card only
export const COMBAT_MANEUVERS = {
  floatingRearguard: {
    page: "RG 113", threshold: 2, bonuses: [{
      rolls: "perception", value: 1
    }], initiative: 2, failPenalty: 1,
  },
  packAttack: {
    page: "RG 114", threshold: 3, perHits: 3, bonuses: [{
      rolls: "meleeAttack", value: 0
    }], failPenalty: 0,
  },
  fireShield: {
    page: "RG 114", threshold: null, bonuses: [{
      rolls: "attack", value: 4
    }, {
      rolls: "defense", value: 4
    }], failPenalty: 4, info: true,
  },
  bounding: {
    page: "RG 114", threshold: 4, bonuses: [{
      rolls: "defense", value: 3
    }], failPenalty: 3, info: true,
  },
  explosiveEntry: {
    page: "RG 114", threshold: 4, detection: true, bonuses: [{
      rolls: "attack", value: 3
    }], failPenalty: 3, info: true,
  },
  dynamicEntry: {
    page: "RG 114", threshold: 4, detection: true, bonuses: [{
      rolls: "attack", value: 3
    }], failPenalty: 3,
  },
  crossfire: {
    page: "RG 114-115", threshold: 6, bonuses: [{
      rolls: "attack", value: 3
    }], failPenalty: 3,
  },
  diamond: {
    page: "RG 115", threshold: 4, bonuses: [], initiative: 2, failPenalty: 1, info: true,
  },
  slicingPie: {
    page: "RG 115-116", threshold: 1, perHits: 1, leaderOnly: true, lasting: true, bonuses: [{
      rolls: "defense", value: 0
    }], failPenalty: 0, criticalPenalty: 2, info: true,
  },
  castle: {
    page: "RG 116", threshold: 5, bonuses: [{
      rolls: "defense", value: 2
    }], failPenalty: 2,
  },
  saturation: {
    page: "RG 116", threshold: 6, bonuses: [{
      rolls: "autoAttack", value: 4
    }], failPenalty: 4,
  },
  coordinatedEffort: {
    page: "SL 180", threshold: 3, bonuses: [{
      rolls: "rangedAttack", value: 2
    }, {
      rolls: "pilot", value: 2
    }], failPenalty: 2,
  },
  indirectFire: {
    page: "SL 180", threshold: 4, mapAndBinoculars: true, bonuses: [], failPenalty: 0, info: true,
  },
  targetDesignation: {
    page: "SL 180", threshold: 4, bonuses: [], failPenalty: 0, info: true,
  },
  penetratingFire: {
    page: "SL 180-181", threshold: 4, bonuses: [], failPenalty: 0, info: true,
  },
  shieldWall: {
    page: "SL 181", threshold: 3, netHits: true, bonuses: [{
      rolls: "defense", value: 0
    }], failPenalty: 0, info: true,
  },
}

/** The threshold of a maneuver for the options chosen: SL p. 180 adds 1 to Indirect Fire without a wireless RP-Tac */
export function maneuverThreshold(key, {
  threshold = null, mapAndBinoculars = false
} = {
}) {
  const m = COMBAT_MANEUVERS[key]
  if (!m) return null
  // The gamemaster's own threshold (RG p. 113: he adds or takes off for the team's preparation; Fire Shield has none)
  const custom = threshold === null || threshold === "" ? NaN : Number(threshold)
  const base = custom > 0 ? custom : m.threshold
  if (!(base > 0)) return null
  return base + (m.mapAndBinoculars && mapAndBinoculars ? 1 : 0)
}

/**
 * The bonuses of a maneuver that succeeded, by roll: a variable one from the leader's hits (Pack Attack: 1 per 3 hits,
 * Slicing the Pie: 1 per hit, Shield Wall: the net hits), the entries +1 once the team was spotted (RG p. 114)
 */
export function maneuverBonuses(key, {
  hits = 0, threshold = 0, detected = false
} = {
}) {
  const m = COMBAT_MANEUVERS[key]
  if (!m) return []
  return m.bonuses.map(b => {
    let value = b.value
    if (m.perHits) value = Math.floor((Number(hits) || 0) / m.perHits)
    if (m.netHits) value = Math.max(0, (Number(hits) || 0) - (Number(threshold) || 0))
    if (m.detection && detected) value = 1
    return {
      rolls: b.rolls, value
    }
  }).filter(b => b.value > 0)
}

/**
 * The outcome of a maneuver test (RG p. 113).
 * @param {string} key
 * @param {object} test
 * @param {number} test.hits the leader's hits, the team's dice and limit included
 * @param {number} test.threshold
 * @param {boolean} test.leaderGlitch, test.leaderCritical
 * @param {string} test.leaderUuid
 * @param {Array<{uuid, glitch, criticalGlitch}>} test.assists
 * @param {boolean} test.detected (the entries)
 * @returns {{success, critical, bonuses, members: Object<string, {bonus: boolean, penalty: number, turn: boolean}>}}
 */
export function resolveManeuver(key, {
  hits = 0, threshold = 0, leaderGlitch = false, leaderCritical = false, leaderUuid = null, assists = [], detected = false
} = {
}) {
  const m = COMBAT_MANEUVERS[key]
  const everyone = [{
    uuid: leaderUuid, glitch: leaderGlitch, criticalGlitch: leaderCritical
  }, ...(m?.leaderOnly ? [] : assists)].filter(a => a.uuid)
  const critical = everyone.some(a => a.criticalGlitch)
  const success = !!m && !critical && (Number(hits) || 0) >= (Number(threshold) || 0) && (Number(hits) || 0) > 0
  const bonuses = success ? maneuverBonuses(key, {
    hits, threshold, detected
  }) : []
  const penalty = m ? (critical && m.criticalPenalty ? m.criticalPenalty : m.failPenalty) : 0
  const members = {
  }
  for (const a of everyone) {
    if (success && !a.glitch) members[a.uuid] = {
      bonus: true, penalty: 0, turn: true
    }
    // Out of place: a failure for the pass, a critical glitch for the whole turn (RG p. 113)
    else members[a.uuid] = {
      bonus: false, penalty, turn: critical
    }
  }
  return {
    success, critical, bonuses, members
  }
}

/** Whether an entry of the ledger still holds, at a point of the combat ({combatId, round, pass}) */
export function entryHolds(holds, now) {
  if (!holds) return true
  if (!now?.combatId || now.combatId !== holds.combatId || now.round !== holds.round) return false
  return holds.pass === null || holds.pass === undefined || holds.pass === now.pass
}

/**
 * The boxes a roll gets from the maneuvers its roller takes part in.
 * @param {Object} ledger {cardId: entry}, an entry {label, members: {uuid: {bonus, penalty, holds}}, bonuses}
 * @param {string} uuid the roller
 * @param {Set<string>} kinds what the roll is (attack, rangedAttack, meleeAttack, autoAttack, defense, perception, pilot)
 * @param {object} now the point of the combat
 */
export function maneuverOffers(ledger, uuid, kinds, now) {
  const offers = []
  for (const [cardId, entry] of Object.entries(ledger ?? {
  })) {
    const member = entry?.members?.[uuid]
    if (!member || !entryHolds(member.holds, now)) continue
    if (member.bonus) {
      const value = (entry.bonuses ?? []).filter(b => kinds.has(b.rolls)).reduce((t, b) => Math.max(t, b.value), 0)
      if (value > 0) offers.push(offer(`maneuver_${cardId}`, entry.label, value))
    } else if (member.penalty > 0 && kinds.has("defense")) offers.push(offer(`maneuver_${cardId}`, entry.label, -member.penalty))
  }
  return offers
}

function offer(key, label, value) {
  return {
    key, kind: "dicePool", label, when: "", value, isMalus: value < 0, checked: true, hidden: false, indirect: true
  }
}

/** The ledger without the entries that no longer hold for anyone (an ended combat, a past turn) */
export function prunedLedger(ledger, now) {
  const out = {
  }
  for (const [id, entry] of Object.entries(ledger ?? {
  })) {
    if (Object.values(entry?.members ?? {
    }).some(m => entryHolds(m.holds, now))) out[id] = entry
  }
  return out
}

// RG p. 119: what an RP-Tac of level II or III gives the leader who coordinates through it
export function tacnetCoordination(level) {
  const n = Number(level) || 0
  if (n >= 3) return {
    instructions: "simple", initiative: [10, 5, 5]
  }
  if (n === 2) return {
    instructions: "simple", initiative: [5]
  }
  return {
    instructions: "complex", initiative: []
  }
}

/** A member's assist pool: his Small Unit Tactics, or Intuition - 1 by default (RG p. 113, SR5 p. 130), never below 0 */
export function assistPool(skillPool, intuition, penalty = 0) {
  if (skillPool !== null && skillPool !== undefined) return Math.max(0, Number(skillPool) || 0)
  return Math.max(0, (Number(intuition) || 0) - 1 + (Number(penalty) || 0))
}
