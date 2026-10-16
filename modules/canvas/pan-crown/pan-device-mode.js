// The mode of one device as its sheets show it (couronne du PAN, lot 6): active, silent or offline, with what its
// master passes on. Plain rules with no Foundry in them, so that tests can read them; the switch itself is in
// pan-device-switch.js.
//
// SR5 p. 236-237: every device can run silent, switched by its owner ("Tous les autres objets de la Matrice peuvent
// être basculés en mode silencieux par leurs propriétaires"); Kill Code p. 39 (VO): "Slaved devices run silent when
// their master devices do". A device whose wireless is off is out of the Matrix, whatever its silent box says.

import {
  activeDeviceOf, masterMode, ownMode, slaveMode
} from "./pan-graph.js"
import {
  hasWeaponTrait
} from "../../entities/items/weaponTraits.js"

// The items that carry the wireless fields (wireless.js) and whose mode a sheet shows. A drug uses the wireless switch
// for its phase (drug-phase.js): it has no mode.
export const DEVICE_MODE_TYPES = ["itemArmor", "itemAugmentation", "itemDevice", "itemGear", "itemVehicle", "itemWeapon"]

/**
 * Does the item have a mode to show: a wireless item of the listed types.
 * @param {Object} item
 */
export function hasDeviceMode(item){
  if (!DEVICE_MODE_TYPES.includes(item?.type) || item.system?.isWireless === false) return false
  // Vintage (Gun H(e)aven 3 p. 3): never wireless
  return !(item.type === "itemWeapon" && hasWeaponTrait(item.system, "vintage"))
}

/**
 * Is the item the device its user is connected through (the master of her PAN, the persona's device, SR5 p. 236)?
 * Its silent mode is its user's, the box of the sheet (system.matrix.runningSilent), which carries the -2.
 * @param {Object} item
 */
export function isMasterDevice(item){
  return item?.type === "itemDevice" && item.system?.isActive === true
}

/**
 * The effective mode of an item, as its sheets show it.
 * @param {Object} item
 * @param {Object} options
 * @param {Object} [options.actor]      its holder
 * @param {Object} [options.panOwner]   the actor whose PAN it is slaved to (system.panMaster), when it is
 * @param {Object} [options.drone]      the deployed drone of a vehicle, which holds its switches
 * @return {{mode: String, silentFrom: String|null}}  silentFrom: "self", or "master" when its master runs silent
 */
export function deviceModeOf(item, {
  actor = null, panOwner = null, drone = null
} = {
}){
  if (isMasterDevice(item)) {
    const mode = masterMode(item, actor)
    return {
      mode, silentFrom: mode === "silent" ? "self" : null
    }
  }
  const own = ownMode(item, drone)
  const master = item?.system?.isSlavedToPan ? activeDeviceOf(panOwner) : null
  if (!master) return {
    mode: own, silentFrom: own === "silent" ? "self" : null
  }
  return slaveMode(own, masterMode(master, panOwner))
}

/**
 * The device's own mode, the one its owner switches: its master's silent mode is not hers to switch.
 * @param {Object} item
 * @param {Object} [actor]  its holder, for the master device (its user's box)
 * @param {Object} [drone]  the deployed drone of a vehicle
 */
export function ownDeviceMode(item, actor = null, drone = null){
  if (isMasterDevice(item)) return masterMode(item, actor)
  return ownMode(item, drone)
}
