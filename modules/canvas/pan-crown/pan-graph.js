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
  customIconOf, iconCategoryOf
} from "./pan-icons.js"
import {
  isAwake, isLivingPersona, isTechnomancer, personaOf
} from "../../entities/actors/living-persona.js"

// rigger: the master of the rigger, in a drone's crown; wan: the master of a device of the scenery (a host, or the
// master item of a PAN); decor: a device of the scenery slaved to the crown's master (lot 7); persona: a
// technomancer's living persona while she does not use it; sprite: a sprite she compiled (lot Technomanciens)
export const PAN_NODE_KINDS = ["master", "slave", "drone", "device", "rigger", "wan", "decor", "persona", "sprite"]
// The nodes drawn as a line to their own token, when it is on the scene, rather than as an icon (lot 7)
export const PAN_TOKEN_KINDS = ["drone", "rigger", "wan", "decor"]
export const PAN_MODES = ["active", "silent", "offline"]

// Items that can be an icon of the Matrix: those that carry the wireless switch. A drug has one too, for its own
// phases, and is no device. Nor is a living augmentation: "il va de soi que le bioware ne dispose pas de fonctions sans
// fil" (SR5 p. 462), and the same goes for genetech and symbionts, though their data carry the switch (retours de
// DjamZ, 07/10: a bioware drawn as an implant).
const LIVING_AUGMENTATIONS = ["bioware", "culturedBioware", "genetech", "symbionts"]

