// Metamagics of Forbidden Arcana p. 43-45. Pure rules, no Foundry.

// Harmonious Defense (p. 45): a pool of Willpower + Magic + initiate grade, used as spell defense dice
export function harmoniousDefensePool(willpower, magic, grade){
  return (Number(willpower) || 0) + (Number(magic) || 0) + (Number(grade) || 0)
}

// Structured Spellcasting (p. 43): Drain reduced by 1, "but always with a minimum of 1". The supplement
// overrides the floor of 2 of SR5 p. 284 for that magician's spells.
export const STRUCTURED_DRAIN_FLOOR = 1

// Whether a roll is a spell cast with Structured Spellcasting: no reckless casting, and neither reagents
// nor Edge lift the limit (p. 43)
export function isStructuredSpell(data){
  return data?.test?.type === "spell" && !!data?.magic?.structured
}

// Hits after pushing the limit (SR5 p. 58): the limit no longer counts, unless the spell is structured,
// in which case the Edge dice still count but the limit holds
export function pushedHits(originalHits, edgeHits, limit, structured){
  const total = (originalHits || 0) + (edgeHits || 0)
  return (structured && limit > 0) ? Math.min(limit, total) : total
}
