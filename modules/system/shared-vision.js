//Shared vision: seeing through a drone, a camera or any device (SR5 p. 241, 243, 266-272).
//A token carries the list of the users who see through it, in flags.sr5.sharedVision :
//  { userId, source: "share" | "snoop", markOwnerId }
//"share" comes from the owner inviting a user (Invite Mark, SR5 p. 241), "snoop" from a Snoop that
//succeeded (SR5 p. 241), which lasts as long as the snooper keeps a mark on the device.
//This file holds the rules only: no canvas, no document update, so the tests can read it.

export const SHARED_VISION_FLAG = "sharedVision"

//Actors one can see through: a drone, or a device such as a camera (SR5 p. 446)
export const SHARED_VISION_ACTOR_TYPES = ["actorDrone", "actorDevice"]

/** The users who see through a token
 * @param {Object} tokenDocument - token document, or its source
 * @return {Array} entries { userId, source, markOwnerId }
 */
export function getSharedViewers(tokenDocument) {
  const list = tokenDocument?.flags?.sr5?.[SHARED_VISION_FLAG]
  return Array.isArray(list) ? list.filter(e => e?.userId) : []
}

/** Tell whether a user sees through a token
 * @param {Object} tokenDocument - token document
 * @param {String} userId - the user
 * @return {Boolean}
 */
export function isSharedWith(tokenDocument, userId) {
  return getSharedViewers(tokenDocument).some(e => e.userId === userId)
}

/** Add a user to the list, or replace the entry he already has
 * @param {Array} list - current entries
 * @param {Object} entry - { userId, source, markOwnerId }
 * @return {Array} a new list
 */
export function withViewer(list, entry) {
  return [...(list ?? []).filter(e => e.userId !== entry.userId), {
    userId: entry.userId, source: entry.source ?? "share", markOwnerId: entry.markOwnerId ?? ""
  }]
}

/** Take a user out of the list
 * @param {Array} list - current entries
 * @param {String} userId - the user
 * @return {Array} a new list
 */
export function withoutViewer(list, userId) {
  return (list ?? []).filter(e => e.userId !== userId)
}

/** Tell whether an actor carries a mark put by another icon: on its active device (SR5 p. 236),
 * or on its own persona when no device holds it
 * @param {Object} actor - the marked actor
 * @param {String} ownerId - id of the actor who put the mark
 * @return {Boolean}
 */
export function hasMarkFrom(actor, ownerId) {
  if (!actor || !ownerId) return false
  const isFrom = m => m?.ownerId === ownerId && (m.value ?? 0) > 0
  const items = Array.from(actor.items ?? [])
  if (items.some(i => i.type === "itemDevice" && i.system?.isActive && (i.system.marks ?? []).some(isFrom))) return true
  return (actor.system?.matrix?.marks ?? []).some(isFrom)
}

/** Tell whether a device can still send what it sees: it is not destroyed, not bricked (SR5 p. 229)
 * and its wireless is on (SR5 p. 424)
 * @param {Object} actor - the drone or device
 * @return {Boolean}
 */
export function canStreamVision(actor) {
  if (!actor) return false
  if (actor.statuses?.has?.("dead")) return false
  const system = actor.system ?? {
  }
  if (system.wirelessTurnedOn === false) return false
  for (const key of ["condition", "matrix"]) {
    const monitor = system.conditionMonitors?.[key]
    if (monitor?.value > 0 && monitor.actual?.value >= monitor.value) return false
  }
  return true
}

/** Tell whether an entry of the list is still valid
 * @param {Object} entry - { userId, source, markOwnerId }
 * @param {Object} actor - the actor of the token seen through
 * @return {Boolean}
 */
export function isViewerStillValid(entry, actor) {
  if (!canStreamVision(actor)) return false
  //Snoop works as long as the snooper keeps at least one mark on the target (SR5 p. 241)
  if (entry.source === "snoop") return hasMarkFrom(actor, entry.markOwnerId)
  return true
}

/** Tell whether a drone has a rigger jumped into it (SR5 p. 243): rigging control, with a controller
 * @param {Object} actor - the actor to look at
 * @return {Boolean}
 */
export function isJumpedInDrone(actor) {
  return actor?.type === "actorDrone" && actor.system?.controlMode === "rigging" && !!actor.system?.vehicleOwner?.id
}

/** The ids of the riggers jumped into one of these drones
 * @param {Array} drones - actors to look into
 * @return {Set} ids of the controllers
 */
export function jumpedInRiggerIds(drones) {
  return new Set((drones ?? []).filter(isJumpedInDrone).map(d => d.system.vehicleOwner.id))
}

/** Decide whether a token is a vision source for the user, before the core of Foundry decides
 * @param {Object} state
 * @param {Boolean} state.isGM - the user is a gamemaster
 * @param {Boolean} state.sharedWithMe - the token is in the user's shared vision list
 * @param {Boolean} state.isMyJumpedInDrone - the token is a drone the user owns, with a rigger jumped into it
 * @param {Boolean} state.isBlindBody - the token is the body of a rigger jumped into a drone
 * @return {Boolean|null} true or false, or null to leave it to the core
 */
export function decideVisionSource({
  isGM, sharedWithMe, isMyJumpedInDrone = false, isBlindBody = false
}) {
  //The gamemaster sees everything already: the core decides for him
  if (isGM) return null
  //Jumped in, the rigger is in VR: his body is inert and its physical senses are blocked (SR5 p. 231, 266)
  if (isBlindBody) return false
  //The sensors of the drone become his eyes (SR5 p. 266)
  if (sharedWithMe || isMyJumpedInDrone) return true
  return null
}
