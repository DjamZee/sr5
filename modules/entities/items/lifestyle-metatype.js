/**
 * What a lifestyle costs more for its owner's metatype: dwarves +20 %, trolls +100 % (SR5 p. 68). The metavariants
 * have theirs too (errata of Run Faster p. 2), but the system knows only the five metatypes.
 *
 * Hard Targets p. 141 (Ordre pour le calcul du coût du style de vie) applies the metatype's adjustment after the
 * base, the assets and the lifestyle options, and before the Outings and Services are added: those are left out.
 */
export const LIFESTYLE_METATYPE_FACTOR = {
  dwarf: 1.2,
  troll: 2,
}

const NOT_ADJUSTED = ['service', 'outing']

export function lifestyleMetatypeFactor(metatype) {
  return LIFESTYLE_METATYPE_FACTOR[metatype] ?? 1
}

/** The nuyen the metatype adds to one month, rounded to the nuyen. */
export function lifestyleMetatypeSurcharge(base, options, metatype) {
  const factor = lifestyleMetatypeFactor(metatype)
  if (factor === 1) return 0
  const adjusted = (options ?? []).filter(option => !NOT_ADJUSTED.includes(option.type))
    .reduce((sum, option) => sum + (Number(option.price) || 0), Number(base) || 0)
  return Math.round(Math.max(0, adjusted) * (factor - 1))
}
