/**
 * Fill the statuses of an actor from its active effects, as the core does in applyActiveEffects.
 * The system prepares its actors by itself and never calls applyActiveEffects : actor.statuses stayed
 * empty, so hasStatusEffect always answered no, and a token put "invisible" was still seen by ordinary
 * sight, ultrasound having then nothing left to reveal (SR5 p. 449).
 * @param {Set<string>} statuses  The set to fill, cleared first
 * @param {Iterable} effects      The effects that apply to the actor
 * @returns {Set<string>}
 */
export function fillStatuses(statuses, effects) {
  statuses.clear()
  for (const effect of effects ?? []) {
    if (!effect.active) continue
    for (const id of effect.statuses ?? []) statuses.add(id)
  }
  return statuses
}
