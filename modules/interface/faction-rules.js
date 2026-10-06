// Faction Reputation, Cutting Aces p. 156-160 (VF): the book's tables, without Foundry.
// The registry (faction-registry.js) and the gamemaster's window (factions-app.js) build on these.

// Typical factions, p. 156
export const FACTION_TYPES = ["gang", "corporation", "district", "syndicate", "society", "other"]

// Faction Reputation Scores table, p. 157. "perWeek" is the extra -1 per full week of a long con.
export const FACTION_REASONS = {
  negotiationKept     : 1,
  negotiationBroken   : -2,
  conUndetected       : 1,
  shortConDetected    : -3,
  longConDetected     : -5,
  longConExtraWeek    : -1,
  intimidation        : -1,
  harm                : -2,
  kill                : -10,
  advanceGoals        : 2,
  setBackGoals        : -2,
  custom              : 0,
}

// Advancing a faction "generally" sets back its enemies (p. 159): the reason offered to them
export const ENEMY_REASON = "setBackGoals"

// Faction Reputation Spending table, p. 160. The VF table reads "Cote de Rue" (Street Cred) and
// "Notoriété" (the VF names Notoriety "Rumeur"), the text "Crédibilité / Rumeur": the same two scores.
export const FACTION_SPENDS = {
  contactInfluence : 10,
  newContact       : 20,
  streetCred       : 10,
  notoriety        : 20,
  serviceAsk       : 2,
  serviceGranted   : 3,
}

/**
 * Attitude shift from the Faction Reputation Consequences table, p. 160.
 * The table writes "20 à 25" and "25 et plus": 25 is read as +4.
 * @param {number} score
 * @returns {number} steps, -4 to +4 (positive = friendlier)
 */
export function attitudeShift(score){
  const s = Number(score) || 0
  if (s >= 25) return 4
  if (s >= 20) return 3
  if (s >= 15) return 2
  if (s >= 10) return 1
  if (s > -10) return 0
  if (s > -15) return -1
  if (s > -20) return -2
  if (s > -25) return -3
  return -4
}

// The NPC attitudes of SR5 p. 142, friendliest first (same keys as SR5.socialAttitude)
export const ATTITUDES = ["friendly", "neutral", "suspicious", "prejudiced", "hostile", "enemy"]

/**
 * Moves an attitude by a number of steps, clamped to the table.
 * @param {string} base - an ATTITUDES key, "neutral" when unknown
 * @param {number} steps - positive = friendlier
 */
export function shiftAttitude(base, steps){
  let i = ATTITUDES.indexOf(base)
  if (i < 0) i = ATTITUDES.indexOf("neutral")
  return ATTITUDES[Math.min(ATTITUDES.length - 1, Math.max(0, i - steps))]
}

/**
 * Spending never takes the score below zero (p. 159).
 */
export function canSpend(score, cost){
  return (Number(score) || 0) - cost >= 0
}

/**
 * Total of a long con found out (p. 158): -5, and -1 per full week beyond the first day.
 * @param {number} days - how long the con ran
 */
export function longConPenalty(days){
  const weeks = Math.max(0, Math.floor((Number(days) || 0) / 7))
  return FACTION_REASONS.longConDetected + weeks * FACTION_REASONS.longConExtraWeek
}

/**
 * Sum of the applied movements of one character with one faction.
 * @param {Array} log - registry entries {factionId, actorId, delta, pending}
 */
export function scoreOf(log, factionId, actorId){
  return (log ?? [])
    .filter(e => !e.pending && e.factionId === factionId && e.actorId === actorId)
    .reduce((sum, e) => sum + (Number(e.delta) || 0), 0)
}

/**
 * Whether a contact's Influence was already raised this game month (p. 159: once a month per contact).
 * @param {{year:number, month:number}|null} last - calendar components of the last raise
 * @param {{year:number, month:number}} now
 */
export function sameGameMonth(last, now){
  return !!last && last.year === now.year && last.month === now.month
}
