// Magical masteries (Forbidden Arcana p. 30-41): pure helpers, no Foundry dependency.
// A mastery is a quality; its level is the quality rating, carried by the custom effect onto
// system.magic.masteries.<key>.

// Master Manipulator (p. 38): "cannot benefit from this mastery if he sustains spells whose Force exceeds his
// Magic". Read as written, arbitrage de DjamZ (2026-10-05): one sustained spell above Magic, whatever its kind,
// and no mental Manipulation spell is freed. One switch, to turn back to a per-spell reading.
export const MANIPULATOR_LOST_ABOVE_MAGIC = true

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
  const manipulatorLost = MANIPULATOR_LOST_ABOVE_MAGIC && sorted.some(spell => (spell.force || 0) > magic)
  if (!manipulatorLost) pools.push([levels.masterManipulator, isMentalManipulation])

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

// Death Sower, adept side (p. 40): "+1 DV to any attack made with a skill Critical Strike can be applied to", i.e.
// every melee skill (SR5 p. 310: Blades, Clubs, Unarmed Combat, Astral Combat, exotic melee), whether the adept bought
// Critical Strike for it or not. Adepts buy the first level only: +1 whatever the level.
export function deathSowerAdeptDamage(magicType, level, weaponCategory) {
  if (weaponCategory !== "meleeWeapon" || (magicType !== "adept" && magicType !== "mysticalAdept")) return 0
  return (Number(level) || 0) > 0 ? 1 : 0
}

// Rapid-Fire Caster (p. 38): "once per day per level", a reckless spell without the Drain increase (SR5 p. 284), then
// eight hours of full rest. The uses are counted on the actor ({used, since}: world time in seconds of the first use
// counted), read as a day of world time from that first use; the rest the book asks for is also a reset by hand.
export const RAPID_FIRE_DAY = 24 * 3600

const rapidFireExpired = (record, now) => !record || !(Number(record.used) > 0) || (Number(now) - (Number(record.since) || 0)) >= RAPID_FIRE_DAY

export function rapidFireRemaining(level, record, now){
  const max = Math.max(0, Math.floor(Number(level) || 0))
  if (rapidFireExpired(record, now)) return max
  return Math.max(0, max - Number(record.used))
}

export function rapidFireAfterUse(record, now){
  if (rapidFireExpired(record, now)) return {
    used: 1, since: Number(now) || 0
  }
  return {
    used: Number(record.used) + 1, since: Number(record.since) || 0
  }
}

// Electromancer (p. 35): after the damage resistance test of a combat spell that hurts, the target's Initiative loses
// (caster's excess hits / 2), rounded up
export function electromancerInitiative(excessHits){
  return Math.ceil(Math.max(0, Number(excessHits) || 0) / 2)
}

// Guru (p. 37): +1 die and +1 limit per (60 / Charisma) ordinary participants, at most the Ritual Spellcasting rank
export function guruBonus(participants, charisma, ritualRank){
  const cha = Number(charisma) || 0
  if (cha <= 0) return 0
  return Math.max(0, Math.min(Math.floor((Math.max(0, Number(participants) || 0) * cha) / 60), Number(ritualRank) || 0))
}
