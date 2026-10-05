// An effect passed on by a card (a sustained spell, a complex form) whose value comes from the roll: hits or net
// hits (Animal Sense and Eyes of the Pack: the net hits become the Limit, Street Grimoire p. 106).
// A chat card is its author's to write, its flags included: when the GM applies the effect of a card a player
// wrote, he believes neither the hits written on it nor who it says rolled. Same method as the illusions
// (roll-helpers/illusion.js): the hits are counted again on the dice shown, within the pool the GM works out
// himself (plus the Chance for a Push the Limit), within the Force (at most twice the Magic), and the GM confirms.
import {
  countHits, poolDice
} from "./illusion.js"

// Whether one of the effects passed on reads the roll
export function readsRoll(effects){
  return Object.values(effects ?? {
  }).some(e => e?.transfer && /^(hits|netHits)(Replace)?$/.test(e.type ?? ""))
}

// The hits counted on the first dice of the card only, as many as the pool allows
function hitsWithinPool(rollJSON, allowed, limit){
  const results = rollJSON?.terms?.[0]?.results
  if (!Array.isArray(results)) return null
  const kept = results.filter(d => !d.ruleOfSix).slice(0, Math.max(0, allowed))
  const rerolls = results.filter(d => d.ruleOfSix)
  return countHits({
    terms: [{
      results: [...kept, ...rerolls]
    }]
  }, limit)
}

// The verdict on the card: who wrote it, and the hits and net hits the GM can stand by.
// The net hits keep what the card took off the hits (a threshold, the resistance), never less, so they cannot
// grow past the hits counted again
export function effectCardVerdict({
  authorOwnsCaster, itemOnCaster, rollJSON, pool, edge = 0, force, magic, claimedHits, claimedNetHits
}){
  if (!authorOwnsCaster || !itemOnCaster) return {
    ok: false, reason: "owner"
  }
  const maxForce = Math.max(1, 2 * (Number(magic) || 0))
  const limit = Math.min(Number(force) > 0 ? Number(force) : maxForce, maxForce)
  const allowed = (Number(pool) || 0) + Math.max(0, Number(edge) || 0)
  const hits = hitsWithinPool(rollJSON, allowed, limit)
  if (hits === null) return {
    ok: false, reason: "dice"
  }
  const takenOff = Math.max(0, (Number(claimedHits) || 0) - (Number(claimedNetHits) || 0))
  const netHits = Math.max(0, hits - takenOff)
  return {
    ok: true, hits, netHits, limit, allowed,
    overPool: poolDice(rollJSON) > allowed,
    mismatch: Number(claimedHits) !== hits || Number(claimedNetHits) !== netHits,
  }
}
