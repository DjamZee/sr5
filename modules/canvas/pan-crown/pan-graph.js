// The graph of a PAN, as plain rules with no Foundry in them so that tests can read them (couronne du PAN, lot 1).
//
// SR5 p. 233-234: a commlink or a deck slaves up to its Device Rating x 3 devices; only a device is ever a slave, and
// a slave is never a master at the same time. Kill Code p. 39 (VO, PANs/WANs): "Slaved devices run silent when their
// master devices do"; a slave can also run silent on its own. A device whose wireless is off is out of the Matrix.
//
// What the system already stores, and what this file reads (nothing new is written):
// - the master is the active itemDevice of the actor; its system.pan.content lists the slaves ({name, uuid}),
//   which may be items of another actor of the table;
// - a slave carries isSlavedToPan and panMaster (the id of the master's actor);
// - a deployed drone is an actorDrone whose creatorItemId is the itemVehicle of its rigger, and whose creatorId is
//   that rigger (token id for an unlinked token); while it is deployed, the drone holds the wireless switch (N83);
// - silent running is stored per actor (system.matrix.runningSilent); per device (system.isSilent) comes with lot 6,
//   and is read here already so that lot 6 only adds the field.

import {
  iconCategoryOf
} from "./pan-icons.js"

export const PAN_NODE_KINDS = ["master", "slave", "drone", "device"]
export const PAN_MODES = ["active", "silent", "offline"]

// Items that can be an icon of the Matrix: those that carry the wireless switch. A drug has one too, for its own
// phases, and is no device.
export function isMatrixItem(item){
  return !!item && item.type !== "itemDrug" && item.system?.isWireless !== undefined
}

// The device through which the actor reaches the Matrix: its active commlink, deck, rigger console or living persona
export function activeDeviceOf(actor){
  return itemsOf(actor).find(i => i.type === "itemDevice" && i.system?.isActive) ?? null
}

// Does the actor have an antenna switched on (decision of DjamZ, Q2: without a commlink or a deck switched on, one
// only sees one's own crown)? A drone or a device carries its own antenna.
export function hasAntenna(actor){
  if (!actor) return false
  if (actor.type === "actorDrone" || actor.type === "actorDevice") return actor.system?.wirelessTurnedOn !== false
  const device = activeDeviceOf(actor)
  return !!device && device.system?.wirelessTurnedOn !== false
}

// The id the system gives an actor in marks and links: the token's for an unlinked token, the actor's otherwise
export function realIdOf(actor){
  return actor?.isToken ? actor.token?.id : actor?.id
}

// Every id an actor answers to: a mark or a link may carry either
export function idsOf(actor){
  return [actor?.id, actor?.isToken ? actor.token?.id : undefined].filter(Boolean)
}

/**
 * The mode of one device, before what its master passes on.
 * @param {Object} item       the item
 * @param {Object} [drone]    the deployed drone of a vehicle, which holds the switches while it is out
 * @return {String}           "active", "silent" or "offline"
 */
export function ownMode(item, drone = null){
  const holder = drone ?? item
  if (item.system?.isWireless === false || holder.system?.wirelessTurnedOn === false) return "offline"
  if (item.system?.isSilent === true) return "silent"
  if (drone?.system?.matrix?.runningSilent === true) return "silent"
  return "active"
}

/**
 * The mode of the master device: off with its wireless, silent when its user runs silent (SR5 p. 236).
 * @param {Object} item   the active itemDevice
 * @param {Object} actor  its user
 */
export function masterMode(item, actor){
  if (item.system?.wirelessTurnedOn === false) return "offline"
  if (item.system?.isSilent === true || actor?.system?.matrix?.runningSilent === true) return "silent"
  return "active"
}

/**
 * The effective mode of a slave: offline comes first, then its own silent mode, then its master's (KC p. 39).
 * A master that is out of the Matrix passes nothing on: the book only speaks of a master that runs silent.
 * @return {{mode: String, silentFrom: String|null}}  silentFrom: "self" or "master" when the slave runs silent
 */
export function slaveMode(own, master){
  if (own === "offline") return {
    mode: "offline", silentFrom: null
  }
  if (own === "silent") return {
    mode: "silent", silentFrom: "self"
  }
  if (master === "silent") return {
    mode: "silent", silentFrom: "master"
  }
  return {
    mode: "active", silentFrom: null
  }
}

// The deployed drone of a vehicle item: one item of one actor (a duplicated actor carries the same item ids)
export function droneOf(vehicle, owner, actors){
  if (vehicle?.type !== "itemVehicle" || !vehicle.system?.isCreated) return null
  const creators = idsOf(owner)
  const itemId = vehicle.id ?? vehicle._id
  return arrayOf(actors).find(a => a.type === "actorDrone" && a.system?.creatorItemId === itemId &&
    creators.includes(a.system?.creatorId)) ?? null
}

