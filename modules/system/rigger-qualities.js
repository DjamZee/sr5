// The qualities of Rigger 5.0 (p. 37-38) whose effect hangs on a condition: pure helpers, no Foundry dependency.
// A quality says it is one of them by a `systemEffects` value of the "specialCase" category.

/** The `systemEffects` values the qualities carry. */
export const RIGGER_QUALITY_EFFECTS = {
  speedDemon: "riggerSpeedDemon",
  informationOverload: "riggerInformationOverload",
}

/** Démon de la vitesse (p. 37): +1 to the piloting tests of a vehicle moving at Speed 3 or more, 4 for aircraft. */
export const SPEED_DEMON_BONUS = 1
/** Surcharge d'informations (p. 38): −2 dice once four vehicles or drones he directs are moving. */
export const INFORMATION_OVERLOAD_PENALTY = -2
export const INFORMATION_OVERLOAD_COUNT = 4

/** The `systemEffects` of an item as a list. Raw creation data and the packs may still hold an indexed object. */
function effectsOf(item) {
  const raw = item?.system?.systemEffects
  return Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : []
}

/** The items of an actor as a list: an embedded collection, a Map or an array. */
function listOf(items) {
  if (Array.isArray(items)) return items
  if (Array.isArray(items?.contents)) return items.contents
  return typeof items?.values === "function" ? [...items.values()] : []
}

/** Whether one of `items`, an active quality, carries the `systemEffects` value `value`. */
export function hasRiggerQuality(items, value) {
  return listOf(items).some(item => item?.type === "itemQuality" && item.system?.isActive &&
    effectsOf(item).some(e => e?.value === value))
}

/** Whether a vehicle moves: its current Speed is above 0. */
export function isMoving(vehicleSystem) {
  return (Number(vehicleSystem?.currentSpeed) || 0) > 0
}

/** Aircraft fly with these skills; Démon de la vitesse asks them Speed 4. */
const AIRCRAFT_SKILLS = new Set(["pilotAircraft", "pilotAerospace"])

/**
 * Démon de la vitesse: the bonus of a piloting test of the vehicle `vehicleSystem` (its currentSpeed, controlMode,
 * pilotSkill). The rigger is aboard (manual) or jumped in (rigging); "le bonus ne s'applique pas aux véhicules
 * simplement pilotés à distance", nor to the autopilot, which rolls without him.
 */
export function speedDemonBonus(vehicleSystem, ownerItems) {
  const mode = vehicleSystem?.controlMode
  if (mode !== "manual" && mode !== "rigging") return 0
  if (!hasRiggerQuality(ownerItems, RIGGER_QUALITY_EFFECTS.speedDemon)) return 0
  const needed = AIRCRAFT_SKILLS.has(vehicleSystem?.pilotSkill) ? 4 : 3
  return (Number(vehicleSystem?.currentSpeed) || 0) >= needed ? SPEED_DEMON_BONUS : 0
}

/**
 * Surcharge d'informations: the penalty of a piloting test of the vehicle `vehicleSystem`, when `movingCount` vehicles
 * and drones its controller directs are moving, the tested one among them. The autopilot's own test uses its Pilot,
 * not the rigger: it is not one of "ses" tests. The drones on autopilot still count ("cela s'applique même si
 * certains […] sont en pilote automatique").
 */
export function informationOverloadPenalty(vehicleSystem, ownerItems, movingCount) {
  if (!vehicleSystem?.vehicleOwner?.id || vehicleSystem.controlMode === "autopilot") return 0
  if (!isMoving(vehicleSystem)) return 0
  if (!hasRiggerQuality(ownerItems, RIGGER_QUALITY_EFFECTS.informationOverload)) return 0
  return (Number(movingCount) || 0) >= INFORMATION_OVERLOAD_COUNT ? INFORMATION_OVERLOAD_PENALTY : 0
}

/**
 * How many vehicles and drones directed by `ownerId` are moving, among `vehicles` (the systems of the drone actors).
 */
export function movingVehiclesOf(ownerId, vehicles) {
  if (!ownerId) return 0
  return listOf(vehicles).filter(system => system?.vehicleOwner?.id === ownerId && isMoving(system)).length
}

