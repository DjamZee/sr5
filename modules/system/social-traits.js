// The social traits of Cutting Aces p. 149-152 that need the system (lot 37a). The traits themselves are data
// (Mégapack); a trait carries one of these keys as a system effect, category « Cas particulier ».
//   socialIgnoreNegative — « Il a la classe et il le sait » (p. 150): ignore 2 points of negative modifiers on any
//                          Social test
//   etiquetteIntuition   — « Oreille compatissante » (p. 150): Intuition in place of Charisma for Etiquette tests
//   influenceLogic       — « Maître débatteur » (p. 150): Logic in place of Charisma for Intimidation, Leadership
//                          and Negotiation tests
// « Vous pouvez utiliser… »: the swapped attribute is offered first in the roll dialog only when it is higher; the
// menu of SR5 p. 130 stays open, and an attribute kept by the player wins.

export const SOCIAL_TRAIT_KEYS = ["socialIgnoreNegative", "etiquetteIntuition", "influenceLogic"]

// Cutting Aces p. 150, « ignorer 2 points de modificateurs négatifs »
export const IGNORED_NEGATIVE_POINTS = 2

const SWAPS = {
  etiquetteIntuition: {
    skills: ["etiquette"], attribute: "intuition"
  },
  influenceLogic: {
    skills: ["intimidation", "leadership", "negotiation"], attribute: "logic"
  },
}

/** The trait keys an actor's active items carry. */
export function socialTraitsOf(items) {
  const keys = new Set()
  for (const item of items ?? []) {
    const system = item?.system
    if (!system || system.isActive === false) continue
    for (const effect of Object.values(system.systemEffects ?? {
    })) {
      if (effect?.category === "specialCase" && SOCIAL_TRAIT_KEYS.includes(effect.value)) keys.add(effect.value)
    }
  }
  return keys
}

/**
 * The attribute a trait offers for this skill in place of Charisma, when it is higher; else null.
 * @param {string} skillKey
 * @param {Set<string>} traits
 * @param {(key:string) => number} valueOf the actor's augmented attribute
 */
export function traitAttribute(skillKey, traits, valueOf) {
  let best = null
  for (const [key, swap] of Object.entries(SWAPS)) {
    if (!traits?.has(key) || !swap.skills.includes(skillKey)) continue
    const value = valueOf(swap.attribute)
    if (value > valueOf("charisma") && (!best || value > valueOf(best))) best = swap.attribute
  }
  return best
}

// The social modifiers of SR5 p. 142 in the roll dialog are the dice modifiers whose type starts with "social".
// A maneuver's own -4 is the price of the maneuver, not a modifier of the situation (Cutting Aces p. 153)
const NOT_SITUATION = ["socialManeuver", "socialIgnoreNegative"]
// « sur tout test social »: the effects other actors put on this social test count too (a target's Cynical, the
// subliminal subacoustics of an area, roll-helpers/indirect.js), arbitrage of the coordinator (lot 42)
const isSocialSituation = type => (type.startsWith("social") && !NOT_SITUATION.includes(type)) || type.startsWith("indirect_")

/** How many dice the trait gives back: the negative social modifiers, 2 points at most. */
export function ignoredNegative(modifiers, points = IGNORED_NEGATIVE_POINTS) {
  let negative = 0
  for (const m of Object.values(modifiers ?? {
  })) {
    if (typeof m?.type !== "string" || !isSocialSituation(m.type)) continue
    const v = Number(m.value) || 0
    if (v < 0) negative -= v
  }
  return Math.min(Math.max(0, points), negative)
}
