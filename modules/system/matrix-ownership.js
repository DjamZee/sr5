// Who owns a Matrix icon (lot 19). Plain rules with no Foundry in them, so that tests can read them.
//
// - SR5 p. 238: every device, persona, host or file has one owner, and owning an icon counts as four marks: an action
//   that asks for four marks (Change Icon, Invite Mark, Switch Interface Mode, Trackback…) is the owner's alone, since
//   nobody else can place more than three.
// - The owner the system knows: a persona owns itself and the devices it carries; a drone, an agent or a sprite is
//   owned by the one who deployed, ran or compiled it (system.creatorId); a device slaved to an actor's PAN by that
//   actor. A host, its IC and the devices slaved to it belong to the host's owner, which the system does not record.
// - KC p. 51: the security spiders count as owners of the system, and command any device of it without a mark. The
//   system knows no spider: it asks the modules (hook sr5.matrixAdministrator, the module Matrice names them).
// - A hand-made device with no master, a drone with no creator: the owner cannot be told. Nothing is refused then,
//   the gamemaster is told (Élise, lot 19: no false alarm in honest play).

export const OWNER = "owner"
export const NOT_OWNER = "notOwner"
export const UNKNOWN_OWNER = "unknown"

// The id the system gives an actor in marks and links: the token's for an unlinked token, the actor's otherwise. Never
// the base actor's id for a token: two unlinked tokens of one actor are two icons, neither owns the other
function idsOf(actor){
  return [actor?.isToken ? actor.token?.id : actor?.id].filter(Boolean)
}

const PERSONA_TYPES = ["actorPc", "actorGrunt"]
const CREATED_TYPES = ["actorDrone", "actorAgent", "actorSprite"]

export function isHostActor(actor){
  return actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "host"
}

/**
 * The owner of an icon, as far as the system knows it.
 * @param {Object} target              the targeted actor
 * @param {Object} [options]
 * @param {Function} [options.resolve] uuid -> document (fromUuidSync), for the master of a device
 * @param {Function} [options.hostOf]  ice -> its host, or null (ice-host.js, iceHostOf)
 * @return {{ids: String[]|null, creatorId: String|null, host: Object|null}}
 *   ids: the ids of the owning actor; null when the system cannot tell. host: the host whose owner it is (its spiders)
 */
export function ownerOf(target, {
  resolve = () => null, hostOf = () => null
} = {
}){
  const none = {
    ids: null, creatorId: null, host: null
  }
  if (!target) return none
  if (PERSONA_TYPES.includes(target.type)) return {
    ...none, ids: idsOf(target)
  }
  if (CREATED_TYPES.includes(target.type)) {
    const creatorId = target.system?.creatorId || null
    return {
      ...none, ids: creatorId ? [creatorId] : null, creatorId
    }
  }
  if (target.type !== "actorDevice") return none
  if (isHostActor(target)) return {
    ...none, ids: [], host: target
  }
  if (target.system?.matrix?.deviceType === "ice") {
    const host = hostOf(target)
    return host ? {
      ...none, ids: [], host
    } : none
  }
  // A device of the scenery: the master of its PAN, a host or the device of an actor
  const key = target.system?.matrix?.panMaster
  let master = null
  try {
    master = key ? resolve(key) : null
  } catch {
    master = null
  }
  // An actor (a host) or the device item of an actor
  const isActor = !!master?.items || String(master?.type ?? "").startsWith("actor")
  const holder = isActor ? master : master?.parent ?? null
  if (!holder || holder === target) return none
  if (isHostActor(holder)) return {
    ...none, ids: [], host: holder
  }
  return {
    ...none, ids: idsOf(holder)
  }
}

/**
 * Asks the modules whether the actor administers the host (a spider of it, KC p. 51): true, false, or null when no
 * module knows. A failing subscriber is logged by Foundry and counts for nothing
 */
export function administratorByHook({
  actor, target, host
}){
  const verdict = {
    actor, target, host, administrator: null
  }
  globalThis.Hooks?.callAll?.("sr5.matrixAdministrator", verdict)
  return typeof verdict.administrator === "boolean" ? verdict.administrator : null
}

/**
 * Does the actor own the targeted icon (SR5 p. 238)?
 * @param {Object} actor                  the acting actor
 * @param {Object} target                 the targeted actor
 * @param {Object} [options]
 * @param {String} [options.speakerId]    the id the roll speaks with (a token's for an unlinked actor)
 * @param {Function} [options.resolve]    uuid -> document
 * @param {Function} [options.hostOf]     ice -> its host
 * @param {Function} [options.actorById]  id -> world actor, for a creator recorded by its base actor's id
 * @param {Function} [options.isAdministrator] ({actor, target, host}) -> true, false or null (administratorByHook)
 * @return {String} OWNER, NOT_OWNER or UNKNOWN_OWNER
 */
export function matrixOwnership(actor, target, {
  speakerId = null, resolve = () => null, hostOf = () => null, actorById = () => null,
  isAdministrator = administratorByHook
} = {
}){
  if (!actor || !target) return UNKNOWN_OWNER
  const mine = [...idsOf(actor), speakerId].filter(Boolean)
  if (target === actor || idsOf(target).some(id => mine.includes(id))) return OWNER
  const owner = ownerOf(target, {
    resolve, hostOf
  })
  if (owner.host) {
    const administrator = isAdministrator({
      actor, target, host: owner.host
    })
    if (administrator === true) return OWNER
    return administrator === false ? NOT_OWNER : UNKNOWN_OWNER
  }
  if (!owner.ids) return UNKNOWN_OWNER
  if (owner.creatorId) return isCreator(owner.creatorId, actor, speakerId, actorById) ? OWNER : NOT_OWNER
  return owner.ids.some(id => mine.includes(id)) ? OWNER : NOT_OWNER
}

/**
 * Does the actor administer the icon: a spider of the host it belongs to (KC p. 51: it commands any device of the
 * system without a mark)? For the radial menu of the crown, which counts four marks for it then.
 */
export function administersIcon(actor, target, {
  resolve = () => null, hostOf = () => null, isAdministrator = administratorByHook
} = {
}){
  if (!actor || !target || target === actor) return false
  const host = ownerOf(target, {
    resolve, hostOf
  }).host
  return !!host && isAdministrator({
    actor, target, host
  }) === true
}

/** A drone created from an unlinked token records the token id as its creator: the token and its base actor are the
 * same character, so both are recognised as owner (SR5 p. 238). Deployed from the base sheet, it records the base
 * actor id: an unlinked token carries that same id but is a copy that deployed nothing, so only the base actor (its
 * sheet or a linked token) owns it */
export function isCreator(creatorId, actor, speakerId, actorById = () => null){
  if (!creatorId || !actor) return false
  if (creatorId === speakerId || (creatorId === actor.id && !actor.isToken)) return true
  const creator = actorById(creatorId)
  // A synthetic actor carries the id of its base actor: only the base sheet takes this path, never another token copy
  return !!creator && creator.id === actor.id && !actor.isToken
}
