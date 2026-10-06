/**
 * The effect of a toxin card the GM applies (SR5 p. 409-410), when a player wrote the card (Liesel's D1, 06/10).
 *
 * Nothing is taken from the card's flags: its author writes them. The GM reads the toxin on the weapon that
 * delivered it (Power, vectors, effects, damage type), works out the Power the resister faces, counts the hits
 * again on the dice within the pool he works out on the resister's sheet, and confirms. Pure rules here; the
 * lookups are in SR5_ActorHelper.checkToxinCard.
 */
import {
  recountHits, bounded
} from "./socket-guard.js"
import {
  SR5_Toxins
} from "../../entities/items/toxins.js"

/** The called shots that add 2 to a toxin's Power (Run & Gun p. 130 and 131) */
export const TOXIN_POWER_CALLED_SHOTS = ["hitEmWhereItCounts", "downTheGullet"]

/**
 * The Power the resister faces: the weapon's toxin, +2 for a called shot aimed at it, + the net hits of an
 * engulf, +1 per extra dose (SR5 p. 410), less the resister's antitoxin (Chrome Flesh p. 154).
 */
export function toxinCardPower({
  power, toxinType, calledShot, engulfNetHits = 0, doses = 1, antitoxin = 0
}) {
  let value = Math.max(0, Number(power) || 0)
  if (value > 0 && TOXIN_POWER_CALLED_SHOTS.includes(calledShot)) value += 2
  if (toxinType === "airEngulf") value += Math.max(0, Math.floor(Number(engulfNetHits)) || 0)
  value += Math.max(1, Math.floor(Number(doses)) || 1) - 1
  return SR5_Toxins.effectivePower(value, antitoxin)
}

/**
 * The damage an air engulf deals at each of the spirit's following phases (SR5 p. 399): Magic × 2 Stun, AP −Magic,
 * without the hits of the first attack. Worked out on the engulfing spirit, never read on its victim's card (Ivo).
 */
export function engulfDamage(magic) {
  const m = Math.max(0, Math.floor(Number(magic)) || 0)
  return {
    value: m * 2, armorPenetration: m ? -m : 0, type: "stun"
  }
}

/** The vectors of the weapon's toxin the resister is not immune to (gas mask, chemical seal) */
export function toxinVectors(toxin) {
  return Object.entries(toxin?.vector ?? {
  }).filter(([, on]) => on).map(([key]) => key)
}

/**
 * Whether the GM may apply the card, and with what.
 * @param {boolean} authorOwnsTarget the card's author owns the actor the effect lands on
 * @param {boolean} sourceFound the weapon was read on a card its owner wrote
 * @param {number} power from toxinCardPower
 * @param {number} pool the resister's best toxin resistance pool on the open vectors (penetration only lowers it)
 * @param {number} edge Chance, which may add dice (SR5 p. 56)
 * @returns {{ok: boolean, reason?: string, hits?: number, value?: number, mismatch?: boolean}}
 */
export function toxinCardVerdict({
  authorOwnsTarget, sourceFound, power, rollJSON, pool, edge = 0, claimedHits
}) {
  if (!authorOwnsTarget) return {
    ok: false, reason: "notOwner"
  }
  if (!sourceFound) return {
    ok: false, reason: "noSource"
  }
  const allowed = Math.max(0, Number(pool) || 0) + Math.max(0, Number(edge) || 0)
  const counted = recountHits(rollJSON, allowed)
  if (counted === null) return {
    ok: false, reason: "noDice"
  }
  const hits = bounded(counted, allowed)
  return {
    ok: true,
    hits,
    value: Math.max(0, (Number(power) || 0) - hits),
    mismatch: hits !== Math.floor(Number(claimedHits)),
  }
}
