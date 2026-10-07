// Devices (IC and hosts included), drones and agents compute their whole matrix from an embedded
// base device. The creation dialog adds it, but an actor created by script with an empty item list
// (Actor.create({..., items: []}), createDocuments) skipped that step: an IC had 0 dice to attack.
export const BASE_DEVICE_ACTOR_TYPES = ["actorDevice", "actorDrone", "actorAgent"]

// Whether these items hold a base device. Another device (a commlink stowed in a vehicle's gear, deployed with the
// drone) is no base device: the drone without one had no active device at all
export function hasBaseDevice(items = []) {
  return [...items].some(i => i.type === "itemDevice" && i.system?.type === "baseDevice")
}

// The base device to add to a new actor of this type, or null when it needs none or already has one
export function missingBaseDevice(type, items = []) {
  if (!BASE_DEVICE_ACTOR_TYPES.includes(type)) return null
  if (hasBaseDevice(items)) return null
  return {
    name: game.i18n.localize("SR5.Device"),
    type: "itemDevice",
    system: {
      isActive: true,
      type: "baseDevice",
    },
  }
}
