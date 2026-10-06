// Ritual participants (SR5 p. 298-299) and the teamwork test that seals the ritual (SR5 p. 51).
// Pure rules, without Foundry: the chat card that gathers the participants lives in ritualCircle.js.

// SR5 p. 298, step 1: a participant of another tradition than the leader has -2 dice on every action of the ritual.
// An unset tradition cannot be compared: no penalty rather than a guessed one.
export const RITUAL_TRADITION_PENALTY = -2
export function ritualTraditionPenalty(leaderTradition, participantTradition) {
  if (!leaderTradition || !participantTradition) return 0
  return leaderTradition === participantTradition ? 0 : RITUAL_TRADITION_PENALTY
}

// SR5 p. 299, step 7: each participant rolls Ritual Spellcasting + Magic [Force].
// Ritual Spellcasting cannot be defaulted (SR5 p. 145, "Défausse : non"): without the skill, the participant still joins
// (they need not know the ritual, p. 298) but brings no die.
export function ritualAssistPool(skillRating, skillDicePool, penalty = 0) {
  if (!(skillRating > 0)) return 0
  return Math.max(0, (skillDicePool || 0) + penalty)
}

// Reads one assistant's dice (SR5 p. 47): a hit on 5 or 6, capped by the limit [Force];
// a complication when more than half the dice show a 1, a critical glitch when it comes with no hit.
export function readAssistDice(results, limit) {
  const pool = results.length
  const rawHits = results.filter(r => r >= 5).length
  const ones = results.filter(r => r === 1).length
  const glitch = pool > 0 && ones > pool / 2
  return {
    hits: Math.min(rawHits, Math.max(0, limit)),
    glitch,
    criticalGlitch: glitch && rawHits === 0,
  }
}

// SR5 p. 51, teamwork test: every hit of an assistant adds a die to the leader, up to the leader's skill rating;
// every assistant with at least one hit raises the limit by 1. A complication cancels that assistant's limit bonus,
// a critical glitch of any assistant cancels the limit bonus of all of them.
export function teamworkBonus(leaderSkillRating, assists) {
  const list = assists || []
  const hits = list.reduce((total, a) => total + (a.hits || 0), 0)
  const dice = Math.min(hits, Math.max(0, leaderSkillRating || 0))
  const anyCritical = list.some(a => a.criticalGlitch)
  const limit = anyCritical ? 0 : list.filter(a => a.hits > 0 && !a.glitch).length
  return {
    dice, limit, anyCritical
  }
}

// Street Grimoire p. 122: "Adept" rituals cannot benefit from a group unless stated otherwise.
export function ritualAcceptsHelp(ritual) {
  return !ritual?.adeptRitual
}

// Street Grimoire p. 122: a "Contractual" ritual needs at least two participants, the leader included.
export function contractualLacksParticipant(ritual, participantCount) {
  return !!ritual?.contractual && !(participantCount > 0)
}

// SR5 p. 299: each participant takes the Drain, the leader included; one entry per actor.
export function ritualDrainRecipients(leader, participants) {
  const seen = new Set()
  const out = []
  for (const p of [leader, ...(participants || [])]) {
    if (!p?.actorId || seen.has(p.actorId)) continue
    seen.add(p.actorId)
    out.push({
      actorId: p.actorId, name: p.name
    })
  }
  return out
}

// One assist per actor: the first card posted counts, a second click is a mistake, not a second assistant.
export function uniqueAssists(assists, leaderId) {
  const seen = new Set()
  return (assists || []).filter(a => {
    if (!a?.actorId || a.actorId === leaderId || seen.has(a.actorId)) return false
    seen.add(a.actorId)
    return true
  })
}

// The chat button key of a participant's Drain, and the actor it names
export const RITUAL_DRAIN_PREFIX = "ritualDrain_"
// SR5 p. 299 with its errata (« attribut Magie » and not « test de Magie »): the Drain is physical when the leader's
// hits on the sealing test (within its Limit, raised by the team) exceed the leader's Magic, read from the sheet.
// The hits only choose the leader's own Drain type: a card that lowered them would harm no one but its author
export function ritualDrainType(leaderHits, leaderMagic) {
  return (Number(leaderHits) || 0) > (Number(leaderMagic) || 0) ? "physical" : "stun"
}

export function ritualDrainKey(actorId) {
  return `${RITUAL_DRAIN_PREFIX}${actorId}`
}
export function ritualDrainActorId(key) {
  return typeof key === "string" && key.startsWith(RITUAL_DRAIN_PREFIX) ? key.slice(RITUAL_DRAIN_PREFIX.length) : null
}
