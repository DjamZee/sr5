// Magical masteries (Forbidden Arcana p. 30-41): pure helpers, no Foundry dependency.
// A mastery is a quality; its level is the quality rating, carried by the custom effect onto
// system.magic.masteries.<key>.

const isIllusion = spell => spell.category === "illusion"
const isMentalManipulation = spell => spell.category === "manipulation" && spell.subCategory === "mental"

// Illusionist levels by the spell type chosen when each level was bought (p. 37: "Physical or Mana"), from the
// active qualities whose effect aims at the mastery. A quality with no type chosen frees either type.
// items: [{type, system: {isActive, itemRating, masteryOption, customEffects}}]
export function illusionistLevelsByType(items){
  const levels = {
    physical: 0, mana: 0, any: 0
  }
  for (const item of items || []){
    if (item.type !== "itemQuality" || !item.system?.isActive) continue
    for (const effect of item.system.customEffects || []){
      if (effect?.target !== "system.magic.masteries.illusionist") continue
      const level = effect.type === "rating" ? (Number(item.system.itemRating) || 0) : (Number(effect.value) || 0)
      const option = item.system.masteryOption
      levels[option === "physical" || option === "mana" ? option : "any"] += level * (Number(effect.multiplier) || 1)
    }
  }
  return levels
}

// Returns the ids of the sustained spells freed from the sustaining penalty.
// spells: [{id, category, subCategory, type, force}], the spells sustained (already free spells left out by the caller)
// levels: {illusionist, masterManipulator, illusionistByType?: {physical, mana, any}}
// The most powerful eligible spells are freed first.
export function masteryFreeSustainedSpells(spells, magic, levels = {
}) {
  const freed = new Set()
  const sorted = [...(spells || [])].sort((a, b) => (b.force || 0) - (a.force || 0))
  const pools = []
  // Illusionist (p. 37): one Illusion of the type chosen per level; without types, any Illusion
  const byType = levels.illusionistByType
  if (byType) for (const type of ["physical", "mana", "any"]){
    pools.push([byType[type], spell => isIllusion(spell) && (type === "any" || spell.type === type)])
  }
  else pools.push([levels.illusionist, isIllusion])
  pools.push([levels.masterManipulator, isMentalManipulation])

  for (const [level, eligible] of pools) {
    let slots = Math.max(0, Math.floor(level || 0))
    for (const spell of sorted) {
      if (slots <= 0) break
      if (freed.has(spell.id)) continue
      if (!eligible(spell) || (spell.force || 0) > magic) continue
      freed.add(spell.id)
      slots--
    }
  }
  return freed
}

// Magic used to decide whether Drain is Physical or Stun.
// Archivist (p. 32): +1 per level (pair of magical academic knowledge skills at 4+), always.
// Conjuring Specialist (p. 40): +1 only for a Conjuring group test (summoning, binding, banishing).
export function magicForDrainType(magic, archivistLevel = 0, conjuringSpecialist = 0, isConjuring = false) {
  let value = magic + Math.max(0, archivistLevel || 0)
  if (conjuringSpecialist > 0 && isConjuring) value += 1
  return value
}

// Bonuses on a combat spell cast by a character with masteries.
// Mage Hunter (p. 34): Drain +1 per level ; Death Sower (p. 40): DV +1 and Drain +1 per level.
export function combatSpellMasteryBonus(category, mageHunter = 0, deathSower = 0) {
  if (category !== "combat") return {
    drainMageHunter: 0, drainDeathSower: 0, damage: 0
  }
  return {
    drainMageHunter: Math.max(0, mageHunter || 0),
    drainDeathSower: Math.max(0, deathSower || 0),
    damage: Math.max(0, deathSower || 0),
  }
}
