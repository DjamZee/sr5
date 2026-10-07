// Repairing a vehicle or a drone (Rigger 5.0 p. 33-34, nanomaintenance p. 167; SR5 p. 146-148).
// Pure rules, read by the repair button of the drone sheet, the roll preparation and the chat card.

// SR5 p. 146-147: aircraft go to Aeronautics Mechanic, boats to Nautical Mechanic, every ground vehicle
// "des voitures commerciales aux tanks en passant par les drones sur roues" (walkers included, its
// Anthropomorphic specialization) to Automotive Mechanic
const MECHANIC_BY_PILOT_SKILL = {
  pilotAircraft: "aeronauticsMechanic",
  pilotAerospace: "aeronauticsMechanic",
  pilotWatercraft: "nauticalMechanic",
  pilotGroundCraft: "automotiveMechanic",
  pilotWalker: "automotiveMechanic",
}
const MECHANIC_BY_CATEGORY = {
  vectorThrustCraft: "aeronauticsMechanic",
  fixedWingAircraft: "aeronauticsMechanic",
  rotorCraft: "aeronauticsMechanic",
  lta: "aeronauticsMechanic",
  boat: "nauticalMechanic",
  submarine: "nauticalMechanic",
  car: "automotiveMechanic",
  truck: "automotiveMechanic",
  bike: "automotiveMechanic",
}
export const MECHANIC_SKILLS = ["automotiveMechanic", "aeronauticsMechanic", "nauticalMechanic", "industrialMechanic"]

/** The Mechanic skill a vehicle calls for: its category first, then the skill it is piloted with (a drone is
 *  sized, not typed), Automotive Mechanic by default. The dialog lets the player pick another one */
export function mechanicSkillFor(vehicle) {
  return MECHANIC_BY_CATEGORY[vehicle?.category] || MECHANIC_BY_PILOT_SKILL[vehicle?.pilotSkill] || "automotiveMechanic"
}

/** Boxes of damage on the condition monitor, and whether the vehicle is wrecked: "si toutes les cases de son
 *  Moniteur de condition sont remplies, […] votre bébé est grillé" (R5 p. 33), no repair test then */
export function repairState(monitor) {
  const damage = Math.max(0, Math.floor(Number(monitor?.actual?.value) || 0))
  const max = Math.max(0, Math.floor(Number(monitor?.value) || 0))
  return {
    damage, wrecked: max > 0 && damage >= max, repairable: damage > 0 && !(max > 0 && damage >= max)
  }
}

/** R5 p. 34: threshold = boxes to repair, interval 4 hours; with parts missing the interval becomes one day and
 *  each missing box (one box of parts per box of damage) costs -4 dice. R5 p. 167: the assisted nanomaintenance
 *  adds its rating to the pool */
export function repairPlan({
  boxes, missingParts = 0, nanoAssist = 0
}) {
  const threshold = Math.max(1, Math.floor(Number(boxes) || 0))
  const missing = Math.min(threshold, Math.max(0, Math.floor(Number(missingParts) || 0)))
  return {
    threshold,
    missingParts: missing,
    interval: missing > 0 ? "day" : "hour",
    multiplier: missing > 0 ? 1 : 4,
    partsModifier: missing > 0 ? -4 * missing : 0,
    nanoModifier: Math.max(0, Math.floor(Number(nanoAssist) || 0)),
  }
}

/** R5 p. 34: parts cost 5 % of the vehicle's price per box of damage to repair */
export function partsCost(price, boxes) {
  return Math.round((Number(price) || 0) * 0.05 * Math.max(0, Number(boxes) || 0))
}

/** Rating of the nanomaintenance system (R5 p. 167, rating 1-4) among the vehicle's mods: the system effect
 *  "nanomaintenance" of an active mod, or failing that a mod named after it (the mods of the compendiums do
 *  not carry the effect yet). The best one counts */
export function nanomaintenanceRating(items) {
  let rating = 0
  for (const item of items ?? []) {
    if (item?.type !== "itemVehicleMod" || item.system?.isActive === false) continue
    const effects = Object.values(item.system?.systemEffects ?? {
    })
    const flagged = effects.some(e => e?.value === "nanomaintenance")
    if (!flagged && !/nano-?maint/i.test(item.name ?? "")) continue
    rating = Math.max(rating, Math.min(4, Math.max(1, Math.floor(Number(item.system?.itemRating) || 1))))
  }
  return rating
}

/** The stored fields of the condition monitor once boxes are repaired: the base loses them (never below 0),
 *  aggravated marks never outnumber the boxes left */
export function repairedMonitor(monitor, boxes) {
  const base = Math.max(0, Math.floor(Number(monitor?.actual?.base) || 0))
  const repaired = Math.min(base, Math.max(0, Math.floor(Number(boxes) || 0)))
  const update = {
    base: base - repaired, repaired
  }
  if (monitor?.aggravated !== undefined) update.aggravated = Math.min(monitor.aggravated || 0, update.base)
  return update
}
