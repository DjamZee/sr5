// Drones apart from vehicles, on the shop's shelves as at the dealership (relecture djamz.13, lot R6). Pure rules,
// read by the shop's catalogue and the dealership, free of Foundry globals so the tests read them on their own.

/** The drone categories, from the smallest: the dealership's shelf order */
export const DRONE_SHELF_ORDER = ["microdrone", "minidrone", "smallDrone", "mediumDrone", "largeDrone", "hugeDrone"]

/** A model is a drone by its type, or by a drone category when the type is missing */
export function isDroneModel(system) {
  return system?.type === "drone" || (!system?.type && DRONE_SHELF_ORDER.includes(system?.category))
}

/**
 * A drone mod is one of the chapter "Modification de drone" (Rigger 5.0 p. 126-132): drone arms and legs, adhesive
 * grips, drone weapon mounts... The vehicle mods are those of "Liste des modifications" (Rigger 5.0 p. 153-173). The
 * compendiums mark no difference but the page, which every mod of the Mégapack carries with its book.
 */
export function isDroneMod(system) {
  const page = Number.parseInt(system?.page, 10)
  return system?.source === "rigger5" && page >= 126 && page <= 132
}

/** A vehicle or a vehicle mod for a drone: the shop's Drones shelf */
export function isDroneEntry(entry) {
  if (entry?.type === "itemVehicle") return isDroneModel(entry.system)
  if (entry?.type === "itemVehicleMod") return isDroneMod(entry.system)
  return false
}
