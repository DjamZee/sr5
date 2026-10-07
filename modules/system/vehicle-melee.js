// A melee weapon on a vehicle or a drone (Rigger 5.0 p. 129, 182).
// Pure rules, read by the weapon preparation of a drone.

// R5 p. 182 (Attaque en mêlée): "Des armes de mêlée peuvent être montées directement sur un véhicule [...] l'arme
// utilise la moitié de la Structure du véhicule comme valeur de Force, à laquelle s'ajoute la Vitesse du véhicule
// pour déterminer les dégâts infligés". R5 p. 129 (Bras de drone): a drone arm starts with a Strength equal to the
// Body and an Agility equal to the Pilot, which replaces the Pilot for the Agility tests made with the arm.

/** A weapon is mounted when an active weapon mount of the vehicle holds it; a melee weapon that is not is held
 *  by a drone arm (arbitrage d'Odile, 07/10: the book gives no third way for a drone to wield one) */
export function isMountedWeapon(weaponId, items) {
  return Array.from(items ?? []).some(m => m?.type === "itemVehicleMod" && m.system?.isWeaponMounted &&
    m.system?.mountedWeapon === weaponId && m.system?.isActive !== false)
}

/** The Strength a Strength-based melee weapon of a vehicle hits with: half the Body when it is mounted (p. 182),
 *  the Body for a drone arm (p. 129) */
export function vehicleMeleeStrength(body, mounted) {
  const value = Math.max(0, Math.floor(Number(body) || 0))
  return mounted ? Math.floor(value / 2) : value
}

/** Every melee attack made from a vehicle adds its Speed to the damage (p. 182), the Dragonfly swarm of the
 *  example included */
export function vehicleMeleeSpeedBonus(speed) {
  return Math.max(0, Math.floor(Number(speed) || 0))
}

/** The controller's skill: Gunnery for a mounted weapon, as for any weapon mounted on or in a vehicle (SR5 p. 134); the
 *  weapon's own melee skill for a drone arm, which does what a limb does (p. 129) */
export function vehicleWeaponSkill(category, mounted, meleeSkill) {
  if (category !== "meleeWeapon" || mounted || !meleeSkill) return "gunnery"
  return meleeSkill
}
