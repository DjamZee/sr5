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
