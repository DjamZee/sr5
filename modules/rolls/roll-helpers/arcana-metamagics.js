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

// How long a magician may stay projected (SR5 p. 317: Magic x 2 hours). Improved Astral Form (p. 43) adds the
// initiate grade, and the body takes a minute to wake; Astralnaut (p. 43) counts in days instead of hours, and the body
// takes twenty-four hours to wake. Read as (Magic x 2 + grade) days for an Astralnaut, who knows Improved Astral Form.
export function astralProjectionLimit(magic, grade, improved, astralnaut){
  const base = (Number(magic) || 0) * 2
  const bonus = (improved || astralnaut) ? (Number(grade) || 0) : 0
  if (astralnaut) return {
    value: base + bonus, unit: "days", wake: "day"
  }
  return {
    value: base + bonus, unit: "hours", wake: improved ? "minute" : ""
  }
}

// Rapid Necro-Summoning (p. 44): Drain = twice the spirit's hits (not its net hits), as for any summoning (SR5 p. 300),
// "with a minimum Drain value of 4" instead of 2. Only for necromantic spirits: read as summoned by a necromantic magician
export const RAPID_NECRO_DRAIN_FLOOR = 4

export function isRapidNecroSummoning(summonerMagic){
  return !!summonerMagic?.metamagics?.rapidNecroInvocation && summonerMagic?.tradition === "necroMagic"
}
