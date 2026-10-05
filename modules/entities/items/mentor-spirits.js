// Mentor spirits (SR5 p. 76, 323-324; Forbidden Arcana p. 90-95, 176). Pure rules, no Foundry: the item
// type itemMentorSpirit carries its effects in one customEffects list, each tagged with the block it
// belongs to (mentorPath): "all", "magician", "adept", or "drawback".

export const MENTOR_PATHS = ["all", "magician", "adept", "drawback"]

// The block an Awakened character draws on (SR5 p. 324): a mystic adept picks Magician or Adept once
// and for all, kept on the item (mysticPath). null when the character gets no Magician or Adept block.
export function mentorPathFor(magicType, mysticPath){
  switch (magicType){
    case "magician":
    case "aspectedMagician": return "magician"
    case "adept": return "adept"
    case "mysticalAdept": return (mysticPath === "magician" || mysticPath === "adept") ? mysticPath : null
    default: return null
  }
}

// Whether an effect of the mentor applies (SR5 p. 324): nothing at all with a Magic of 0 (the quality
// lies dormant, drawback included); "all" and the drawback always, otherwise the actor's own block.
// An effect without a tag counts as "all", as a quality's effects would.
export function mentorEffectApplies(effectPath, actorPath, magic){
  if (!(magic > 0)) return false
  if (!effectPath || effectPath === "all" || effectPath === "drawback") return true
  return effectPath === actorPath
}

// SR5 p. 284 (spells), 299 (rituals), 303 (summoning), 304 (binding, banishing): a Drain Value is never
// below 2. The tests whose Drain has that floor; the others (disenchanting...) keep their own value.
export function drainFloor(test){
  if (!test) return 0
  if (["spell", "preparationFormula", "summoningResistance", "ritualResistance"].includes(test.type)) return 2
  if (["binding", "banishing"].includes(test.typeSub)) return 2
  return 0
}

// Mask of the mentor (Forbidden Arcana p. 176): a magician's Drain is reduced by 1, applied before the
// floor of that Drain. A Drain already under its floor is left as it is.
export function maskedDrain(value, floor){
  if (!(value > floor)) return value
  return Math.max(floor, value - 1)
}

// A character follows a single mentor (SR5 p. 76): the mentors beyond the first, to warn about
export function extraMentors(items){
  return (items || []).filter(i => i.type === "itemMentorSpirit").slice(1)
}

// Whether this mentor is the one the character follows: the first of its items (SR5 p. 76)
export function isFollowedMentor(item, items){
  const first = (items || []).find(i => i.type === "itemMentorSpirit")
  return !!first && first.id === item.id
}

// The Magic a mentor reads. Items are applied while preparing the base data, before the augmented
// Magic is computed (it is still 0 then): the natural rating the player entered stands in for it.
export function mentorMagic(specialMagic){
  const augmented = specialMagic?.augmented?.value
  if (augmented > 0) return augmented
  return Number(specialMagic?.natural?.base) || 0
}

// Power Points an adept draws from the mentor: the free points of the Adept block, plus 1 with the
// Mask of the mentor (Forbidden Arcana p. 176) when that optional rule is on. Nothing while dormant.
export function mentorPowerPoints(actorPath, system, maskRule, magic){
  if (actorPath !== "adept" || !(magic > 0)) return 0
  return (Number(system?.freePowerPoints) || 0) + ((maskRule && system?.mask) ? 1 : 0)
}

// Whether a magician wears the Mask of the mentor (Forbidden Arcana p. 176): reduced Drain
export function mentorMaskOn(actorPath, system, maskRule, magic){
  return !!(maskRule && system?.mask && actorPath === "magician" && magic > 0)
}
