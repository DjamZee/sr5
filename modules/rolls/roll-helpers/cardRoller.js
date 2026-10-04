// Tests whose card buttons are handled by the targeted spirit or sprite (resistance, reduce services or tasks)
const TARGET_HANDLED_TESTS = ["banishing", "binding", "decompileSprite", "registerSprite"]

// Resistances that stay with the card owner even on those cards:
// the drain goes to the magician (SR5 p. 304), the fading to the technomancer (SR5 p. 254)
const OWNER_RESISTANCES = ["drain", "fading"]

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

// True when the patient has a single condition monitor: no damage type to ask for
export function hasSingleMonitor(patient) {
  let monitors = patientMonitors(patient)
  return monitors.length === 1 && monitors[0] === "condition"
}
