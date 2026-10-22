// The direct connection of an attacker to a slaved device (A3 of the API pour Matrice v1). SR5 p. 234: a slave
// defends with the better of its own ratings and its master's; attacked through a direct connection, with its own
// alone. The system knows one switch per device (isDirectlyConnected, the gamemaster's), the same for every attacker;
// the hook sr5.matrixDirectConnection lets a module rule it attacker by attacker (Matrice v1: "direct only from the
// zone that commands the device"). Without a subscriber, nothing changes.

import {
  safeCall
} from "../../canvas/pan-crown/pan-hooks.js"
import {
  verdictCall
} from "../../system/house-rule-hooks.js"
import {
  hostNodesAllowed
} from "../../system/host-nodes.js"
import {
  isSceneryDevice
} from "../../system/pan-candidates.js"

export const MATRIX_DIRECT_CONNECTION_HOOK = "sr5.matrixDirectConnection"

/**
 * Is this attacker directly connected to this slave? The system's verdict, which a subscriber may turn either way.
 * @param {Object|null} attacker   the actor who attacks
 * @param {Object|null} device     the slaved device: its itemDevice (its holder in device.actor), or the actor
 * @param {Boolean} direct         the system's verdict (an item slaved to a PAN: false; a device of the scenery: its
 *                                 isDirectlyConnected switch)
 * @param {Function} [call]
 * @return {Boolean}
 */
export function directConnectionVerdict(attacker, device, direct, call = null){
  const verdict = {
    direct: direct === true
  }
  // Each subscriber called in turn, the answer of one that throws thrown away (verdictCall, house-rule-hooks.js)
  safeCall(MATRIX_DIRECT_CONNECTION_HOOK, [attacker ?? null, device ?? null, verdict], call ?? verdictCall(verdict, ["direct"]))
  return verdict.direct === true
}

/**
 * Does the slave defend with its master's pool? (SR5 p. 234) Only when not directly connected, and when the master's
 * pool is at least as large.
 * @param {Object} options
 * @param {Boolean} options.direct     the attacker is directly connected (directConnectionVerdict)
 * @param {Number} options.ownPool     the slave's own pool
 * @param {Number|null} options.masterPool  the master's pool for this defense, null without a master
 * @return {Boolean}
 */
export function defendsWithMaster({
  direct = false, ownPool = 0, masterPool = null
} = {
}){
  if (direct || typeof masterPool !== "number" || !Number.isFinite(masterPool)) return false
  // A tie goes to the master, as for an item slaved to a PAN (rollData-MatrixDefense.js)
  return masterPool >= (Number(ownPool) || 0)
}

/**
 * The master of a device of the scenery (actorDevice.system.matrix.panMaster, lot 7 of the crown): a host, or the
 * actor whose master item it names. A host or an IC has none.
 * @param {Object} actor     the defending actor
 * @param {Function} resolve uuid -> document (fromUuidSync)
 * @return {Object|null} the master's actor
 */
export function wanMasterOf(actor, resolve = uuid => globalThis.fromUuidSync?.(uuid) ?? null){
  const matrix = actor?.system?.matrix
  // A host is slaved to nothing, unless the world setting sr5HostNodes is checked (host-nodes.js, arbitrage de DjamZ)
  // A drone with no rigger serves as a device of the scenery (pan-candidates.js)
  if (!isSceneryDevice(actor) || matrix?.deviceType === "ice" || (matrix?.deviceType === "host" && !hostNodesAllowed())) return null
  const key = matrix?.panMaster
  if (typeof key !== "string" || !key) return null
  let target = null
  try {
    target = resolve(key)
  } catch {
    target = null
  }
  const master = target?.documentName === "Item" ? target.actor : target
  if (!master?.system?.matrix?.actions || master === actor) return null
  return master
}
