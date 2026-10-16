// The copy of its controller a drone carries (system.vehicleOwner: the rigger's system and items) is what the drone
// reads for the console's autosofts, the controller's skills and its noise (SR5 p. 269-272). It follows every change
// of the controller: an edit of the sheet (updateActor) as well as an item added, changed or deleted (create, update,
// deleteItem), which Foundry does not report as an update of the actor.

const SYNC_DELAY = 100
const pending = new Map()

/** The controller whose drones follow a change: an actor that may control a drone (a character or a grunt), the
 *  document itself or the parent of an item */
export function controllerOf(document){
  const actor = document?.documentName === "Item" ? document.parent : document
  if (actor?.type !== "actorPc" && actor?.type !== "actorGrunt") return null
  return actor
}

/** One client copies, so that no two clients write the same drone: the active gamemaster, or with none connected the
 *  user who made the change */
export function syncsHere(users, user, userId){
  const activeGM = users?.activeGM
  if (activeGM) return activeGM.id === user?.id
  return !!user && userId === user.id
}

/** Several changes in a row (a drop of many items, a sheet that writes twice) send one copy: the last state */
export function scheduleVehicleOwnerSync(actor, sync, delay = SYNC_DELAY){
  if (!actor?.id) return
  clearTimeout(pending.get(actor.id))
  pending.set(actor.id, setTimeout(() => {
    pending.delete(actor.id)
    if (!isStillThere(actor)) return
    //A copy that fails (a drone deleted meanwhile, a write refused) is reported, never left as an unhandled rejection
    Promise.resolve().then(() => sync(actor)).catch(err => console.warn(`SR5 | copy of ${actor.name ?? actor.id} on its drones failed`, err))
  }, delay))
}

/** The controller may have been deleted, or be no full document, by the time the delay is over: then nothing is copied */
export function isStillThere(actor){
  if (typeof actor?.toObject !== "function") return false
  if (actor.isToken) return !!actor.token?.parent
  const actors = globalThis.game?.actors
  return typeof actors?.has !== "function" || actors.has(actor.id)
}

/** Drop every copy still waiting (tests, or a world being left) */
export function cancelVehicleOwnerSyncs(){
  for (const timer of pending.values()) clearTimeout(timer)
  pending.clear()
}
