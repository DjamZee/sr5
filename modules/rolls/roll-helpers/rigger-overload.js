import {
  informationOverloadPenalty, movingVehiclesOf
} from "../../system/rigger-qualities.js"

//Surcharge d'informations (Rigger 5.0 p. 38): read when the test is rolled, since it hangs on the other drones of the
//rigger, whose Speed changes without the tested one being prepared again. The world's drone actors are counted.
export function applyInformationOverload(rollData, actor){
  let system = actor?.system
  let owner = system?.vehicleOwner
  if (!owner?.id) return rollData
  //By id: the tested drone counts once, as it is now, even when it is the unlinked actor of a token
  let drones = new Map((globalThis.game?.actors?.contents || []).filter(a => a.type === "actorDrone").map(a => [a.id, a.system]))
  drones.set(actor.id, system)
  let penalty = informationOverloadPenalty(system, owner.items, movingVehiclesOf(owner.id, drones))
  if (penalty) rollData.dicePool.modifiers.push({
    type: "itemQuality", label: game.i18n.localize("SR5.RiggerInformationOverload"), value: penalty
  })
  return rollData
}
