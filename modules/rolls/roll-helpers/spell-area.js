/**
 * The radius of an area spell as cast, in metres.
 * - An area spell: its Force in metres.
 * - A detection spell: Force × Magic of the caster, × 10 at extended range (SR5, Detection spells).
 * - Spell Shaping adds 1 m of radius per die given up (SR5 p. 329): added to the radius above, never multiplied.
 * The bubbles of Spell Shaping are not handled here (the #633 port will bring them, a world setting).
 * Kept free of Foundry globals so the rule can be read, and tested, alone.
 */
export function spellAreaRadius({
  shaping = 0, force = 0, detection = false, magic = 0, extended = false
} = {
}) {
  const metres = Math.max(0, Number(shaping) || 0)
  const f = Number(force) || 0
  if (!detection) return f + metres
  return f * (Number(magic) || 0) * (extended ? 10 : 1) + metres
}
