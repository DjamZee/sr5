/**
 * Repairing the Negotiation lost before the key fix (Hugo's review, Élise's brief).
 *
 * An actor or a contact imported while the skill was still stored under the
 * former key `negociation` lost it for good: the data model dropped the key at
 * creation and wrote Negotiation 0. migrateData cannot bring it back, and a 0
 * typed on purpose looks the same as a lost one. So nothing is repaired by
 * itself: the gamemaster is shown the candidates, whose compendium source still
 * gives a Negotiation above 0, and ticks what applies.
 *
 * Pure: the tests read it as it is.
 */

/** The rating written on a skill, 0 when there is none. */
const ratingOf = skill => Number(skill?.rating?.base) || 0

/** Specializations are a string in the schema; an older source may hold a list. */
const hasSpecialization = skill => {
  const spec = skill?.specializations
  return Array.isArray(spec) ? spec.length > 0 : !!String(spec ?? "").trim()
}

/**
 * Does this document look like it lost its Negotiation? Nothing typed on the skill: rating 0 and no
 * specialization. A Negotiation coming from the Influence group alone stays at 0 on the skill too:
 * its source gives 0 as well, so it never becomes a candidate.
 * @param {object} system  The system data of an actor or a contact.
 */
export function negotiationLooksLost(system) {
  const skill = system?.skills?.negotiation
  if (!skill) return false
  return ratingOf(skill) === 0 && !hasSpecialization(skill)
}

/**
 * The Negotiation a source gives back, or 0 when it gives none.
 * @param {object} system  The system data of the compendium source.
 */
export function sourceNegotiation(system) {
  return ratingOf(system?.skills?.negotiation)
}

/**
 * Where a document came from: the core's compendiumSource, else the older flags.core.sourceId.
 * Only a compendium is a source here: a copy of a world document proves nothing.
 * @param {object} doc
 */
export function compendiumSourceOf(doc) {
  const uuid = doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? ""
  return typeof uuid === "string" && uuid.startsWith("Compendium.") ? uuid : ""
}
