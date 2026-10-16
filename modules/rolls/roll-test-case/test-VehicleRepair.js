import {
  SR5_RollMessage
} from "../roll-message.js"

//Repairing a vehicle or a drone (Rigger 5.0 p. 33-34, p. 167): the boxes leave the monitor once the test is over
export default async function vehicleRepairInfo(cardData){
  const repair = cardData.various?.vehicleRepair
  if (!repair) return

  //R5 p. 167, autonomous nanomaintenance: each hit repairs a box
  if (cardData.test.typeSub === "nanomaintenance"){
    repair.repaired = Math.min(cardData.roll.hits, repair.boxes)
    if (repair.repaired > 0) cardData.chatCard.buttons.repairVehicle = repairButton(repair)
    else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.VehicleRepairNothing"))
    return
  }

  //SR5 p. 51: a critical glitch ends the extended test, nothing is repaired
  if (cardData.roll.criticalGlitchRoll){
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.VehicleRepairFailed"))
    return
  }
  //R5 p. 34: the threshold is the number of boxes to repair, all of them repaired when it is reached
  if (cardData.roll.hits >= cardData.threshold.value){
    repair.repaired = repair.boxes
    cardData.chatCard.buttons.repairVehicle = repairButton(repair)
    cardData.test.isExtended = false
  //SR5 p. 50: the pool has run out (roll-test.js stops the test at one die) before the threshold, nothing is repaired
  } else if (!cardData.test.isExtended) {
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.VehicleRepairUnfinished"))
  }
}

function repairButton(repair){
  return SR5_RollMessage.generateChatButton("nonOpposedTest", "repairVehicle", game.i18n.format("SR5.VehicleRepairButton", {
    boxes: repair.repaired, vehicle: repair.vehicleName
  }))
}
