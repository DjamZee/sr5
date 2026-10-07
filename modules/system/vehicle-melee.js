// A melee weapon on a vehicle or a drone (Rigger 5.0 p. 129, 182).
// Pure rules, read by the weapon preparation of a drone.

// R5 p. 182 (Attaque en mêlée): "Des armes de mêlée peuvent être montées directement sur un véhicule [...] l'arme
// utilise la moitié de la Structure du véhicule comme valeur de Force, à laquelle s'ajoute la Vitesse du véhicule
// pour déterminer les dégâts infligés". R5 p. 129 (Bras de drone): a drone arm starts with a Strength equal to the
// Body and an Agility equal to the Pilot, which replaces the Pilot for the Agility tests made with the arm; both can
// be upgraded up to twice the drone's own, the usual +4 cap set aside.

/** A weapon is mounted when an active weapon mount of the vehicle holds it; a melee weapon that is not is held
 *  by a drone arm (arbitrage d'Odile, 07/10: the book gives no third way for a drone to wield one) */
export function isMountedWeapon(weaponId, items) {
  return Array.from(items ?? []).some(m => m?.type === "itemVehicleMod" && m.system?.isWeaponMounted &&
    m.system?.mountedWeapon === weaponId && m.system?.isActive !== false)
}

/** The Strength a Strength-based melee weapon of a vehicle hits with: half the Body when it is mounted (p. 182),
 *  the arm's own Strength in a drone arm, its Body when the drone has no arm described (p. 129) */
export function vehicleMeleeStrength(body, mounted, armStrength) {
  const value = Math.max(0, Math.floor(Number(body) || 0))
  if (mounted) return Math.floor(value / 2)
  return Number.isFinite(armStrength) ? armStrength : value
}

const DRONE_ARM_NAME = /^\s*(bras de drone|drone arm)\b/i
const ARM_STRENGTH = /\b(?:force|strength|for|str)\s*:?\s*(\d+)/i
const ARM_AGILITY = /\b(?:agilit[ée]|agility|agi)\s*:?\s*(\d+)/i

/** A drone arm: the modification ticked as one, or named after it (the Mégapack's "Bras de drone (Force 6, Agilité
 *  2)", which no box was ticked on) */
export function isDroneArm(mod) {
  if (mod?.type !== "itemVehicleMod") return false
  return !!mod.system?.droneArm?.isDroneArm || DRONE_ARM_NAME.test(mod.name ?? "")
}

/** An attribute of a drone arm (p. 129): the value set on the modification, else the one its name gives, else the
 *  starting one (Body for Strength, Pilot for Agility); never more than twice the drone's, whatever the upgrades */
export function droneArmAttribute(set, name, pattern, start) {
  const base = Math.max(0, Math.floor(Number(start) || 0))
  let value = Math.floor(Number(set) || 0)
  if (value <= 0) value = Number(pattern.exec(name ?? "")?.[1]) || base
  return Math.min(value, base * 2)
}

/** The arm a drone wields its melee weapon with, and the ratings it does so with: the strongest of its arms (the book
 *  does not say which arm holds the weapon). Null when the drone has none */
export function droneArmProfile(items, body, pilot) {
  let best = null
  for (const mod of Array.from(items ?? [])) {
    if (!isDroneArm(mod)) continue
    const arm = {
      name: mod.name,
      strength: droneArmAttribute(mod.system?.droneArm?.strength, mod.name, ARM_STRENGTH, body),
      agility: droneArmAttribute(mod.system?.droneArm?.agility, mod.name, ARM_AGILITY, pilot),
    }
    if (!best || arm.strength > best.strength) best = arm
  }
  return best
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