/**
 * Build the graph of an actor's PAN.
 * @param {Object} actor                 the actor whose crown it is (a token's actor for an unlinked token)
 * @param {Object} options
 * @param {Function} options.resolve     uuid -> item, for the slaves (fromUuidSync in Foundry)
 * @param {Array} options.actors         the actors to look deployed drones up in (world actors and token actors)
 * @return {Object} {owner, master, nodes, links, missing}
 *   owner:   {id, actorId, name, type}
 *   master:  the uuid of the master node, or null
 *   nodes:   [{uuid, kind, name, itemType, subType, icon, holderIds, mode, silentFrom, rating, marks, droneId, revealed}]
 *   links:   [{from, to, kind}]; "owner" is the id of the crown's center, the token
 *   missing: the PAN entries whose item could not be found
 */
export function buildPanGraph(actor, {
  resolve = () => null, actors = []
} = {
}){
  const graph = {
    owner: {
      id: realIdOf(actor), actorId: actor?.id ?? null, name: actor?.name ?? "", type: actor?.type ?? ""
    },
    master: null,
    nodes: [],
    links: [],
    missing: [],
    rigger: null,
  }
  if (!actor) return graph

  // A deployed drone is linked to its rigger's master (lot 7 draws the line between the two tokens)
  if (actor.type === "actorDrone" && actor.system?.creatorId) graph.rigger = {
    actorId: actor.system.creatorId, itemId: actor.system.creatorItemId ?? null
  }

  const seen = new Set()
  const add = (node, from, kind) => {
    graph.nodes.push(node)
    seen.add(node.uuid)
    graph.links.push({
      from, to: node.uuid, kind
    })
  }

  const device = activeDeviceOf(actor)
  let masterState = null
  if (device){
    masterState = masterMode(device, actor)
    graph.master = device.uuid
    add(nodeOf(device, "master", actor, masterState, null), "owner", "persona")

    for (const entry of arrayOf(device.system?.pan?.content)){
      if (!entry?.uuid || seen.has(entry.uuid)) continue
      const item = resolve(entry.uuid)
      if (!item) {
        graph.missing.push({
          uuid: entry.uuid, name: entry.name ?? ""
        })
        continue
      }
      const holder = item.parent ?? actor
      const drone = droneOf(item, holder, actors)
      const {
        mode, silentFrom
      } = slaveMode(ownMode(item, drone), masterState)
      add(nodeOf(item, drone ? "drone" : "slave", holder, mode, silentFrom, drone, actor), device.uuid, drone ? "drone" : "slave")
    }
  }

  // The actor's other devices in the Matrix, slaved to nothing: each one is an icon of its own (SR5 p. 233). Only
  // those switched on and in use (the system's "connected objects"): a switched off device that belongs to no PAN
  // is no icon at all. A device slaved to another PAN is drawn in that one.
  for (const item of itemsOf(actor)){
    if (seen.has(item.uuid) || item === device || !isMatrixItem(item)) continue
    if (item.system?.isSlavedToPan) continue
    if (item.type === "itemDevice") continue
    const drone = droneOf(item, actor, actors)
    const own = ownMode(item, drone)
    if (own === "offline" || (!drone && !item.system?.isActive)) continue
    add(nodeOf(item, drone ? "drone" : "device", actor, own, own === "silent" ? "self" : null, drone), "owner", drone ? "drone" : "device")
  }
  return graph
}

function nodeOf(item, kind, holder, mode, silentFrom, drone = null, panOwner = null){
  const source = drone ?? item
  return {
    uuid: item.uuid,
    kind,
    name: item.name ?? "",
    itemType: item.type,
    subType: item.system?.type ?? "",
    // The generic icon of its category (lot 2)
    icon: iconCategoryOf(item),
    holderIds: idsOf(holder),
    // The user of the PAN owns its slaves for the Matrix, even a device carried by another character
    ownerIds: [...new Set([...idsOf(holder), ...idsOf(panOwner)])],
    mode,
    silentFrom,
    rating: Number(item.system?.deviceRating) || 0,
    // A deployed drone is marked through its own device as well as through the vehicle item
    marks: [...arrayOf(item.system?.marks), ...arrayOf(drone ? activeDeviceOf(drone)?.system?.marks : null)]
      .map(m => ({
        ownerId: m.ownerId, value: Number(m.value) || 0
      })),
    droneId: drone ? realIdOf(drone) : null,
    // The gamemaster's reveal (lot 3), for the whole table (decision of DjamZ, Q4)
    revealed: source.flags?.sr5?.panReveal === true || item.flags?.sr5?.panReveal === true,
  }
}

function itemsOf(actor){
  return arrayOf(actor?.items)
}

function arrayOf(list){
  if (!list) return []
  return Array.isArray(list) ? list : Array.from(list)
}
