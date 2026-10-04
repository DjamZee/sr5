/**
 * Picking a pocket (SR5 p. 135, p. 422).
 *
 * The core book has no rule of its own for it: SR5 p. 135 gives Palming the
 * lifting of small objects (specialization Pickpocket) and p. 422 the opposed
 * test of a concealed object, Palming + Agility [Physical] against
 * Perception + Intuition [Mental], the object's concealability added to the
 * observer's pool. The observer notices on a tie.
 *
 * What the book leaves open was ruled by DjamZ (2026-10-05): small objects
 * only, the GM can pass over; a glitch takes the object but the target feels
 * something without knowing who; a critical glitch is caught red-handed; a
 * Complex Action in combat.
 *
 * Kept free of Foundry globals so the rules can be read, and tested, alone.
 * The "plant" mode (putting an object on someone) is the same test the other
 * way round: only `transferEnds` knows the direction, so a second batch plugs
 * in there.
 */
import {
  isStorable
} from "../../interface/storage-rules.js"

export const PICKPOCKET_MODES = ["take", "plant"]

//SR5 p. 422: a small object goes up to +2 (a medkit, a submachine gun); a bigger one is no pocket's
export const PICKPOCKET_MAX_CONCEALMENT = 2

//SR5 p. 139: distracted -2, looking for it +3, something draws the attention away -2
export const PERCEPTION_SITUATIONS = {
  distracted: -2,
  attentive: 3,
  diversion: -2,
}

//The concealability of an object, as the observer's pool takes it (SR5 p. 422). Only weapons get
//their value worked out; on other gear it stays 0 next to the base typed on the sheet
export function concealmentOf(item) {
  const concealment = item?.system?.concealment
  return Number(concealment?.value) || Number(concealment?.base) || 0
}

/**
 * Whether an object sits in a locked storage of its owner: a lock counts when
 * it has a type ("mechanical", "maglock") and is locked. Out of reach of a
 * pocket; in a bag left open, it stays the GM's call. A storage without the
 * lock fields (before the containers' lock) is open.
 */
export function isLockedAway(item) {
  const storageId = item?.system?.storedIn
  if (!storageId) return false
  const items = item.parent?.items
  const storage = items?.get?.(storageId) ?? items?.find?.(i => (i.id ?? i._id) === storageId)
  const lock = storage?.type === "itemStorage" ? storage.system?.lock : null
  return !!lock?.type && lock.locked === true
}

/**
 * Whether an object can be lifted from a pocket. What can be put in a bag can
 * be lifted, a vehicle aside; what is worn or held (an armor on, a weapon
 * ready) is not in a pocket. Bigger than +2 is no small object: the GM can
 * pass over with `allowLarge`.
 */
export function isPickable(item, {
  allowLarge = false
} = {
}) {
  if (!isStorable(item)) return false
  if (item.type === "itemVehicle") return false
  if (isLockedAway(item)) return false
  if ((item.type === "itemArmor" || item.type === "itemWeapon") && item.system?.isActive) return false
  if (!allowLarge && concealmentOf(item) > PICKPOCKET_MAX_CONCEALMENT) return false
  return true
}

export function pickableItems(actor, options) {
  return Array.from(actor?.items ?? []).filter(i => isPickable(i, options))
}

//An object drawn by lot, `random` being a number in [0, 1[
export function randomPick(items, random) {
  if (!items?.length) return null
  return items[Math.min(items.length - 1, Math.floor(random * items.length))]
}

//The modifiers of the observer's pool: the object's concealability and the situations the GM ticked
export function perceptionModifiers(concealment, situations = []) {
  const list = []
  if (concealment) list.push({
    type: "concealment", value: concealment
  })
  for (const key of situations) if (key in PERCEPTION_SITUATIONS) list.push({
    type: key, value: PERCEPTION_SITUATIONS[key]
  })
  return list
}

/**
 * How the pocket ends.
 * - "caught": critical glitch of the thief, caught red-handed, the target knows who
 * - "noticed": the observer ties or wins (SR5 p. 422), the target knows who
 * - "felt": taken, but a glitch made the target feel something, not knowing who
 * - "taken": taken unseen
 */
export function pickpocketOutcome({
  thiefHits = 0, perceptionHits = 0, glitch = false, criticalGlitch = false
}) {
  if (criticalGlitch) return "caught"
  if (thiefHits - perceptionHits <= 0) return "noticed"
  return glitch ? "felt" : "taken"
}

//Who gives and who receives: the thief takes, or plants (second batch)
export function transferEnds(mode, thief, target) {
  return mode === "plant" ? {
    from: thief, to: target
  } : {
    from: target, to: thief
  }
}

/**
 * Whether the GM may move the object, read again on his side from the cards
 * themselves: the perception card answers this thief card, about this thief
 * and this target; the thief card was written by a user who owns the thief;
 * the object still is on the giver and can be lifted; the two are still
 * within reach; and nothing moved yet from either card.
 */
export function isTransferAllowed({
  thiefCard, thiefMessageId, perceptionCard, authorOwnsThief, item, itemOnGiver, inReach, allowLarge = false
}) {
  if (!thiefCard || !perceptionCard || !thiefMessageId) return false
  if (thiefCard.test?.type !== "pickpocket" || perceptionCard.test?.type !== "pickpocketPerception") return false
  if (perceptionCard.previousMessage?.messageId !== thiefMessageId) return false
  if (!thiefCard.owner?.actorId || perceptionCard.previousMessage?.actorId !== thiefCard.owner.actorId) return false
  if (!thiefCard.target?.actorId || perceptionCard.owner?.actorId !== thiefCard.target.actorId) return false
  if (perceptionCard.various?.pickpocketDone || thiefCard.various?.pickpocketDone) return false
  //One thief card, one Perception: the one the thief card was answered by, never a second one
  if (!perceptionCard.various?.pickpocketAnswerId || thiefCard.various?.pickpocketAnswerId !== perceptionCard.various.pickpocketAnswerId) return false
  if (!authorOwnsThief || !inReach || !itemOnGiver) return false
  if (!isPickable(item, {
    allowLarge
  })) return false
  //The thief's hits as the GM's card froze them on the first click: a later touch-up of the thief card does not count
  const outcome = pickpocketOutcome({
    thiefHits: perceptionCard.previousMessage?.hits,
    perceptionHits: perceptionCard.roll?.hits,
    glitch: perceptionCard.various?.pickpocketThiefGlitch,
    criticalGlitch: perceptionCard.various?.pickpocketThiefCriticalGlitch,
  })
  return outcome === "taken" || outcome === "felt"
}
