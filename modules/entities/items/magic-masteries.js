// Magical masteries (Forbidden Arcana p. 30-41): pure helpers, no Foundry dependency.
// A mastery is a quality; its level is the quality rating, carried by the custom effect onto
// system.magic.masteries.<key>.

// Masteries that let a spell be sustained without penalty: one spell per level, Force <= Magic
// Illusionist (p. 37): Illusion spells ; Master Manipulator (p. 38): mental Manipulation spells
const SUSTAIN_MASTERIES = {
  illusionist: spell => spell.category === "illusion",
  masterManipulator: spell => spell.category === "manipulation" && spell.subCategory === "mental",
}

// Returns the ids of the sustained spells freed from the sustaining penalty.
// spells: [{id, category, subCategory, force}] (already free spells must be left out by the caller)
// levels: {illusionist, masterManipulator}
// The most powerful eligible spells are freed first.
export function masteryFreeSustainedSpells(spells, magic, levels = {
}) {
  const freed = new Set()
  const sorted = [...(spells || [])].sort((a, b) => (b.force || 0) - (a.force || 0))
  for (const [key, eligible] of Object.entries(SUSTAIN_MASTERIES)) {
    let slots = Math.max(0, Math.floor(levels[key] || 0))
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
