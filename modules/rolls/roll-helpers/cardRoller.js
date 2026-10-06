// Tests whose card buttons are handled by the targeted spirit or sprite (resistance, reduce services or tasks)
const TARGET_HANDLED_TESTS = ["banishing", "binding", "decompileSprite", "registerSprite"]

// Resistances that stay with the card owner even on those cards:
// the drain goes to the magician (SR5 p. 304), the fading to the technomancer (SR5 p. 254)
const OWNER_RESISTANCES = ["drain", "fading"]

// The Foundry "-=" keys that remove from a card's flags the buttons its refreshed version no longer has
// (an update merges, a key left out would stay)
export function removedButtonKeys(oldButtons, newButtons){
  const removed = {
  }
  for (const key of Object.keys(oldButtons ?? {
  })) if (!key.startsWith("-=") && !(key in (newButtons ?? {
  }))) removed[`-=${key}`] = null
  return removed
}

// True when a non-opposed button of the card must be rolled by the target instead of the card owner
export function isRolledByTarget(type, typeSub, targetActorId) {
  if (!targetActorId) return false
  if (OWNER_RESISTANCES.includes(type)) return false
  return TARGET_HANDLED_TESTS.includes(typeSub)
}

// The actor answering an opposed test card: the selected token, or else the user's assigned character.
// ChatMessage.getSpeaker leaves the token empty when the character has no token on the viewed scene.
export function opposedTestActorId(speaker) {
  return speaker.token || speaker.actor
}

// The actor defending against an attack card: the selected one, unless it is the attacker itself,
// who cannot defend against their own attack; then the card's target defends (N93)
export function defenseActorId(selectedId, card, resolveActor) {
  const targetId = card?.target?.actorId
  if (!selectedId || !targetId) return selectedId
  const selected = resolveActor(selectedId), attacker = resolveActor(card.owner?.speakerId)
  if (selected && attacker && selected.uuid === attacker.uuid && resolveActor(targetId)?.isOwner) return targetId
  return selectedId
}

// The actor defending against a matrix attack card: its target first, then the selected one; never
// its author, still selected after the attack, whose deck the choice offered (Anatole's matrix trial).
// Null when nobody may defend: the button refuses
export function matrixDefenseActorId(selectedId, card, resolveActor) {
  const attacker = card?.owner?.speakerId ? resolveActor(card.owner.speakerId) : null
  const isAttacker = actor => !!attacker && actor?.uuid === attacker.uuid
  const targetId = card?.target?.actorId
  const target = targetId ? resolveActor(targetId) : null
  if (target?.isOwner && !isAttacker(target)) return targetId
  const selected = selectedId ? resolveActor(selectedId) : null
  if (selected && !isAttacker(selected)) return selectedId
  return null
}

// The id that finds the actor who spoke a card: its token first, since an unlinked token's actor
// only exists through its token and is unknown to game.actors (N95)
export function cardSpeakerId(speaker) {
  return speaker?.token || speaker?.actor
}

// True when the user owns the actor who spoke a card, an unlinked token included (N95).
// A card without speaker keeps its buttons, as before.
export function ownsCardSpeaker(speaker, resolveActor) {
  const id = cardSpeakerId(speaker)
  if (!id) return true
  return resolveActor(id)?.isOwner === true
}

// True when a spell's effects remove damage from the one they are applied to (Heal, SR5 p. 291)
export function healsDamage(customEffects) {
  return Object.values(customEffects ?? {
  }).some(e => e?.transfer && typeof e.target === "string" && e.target.endsWith(".removeDamage"))
}

// The patient of a healing spell (SR5 p. 291): the token the user targets, and only without a target the selected
// token or his character. Several targets: none, the spell heals one patient
export function healPatient(targets, selectedActor) {
  const list = [...(targets ?? [])]
  if (list.length === 1) return list[0].actor ?? null
  return list.length ? null : selectedActor
}

// The first aid patient (SR5 p. 207): the targeted token when the test had a target, the selected token otherwise.
// Never the card owner: with a target, a missing patient stays missing instead of falling back to the healer.
export function firstAidPatient(hasTarget, targetActor, selectedActor) {
  return hasTarget ? targetActor : selectedActor
}

// The damage monitors of a patient, as prepared on its sheet: Physical and Stun (PC, most spirits),
// or a single condition monitor (grunt, AI core, homunculus and watcher, SR5 p. 301). Empty when it has neither.
// SR5 p. 148: first aid is emergency medical care (no surgery, no implant repair); drones and vehicles are repaired with
// the vehicle mechanic skills (p. 147): their condition monitor is structure, no patient, nor is a device with only a Matrix monitor
export function patientMonitors(patient) {
  if (patient?.type === "actorDrone") return []
  let monitors = patient?.system?.conditionMonitors ?? {
  }
  if (monitors.physical && monitors.stun) return ["physical", "stun"]
  if (monitors.condition) return ["condition"]
  return []
}

// True when the patient wears a full armor (SR5 p. 207): an active armor flagged as such
export function wearsFullArmor(patient) {
  return !!patient?.items?.some(i => i.type === "itemArmor" && i.system?.isActive && i.system?.isFullArmor)
}

// The boxes healed by first aid (SR5 p. 207): the hits over the threshold, halved (rounded up) through a full armor,
// then capped by the First Aid skill rating
export function firstAidHealedBoxes(hits, threshold, skillRating, fullArmor) {
  let boxes = Math.max(hits - threshold, 0)
  if (fullArmor) boxes = Math.ceil(boxes / 2)
  return Math.min(boxes, skillRating)
}

// The boxes a first aid card heals on click (SR5 p. 207). With a target, the halving was done on the roll.
// Without one, the patient is only known now: the hits are recomputed, halved through a full armor, then capped.
// A card rolled before the cap was stored keeps its value.
export function firstAidBoxesOnClick(messageData, patient) {
  let boxes = messageData.roll.netHits
  if (messageData.target.hasTarget || messageData.roll.firstAidCap === undefined || !wearsFullArmor(patient)) return {
    boxes, halvedOnClick: false
  }
  return {
    boxes: firstAidHealedBoxes(messageData.roll.hits, 2, messageData.roll.firstAidCap, true), halvedOnClick: true
  }
}

// True when the patient has a single condition monitor: no damage type to ask for
export function hasSingleMonitor(patient) {
  let monitors = patientMonitors(patient)
  return monitors.length === 1 && monitors[0] === "condition"
}
