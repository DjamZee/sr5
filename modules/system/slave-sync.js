// Slaving a drone (SR5 p. 233-234, 269; lot R5 of the djamz.13 review, DjamZ): "une seule des deux manipulations
// doit suffire à faire les deux". Adding the vehicle to the PAN of the rigger's master, from the rigger's sheet, ticks
// the box "Appareil asservi" of the drone; ticking that box on the deployed drone puts the vehicle in the PAN list.
// Taking it out of the list, or unticking the box, undoes both.

import {
  droneOf
} from "../canvas/pan-crown/pan-graph.js"
import {
  isActiveGM
} from "./aegis.js"

/** The PAN entry of a vehicle item: by its uuid, or by its id (an unlinked rigger lists its world actor's items) */
export function panIndexOf(content, vehicle) {
  const id = vehicle?.id ?? vehicle?._id
  return (Array.isArray(content) ? content : []).findIndex(e => e?.uuid === vehicle?.uuid || (!!id && String(e?.uuid ?? "").endsWith(`.Item.${id}`)))
}

/**
 * What the box of a drone asks of its rigger's PAN list: "add", "remove", or null when the list already agrees.
 * @param {boolean} slaved      the box, after the change
 * @param {number} index        panIndexOf the vehicle in the master's list (-1: absent)
 * @param {{current:number, max:number}|undefined} pan  the rigger's PAN load
 */
export function panChangeFor(slaved, index, pan) {
  if (slaved && index < 0) {
    //A full PAN takes no more: the box alone still slaves the drone (lot R7, decision of DjamZ, 2026-10-08)
    if (pan && Number(pan.max) > 0 && Number(pan.current) >= Number(pan.max)) return null
    return "add"
  }
  if (!slaved && index >= 0) return "remove"
  return null
}

//Every drone actor a vehicle item may have been deployed as: world actors and the synthetic actors of the scene
function knownActors() {
  const actors = [...(game.actors?.contents ?? [])]
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) if (token.actor && !token.document.actorLink) actors.push(token.actor)
  return actors
}

/** The deployed drone of a vehicle item of the rigger, if any */
export function deployedDrone(vehicle, rigger) {
  return droneOf(vehicle, rigger, knownActors())
}

/**
 * The PAN list changed (SR5_ActorHelper.addItemtoPan / deleteItemFromPan): the deployed drone's box follows.
 */
export async function syncDroneBox(vehicle, rigger, slaved) {
  if (vehicle?.type !== "itemVehicle") return
  const drone = deployedDrone(vehicle, rigger)
  //Marked, so that onDroneSlavedChange does not write the list a second time
  if (drone && !!drone.system?.slaved !== slaved && drone.isOwner) await drone.update({
    "system.slaved": slaved
  }, {
    sr5SlaveSync: true
  })
}

/**
 * The box of a deployed drone changed: its vehicle joins or leaves the PAN of the rigger's master. Run once, by the
 * user who ticked it when she owns the rigger, by the active gamemaster otherwise.
 */
export async function onDroneSlavedChange(actor, changes, options, userId) {
  if (actor?.type !== "actorDrone" || options?.sr5SlaveSync || !foundry.utils.hasProperty(changes, "system.slaved")) return
  const {
    SR5_EntityHelpers
  } = await import("../entities/helpers.js")
  const rigger = actor.system.creatorId ? SR5_EntityHelpers.getRealActorFromID(actor.system.creatorId) : null
  const vehicle = rigger?.items?.get(actor.system.creatorItemId)
  if (!vehicle) return
  const user = game.users.get(userId)
  const userOwns = !!user && rigger.testUserPermission(user, "OWNER")
  if (userOwns ? userId !== game.user.id : !isActiveGM()) return
  const device = rigger.items.find(d => d.type === "itemDevice" && d.system.isActive)
  if (!device) return
  const index = panIndexOf(device.system.pan?.content, vehicle)
  const change = panChangeFor(!!actor.system.slaved, index, rigger.system?.matrix?.pan)
  if (!change) return
  const {
    SR5_ActorHelper
  } = await import("../entities/actors/entityActor-helpers.js")
  if (change === "add") await SR5_ActorHelper.addItemtoPan(vehicle.uuid, actor.system.creatorId)
  else await SR5_ActorHelper.deleteItemFromPan(vehicle.uuid, actor.system.creatorId, index)
}
