// What a social maneuver carries to a later test (Cutting Aces p. 153-154): a dice or limit modifier kept
// on the actor who will roll it, offered in her next roll dialog and spent once used.
// The gamemaster writes them (the "Appliquer" button of the card); the actor's owner spends them by rolling.

export const PENDING_FLAG = "socialPending"

/**
 * The pending effects a test can use, and whether each is ticked from the start.
 * @param {Array} list - the actor's pending effects
 * @param {{test:string, isResist:boolean, otherId:string|null}} roll - the test (skill key or "knowledge"),
 *   whether it resists an opposed test, and the other party (the roll's target, or the opposed test's author)
 * @returns {Array<{entry:object, checked:boolean}>}
 */
export function pendingFor(list, roll){
  return (list ?? [])
    .filter(e => e?.tests?.includes(roll?.test))
    .filter(e => !e.resistOnly || roll?.isResist)
    .map(e => ({
      entry: e,
      // Against one party only: ticked when the roll is against her, offered unticked otherwise
      checked: !e.versus || e.versus === roll?.otherId,
    }))
}

/**
 * The list once the used effects are spent: the persistent ones stay (the encounter, p. 153 Informed Opinion).
 */
export function afterUse(list, usedIds){
  const used = new Set(usedIds ?? [])
  return (list ?? []).filter(e => !used.has(e.id) || e.persistent)
}

/* -------------------------------------------- */
// Foundry side

export function pendingOf(actor){
  return actor?.getFlag?.("sr5", PENDING_FLAG) ?? []
}

/**
 * Adds an effect to its holder, by the gamemaster.
 * @returns {Promise<object|null>} the stored entry
 */
export async function addPending(actor, effect, label){
  if (!actor || !effect) return null
  const entry = {
    ...effect, id: foundry.utils.randomID(), label, time: game.time?.worldTime ?? 0
  }
  await actor.setFlag("sr5", PENDING_FLAG, [...pendingOf(actor), entry])
  return entry
}

/**
 * Spends the effects used by a roll. Removes an effect the dialog dropped too (removedIds).
 */
export async function spendPending(actor, usedIds, removedIds = []){
  if (!actor?.isOwner || (!usedIds?.length && !removedIds?.length)) return
  const kept = afterUse(pendingOf(actor), usedIds).filter(e => !removedIds.includes(e.id))
  await actor.setFlag("sr5", PENDING_FLAG, kept)
}
