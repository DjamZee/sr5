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

/**
 * Make actor.statuses read the effects at the moment it is asked, instead of when the actor is prepared.
 * Filling it in prepareData was not enough : the synthetic actor of an unlinked token is prepared before
 * the effects of its delta are attached, and after a reload its statuses stayed empty although the effect
 * was there (an invisible grunt seen by all, a dead one no longer defeated).
 * @param {Actor} actor
 */
export function installLiveStatuses(actor) {
  const statuses = new Set()
  Object.defineProperty(actor, "statuses", {
    configurable: true,
    get: () => fillStatuses(statuses, actor.allApplicableEffects?.()),
    //The core only ever fills the set it is given, it never replaces it
    set: () => {
    }
  })
}
