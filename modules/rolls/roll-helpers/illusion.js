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
