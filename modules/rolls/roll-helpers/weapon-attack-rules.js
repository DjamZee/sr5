// Rules that change the damage of a weapon attack. Pure helpers: the attacker's side (rollData-Weapon.js, the roll
// dialog, test-Attack.js) and the GM's check of the card call the same functions, so both give the same DV.

/** The trait a laser weapon carries (Run & Gun p. 64), as the catalog's weapon traits */
export const LASER_TRAIT = "laserWeapon"

const RANGE_STEPS = {
  short: 0, medium: 1, long: 2, extreme: 3
}

/**
 * Laser weapons (Run & Gun p. 64): "Pour chaque incrément de portée au-delà de la portée courte, la VD de l'arme est
 * réduite de 1 (portée moyenne -1, portée longue -2, portée extrême -3)", and "La VD des armes laser est réduite de 1
 * point pour chaque niveau de modificateur de visibilité (léger -1, moyen -2, dense -3)", the two adding up.
 * @param {string} range short, medium, long or extreme
 * @param {number} visibilityRow row of the Visibility column of the Environmental Modifiers table (SR5 p. 176), 0 to 4
 * @returns {number} what comes off the DV
 */
export function laserDamageReduction(range, visibilityRow = 0) {
  const steps = RANGE_STEPS[range] ?? 0
  const visibility = Math.min(Math.max(Math.floor(Number(visibilityRow)) || 0, 0), 3)
  return steps + visibility
}

/** Energy aura (SR5 p. 397): "La créature ajoute sa Magie à la Valeur de Dommages de toute attaque de mêlée qu'elle effectue" */
export function energyAuraApplies(weaponCategory) {
  return weaponCategory === "meleeWeapon"
}

/**
 * Hit 'em Where It Counts, "Tir à la jugulaire" (Run & Gun p. 131): "puissance accrue (Puissance de la toxine +2),
 * vitesse accrue (la vitesse de la toxine est réduite d'un tour de combat)". The weapon's DV does not change.
 * @returns {object|null} a copy of the toxin with those changes
 */
export function jugularToxin(toxin) {
  if (!toxin) return null
  const result = {
    ...toxin
  }
  if (Number(result.power) > 0) result.power = Number(result.power) + 2
  if (Number(result.speed) > 0) result.speed = Number(result.speed) - 1
  return result
}
