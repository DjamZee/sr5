// Illusions to see through: Invisibility and Mask (SR5 p. 294), and their vehicle variants (Grimoire p. 111).
// Whoever is in a position to perceive the subject must first resist the spell; the caster rolls once and his
// hits are the threshold for everyone who resists later. A mana illusion is resisted with Logic + Willpower and
// fools no technological system, a physical one with Intuition + Logic, a device with its object resistance
// (SR5 p. 292). An attacker who cannot see or locate the invisible subject takes the blind fire modifier, -6
// (SR5 p. 180, the same as total darkness: they do not add up).
// The threshold and who has seen through it live in a hidden world setting written by the active GM alone:
// a card or an item is its author's to write, a threshold the GM must trust is not.

export const ILLUSION_KINDS = ["invisibility", "mask"]
export const BLIND_FIRE = -6

// The attributes an illusion is resisted with (SR5 p. 292)
export function illusionResistanceAttributes(spellType){
  return spellType === "physical" ? ["intuition", "logic"] : ["logic", "willpower"]
}

// A mana illusion affects the mind: a drone, a device, a camera are never fooled by it (SR5 p. 292)
export function isFooledBy(spellType, observerType){
  if (spellType === "physical") return true
  return !["actorDrone", "actorDevice"].includes(observerType)
}

// A chat card is its author's to write, its flags included: the dice it shows are no proof (a message's own
// rolls are empty for the system's cards, and Foundry would not check them anyway). The GM therefore counts
// the hits again on the dice shown, never trusts the number written beside them, and bounds them by what he
// can work out himself. Dice forged but plausible remain possible: a casting is confirmed by the GM.

// The hits on the dice of a card (roll.r of its flags): 5s and 6s still kept, at most the limit
export function countHits(rollJSON, limit){
  const results = rollJSON?.terms?.[0]?.results
  if (!Array.isArray(results)) return null
  const hits = results.filter(d => d.active !== false && d.discarded !== true && Number(d.result) >= 5).length
  const cap = Number(limit) > 0 ? Number(limit) : Infinity
  return Math.min(hits, cap)
}

// The dice of the pool proper: the rerolls of the Rule of Six are added after it (SR5 p. 58)
export function poolDice(rollJSON){
  const results = rollJSON?.terms?.[0]?.results
  return Array.isArray(results) ? results.filter(d => !d.ruleOfSix).length : 0
}

// A resistance card: its author owns the observer, and it rolled no more dice than the observer has (his
// resistance pool worked out by the GM, plus his Chance for a Push the Limit, SR5 p. 56)
export function resistanceVerdict({
  authorOwnsObserver, rollJSON, pool, edge = 0
}){
  if (!authorOwnsObserver) return {
    ok: false, reason: "owner"
  }
  const hits = countHits(rollJSON)
  if (hits === null) return {
    ok: false, reason: "dice"
  }
  if (poolDice(rollJSON) > pool + Math.max(0, edge)) return {
    ok: false, reason: "pool"
  }
  return {
    ok: true, hits
  }
}

// A casting card: its author owns the caster, the spell is the caster's, the message counts once, and the hits
// counted again stay within the Force, itself at most twice the Magic (SR5 p. 281). What is left is for the GM
export function castVerdict({
  authorOwnsCaster, spellOnCaster, messageUsed, rollJSON, force, magic, claimedHits
}){
  if (!authorOwnsCaster || !spellOnCaster) return {
    ok: false, reason: "owner"
  }
  if (messageUsed) return {
    ok: false, reason: "message"
  }
  const maxForce = Math.max(1, 2 * (Number(magic) || 0))
  const limit = Math.min(Number(force) > 0 ? Number(force) : maxForce, maxForce)
  const hits = countHits(rollJSON, limit)
  if (hits === null) return {
    ok: false, reason: "dice"
  }
  return {
    ok: hits > 0, reason: hits > 0 ? null : "noHits", hits, limit, mismatch: Number(claimedHits) !== hits
  }
}

// Whether a message already set a threshold
export function messageUsed(ledger, messageId){
  return Object.values(ledger ?? {
  }).some(e => e.messageId === messageId)
}

// The ledger once a spell is cast again: a new casting, a new threshold, and nobody has seen through it yet
export function ledgerAfterCast(ledger, {
  spellUuid, kind, spellType, threshold, subjectUuid, subjectName, messageId
}){
  const next = {
    ...(ledger ?? {
    })
  }
  if (!spellUuid || !ILLUSION_KINDS.includes(kind) || !(threshold > 0) || !subjectUuid) return next
  next[spellUuid] = {
    kind, spellType: spellType === "physical" ? "physical" : "mana", threshold, subjectUuid, subjectName: subjectName ?? "", messageId: messageId ?? "", pierced: []
  }
  return next
}

// The ledger once an observer has resisted. Resisting "successfully" against a threshold: hits >= threshold
export function ledgerAfterResistance(ledger, spellUuid, observerUuid, hits){
  const entry = ledger?.[spellUuid]
  if (!entry || !observerUuid) return {
    ledger: {
      ...(ledger ?? {
      })
    }, pierced: false, known: false
  }
  const pierced = (Number(hits) || 0) >= entry.threshold
  const next = {
    ...ledger
  }
  if (pierced && !entry.pierced.includes(observerUuid)) next[spellUuid] = {
    ...entry, pierced: [...entry.pierced, observerUuid]
  }
  return {
    ledger: next, pierced, known: true
  }
}

// The ledger once the sustaining switches were looked at: a spell seen sustained is marked, one marked and now
// dropped is forgotten (a new casting must be resisted anew). null when nothing changes
export function ledgerAfterSustain(ledger, isSustained){
  let changed = false
  const next = {
  }
  for (const [uuid, entry] of Object.entries(ledger ?? {
  })){
    const on = isSustained(uuid)
    if (on && !entry.wasSustained){
      next[uuid] = {
        ...entry, wasSustained: true
      }
      changed = true
    } else if (!on && entry.wasSustained) changed = true
    else next[uuid] = entry
  }
  return changed ? next : null
}

// The ledger without the spells no longer sustained (their item gone or switched off)
export function ledgerWithout(ledger, isSustained){
  const next = {
  }
  for (const [uuid, entry] of Object.entries(ledger ?? {
  })) if (isSustained(uuid)) next[uuid] = entry
  return next
}

// The illusions on a subject an observer has not seen through, among the spells still sustained
export function unpiercedIllusions(ledger, subjectUuid, observer, isSustained = () => true){
  const found = []
  for (const [uuid, entry] of Object.entries(ledger ?? {
  })){
    if (entry.subjectUuid !== subjectUuid || !isSustained(uuid)) continue
    if (entry.pierced?.includes(observer.uuid)) continue
    if (!isFooledBy(entry.spellType, observer.type)) continue
    found.push({
      spellUuid: uuid, ...entry
    })
  }
  return found
}

// The box an attack gets against an invisible subject it has not seen through. One only: two Invisibility
// spells do not make the target any more unseen. A Mask changes no dice
export function blindFireOffer(illusions, kinds, subjectName, label){
  if (!kinds.has("attack")) return null
  const invisibility = illusions.find(i => i.kind === "invisibility")
  if (!invisibility) return null
  return {
    key: "indirect_blindFire", kind: "dicePool", label: `${label} (${subjectName})`, when: "",
    value: BLIND_FIRE, isMalus: true, checked: true, hidden: false, indirect: true, blindFire: true
  }
}