export function isMatrixItem(item){
  if (!item || item.type === "itemDrug" || item.system?.isWireless === undefined) return false
  return !(item.type === "itemAugmentation" && LIVING_AUGMENTATIONS.includes(item.system?.type))
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
  if (!device || device.system?.wirelessTurnedOn === false) return false
  // A living persona carries its own antenna, while the technomancer is awake (SR5 p. 236)
  return !isLivingPersona(device) || isAwake(actor)
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
  // A living persona exists in the Matrix while its technomancer is awake (SR5 p. 236)
  if (isLivingPersona(item) && actor && !isAwake(actor)) return "offline"
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
 *   nodes:   [{uuid, kind, name, itemType, subType, icon, customIcon, holderIds, mode, silentFrom, rating, marks, droneId, revealed}]
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
    wan: null,
    // How many slaves the master takes (SR5 p. 233: Device Rating x 3); null for a host, which has no ceiling (p. 234)
    capacity: null,
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
  // A drone or a device of the scenery is slaved to another master (SR5 p. 234: no device is master and slave at
  // once): its own device is an icon of the crown, and the line goes up to that master, on its token (lot 7)
  const up = upwardMasterOf(actor, graph, {
    resolve, actors
  })
  if (up){
    if (device){
      const own = masterMode(device, actor)
      const {
        mode, silentFrom
      } = up.slaved ? slaveMode(own, up.mode) : {
        mode: own, silentFrom: own === "silent" ? "self" : null
      }
      // The rigger owns the drone, and sees its device as her own
      const ownNode = nodeOf(device, "device", actor, mode, silentFrom, null, up.owner)
      ownNode.customIcon ??= customIconOf(actor)
      add(ownNode, "owner", "device")
      // The line up to the master is seen with the device it leaves from: a silent door does not betray itself
      up.node.via = device.uuid
    }
    add(up.node, "owner", up.node.kind)
  }

  let masterState = null
  if (device && !up){
    masterState = masterMode(device, actor)
    graph.master = device.uuid
    add(nodeOf(device, "master", actor, masterState, null), "owner", "persona")

    for (const entry of arrayOf(device.system?.pan?.content)){
      if (!entry?.uuid || seen.has(entry.uuid)) continue
      const item = ownCopyOf(resolve(entry.uuid), actor)
      if (item && seen.has(item.uuid)) continue
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

    // The devices of the scenery slaved to this master (actorDevice.system.matrix.panMaster, lot 7)
    let decorCount = 0
    for (const decor of decorSlavesOf(actor, device, actors)){
      const decorDevice = activeDeviceOf(decor)
      if (!decorDevice || seen.has(decorDevice.uuid)) continue
      const {
        mode, silentFrom
      } = slaveMode(masterMode(decorDevice, decor), masterState)
      const node = nodeOf(decorDevice, "decor", decor, mode, silentFrom, null, actor)
      // Its own token: the token's id for an unlinked token, so that two doors of one actor stay two
      node.holderIds = [realIdOf(decor)]
      // Its generic icon is what it is, a camera, a door... (pan-icons.js, actorIconCategoryOf); the gamemaster's own icon for a device of the scenery is on its actor (lot 10)
      node.customIcon ??= customIconOf(decor)
      add(node, device.uuid, "decor")
      decorCount++
    }
    if (!isHostActor(actor)) graph.capacity = {
      max: Number(device.system?.pan?.max) || (Number(device.system?.deviceRating) || 0) * 3,
      used: arrayOf(device.system?.pan?.content).length + decorCount,
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
  if (isTechnomancer(actor)) addResonanceNodes(actor, device, {
    add, seen, actors
  })
  return graph
}

/**
 * A technomancer's persona when she does not use it, and the sprites she compiled (lot Technomanciens).
 * - Connected through a commlink or a deck (her cover: SR5 p. 253, Data Trails p. 63), unplugged, or asleep, her persona
 *   is out of the Matrix (SR5 p. 236): it is drawn for her and the gamemaster alone, as a reminder (ownerOnly).
 * - A sprite has its own persona (SR5 p. 236); its physical place is its owner's (SR5 p. 256), so the distance is
 *   measured from her (anchorIds). Who compiled it is no public knowledge: the line to her is drawn for her and the
 *   gamemaster alone (linkOwnerOnly). While her persona is out of the Matrix, her sprites betray nothing either.
 */
function addResonanceNodes(actor, device, {
  add, seen, actors
}){
  const persona = personaOf(actor)
  const inPersona = !!persona && !!device && persona.uuid === device.uuid
  const online = inPersona && masterMode(device, actor) !== "offline"
  if (persona && !inPersona && !seen.has(persona.uuid)){
    const node = nodeOf(persona, "persona", actor, "offline", null)
    node.ownerOnly = true
    add(node, "owner", "persona")
  }
  for (const sprite of spritesOf(actor, actors)){
    const spriteDevice = activeDeviceOf(sprite)
    if (!spriteDevice || seen.has(spriteDevice.uuid)) continue
    const mode = masterMode(spriteDevice, sprite)
    const node = nodeOf(spriteDevice, "sprite", sprite, mode, mode === "silent" ? "self" : null, null, actor)
    node.name = sprite.name ?? node.name
    node.icon = "sprite"
    node.customIcon ??= customIconOf(sprite)
    node.anchorIds = idsOf(actor)
    node.linkOwnerOnly = true
    if (!online) node.ownerOnly = true
    add(node, "owner", "sprite")
  }
}

// The sprites a technomancer compiled (system.creatorId), each one once
export function spritesOf(actor, actors){
  const ids = idsOf(actor)
  const found = new Map()
  for (const a of arrayOf(actors)){
    if (a?.type !== "actorSprite" || !ids.includes(a.system?.creatorId)) continue
    const key = realIdOf(a)
    if (!found.has(key)) found.set(key, a)
  }
  return [...found.values()]
}

// The PAN of an unlinked token lists the uuids of its world actor's items (Actor.x.Item.y), while the token carries
// its own copies (Scene.s.Token.t.Actor.x.Item.y): the slave is the token's copy, or it is drawn twice, once as a
// slave and once as a loose device
function ownCopyOf(item, actor){
  if (!item || !actor?.isToken || item.parent?.id !== actor.id || item.parent === actor) return item
  const id = item.id ?? item._id
  return itemsOf(actor).find(i => (i.id ?? i._id) === id) ?? item
}

export function isHostActor(actor){
  return actor?.type === "actorDevice" && actor.system?.matrix?.deviceType === "host"
}

// What a master answers to in the field panMaster of a device of the scenery: the uuid of a host (the world actor's,
// which the sheet's selector offers), or the uuid of the master item of a PAN
export function panMasterKeysOf(actor, device){
  const keys = []
  if (isHostActor(actor)) keys.push(actor.uuid, `Actor.${actor.id}`)
  if (device) keys.push(device.uuid, `Actor.${actor?.id}.Item.${device.id ?? device._id}`)
  return keys.filter(Boolean)
}

/**
 * The devices of the scenery slaved to a master: the actorDevice whose panMaster names it. A host takes them all
 * (SR5 p. 234: a WAN has no ceiling). The token actors of the scene stand for their world actor.
 */
export function decorSlavesOf(actor, device, actors){
  const keys = panMasterKeysOf(actor, device)
  if (!keys.length) return []
  const list = arrayOf(actors)
  const tokenIds = new Set(list.filter(a => a?.isToken).map(a => a.id))
  return list.filter(a => a?.type === "actorDevice" && !isHostActor(a) && a !== actor &&
    keys.includes(a.system?.matrix?.panMaster) && (a.isToken || !tokenIds.has(a.id)))
}

// The master a drone (its rigger's) or a device of the scenery (panMaster) goes up to, as a node of the crown
function upwardMasterOf(actor, graph, {
  resolve, actors
}){
  if (graph.rigger){
    const rigger = arrayOf(actors).find(a => a?.type !== "actorDrone" && idsOf(a).includes(graph.rigger.actorId))
    const device = activeDeviceOf(rigger)
    if (!device) return null
    const mode = masterMode(device, rigger)
    // The drone is slaved when its vehicle item is in the PAN of the rigger's master
    const vehicle = itemsOf(rigger).find(i => (i.id ?? i._id) === graph.rigger.itemId)
    // (by the item's id: an unlinked rigger's PAN lists the uuids of its world actor's items)
    const vehicleId = vehicle ? (vehicle.id ?? vehicle._id) : null
    const slaved = !!vehicle && arrayOf(device.system?.pan?.content).some(e => e?.uuid === vehicle.uuid ||
      String(e?.uuid ?? "").endsWith(`.Item.${vehicleId}`))
    const node = nodeOf(device, "rigger", rigger, mode, mode === "silent" ? "self" : null, null, actor)
    node.holderIds = [realIdOf(rigger)]
    return {
      node, mode, slaved, owner: rigger
    }
  }
  const key = actor.type === "actorDevice" && !isHostActor(actor) ? actor.system?.matrix?.panMaster : null
  if (!key) return null
  const target = resolve(key)
  if (!target) {
    graph.missing.push({
      uuid: key, name: ""
    })
    return null
  }
  // A host (or another actor), or the master item of a PAN
  const holder = target.items ? target : target.parent
  const device = target.items ? activeDeviceOf(target) : target
  if (!holder || !device || holder === actor || idsOf(holder).some(id => idsOf(actor).includes(id))) return null
  const mode = masterMode(device, holder)
  const node = nodeOf(device, "wan", holder, mode, mode === "silent" ? "self" : null, null, actor)
  node.holderIds = [realIdOf(holder)]
  if (isHostActor(holder)) node.icon = "host"
  node.customIcon ??= customIconOf(holder)
  graph.wan = {
    uuid: key, actorId: realIdOf(holder), isHost: isHostActor(holder)
  }
  return {
    node, mode, slaved: true
  }
}

function nodeOf(item, kind, holder, mode, silentFrom, drone = null, panOwner = null){
  const source = drone ?? item
  return {
    uuid: item.uuid,
    kind,
    // A base device is named "Appareil" in every actor: the name on hover is the actor's, the camera or the host
    name: (item.system?.type === "baseDevice" ? holder?.name : null) ?? item.name ?? "",
    itemType: item.type,
    subType: item.system?.type ?? "",
    // The generic icon of its category (lot 2)
    // (the base device of a drone, a host, an IC or a device of the scenery: the picture of what it is)
    icon: iconCategoryOf(item, holder),
    // Its own picture, if the item (or the deployed drone) has one: it takes the place of the generic one (lot 10)
    customIcon: customIconOf(item) ?? customIconOf(drone),
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
