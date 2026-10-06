/**
 * Effects on the Negotiation skill.
 *
 * The skill was renamed from `negociation` to `negotiation`, and the world
 * migration renames it on actors. The custom effects of items kept aiming at
 * `system.skills.negociation.*`, which no longer exists: their bonuses and
 * penalties to Negotiation were silently lost (132 items of the compendiums
 * and the Megapack, among them Pheromones, Celebrities, Addictions).
 *
 * Called from `Item.migrateData`, so it covers every item wherever it is: the
 * world, the items an actor carries, unlinked tokens and compendium entries.
 * @param {object} source  The raw system data of an item.
 * @return {object}        The same source object.
 */
const LEGACY = "system.skills.negociation"
const CURRENT = "system.skills.negotiation"

export function migrateNegotiationTargets(source) {
  const effects = source?.customEffects
  if (!effects || typeof effects !== "object") return source
  for (const effect of Object.values(effects)) {
    const target = effect?.target
    if (typeof target === "string" && (target === LEGACY || target.startsWith(`${LEGACY}.`)))
      effect.target = CURRENT + target.slice(LEGACY.length)
  }
  return source
}

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value)

/** The former key under the current one: every field written under the current key wins. */
function underCurrent(legacy, current) {
  const merged = {
    ...legacy
  }
  for (const [key, value] of Object.entries(current)) merged[key] = isObject(value) && isObject(legacy[key]) ? underCurrent(legacy[key], value) : value
  return merged
}

/**
 * The Negotiation skill itself, under the former key.
 *
 * The world migration renames it on the actors present when it runs, never
 * again: an actor imported from a pack afterwards, and every contact (an
 * itemContact carries skills too), kept `system.skills.negociation`. The data
 * model does not know that key and drops it, so the skill read 0: the 104
 * contacts of the compendiums and the Megapack lost it, and a contact searching
 * for a vendor fell back to Charisma - 1 (shop-availability.js).
 *
 * Called from `Item.migrateData` and `Actor.migrateData`, on every load: the
 * world, compendium entries, a creation from a pack. This runs on the raw
 * source, before the schema fills its defaults: a field under the current key
 * was written by someone (a Negotiation brought back to 0 in a pack still
 * under the former key) and wins over the former one, which only fills what
 * the current key lacks.
 * @param {object} system  The raw system data of an actor or an item.
 * @return {object}        The same object.
 */
export function migrateNegotiationSkill(system) {
  const skills = system?.skills
  if (!skills || typeof skills !== "object" || !("negociation" in skills)) return system
  const legacy = skills.negociation
  if (isObject(legacy)) skills.negotiation = isObject(skills.negotiation) ? underCurrent(legacy, skills.negotiation) : legacy
  delete skills.negociation
  return system
}
