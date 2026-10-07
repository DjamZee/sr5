import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  installOutcome
} from "../../system/vehicle-workshop.js"

//Installing or removing a vehicle mod (Rigger 5.0 p. 153-154): the mod is fitted, or taken off, once the test is over
export default async function vehicleModInstallInfo(cardData){
  const install = cardData.various?.vehicleModInstall
  if (!install) return
  const end = label => SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", label)

  const outcome = installOutcome({
    hits: cardData.roll.hits, threshold: cardData.threshold.value, criticalGlitch: !!cardData.roll.criticalGlitchRoll,
    stillExtended: !!cardData.test.isExtended, removal: install.removal,
  })
  switch (outcome){
    case "done":
      cardData.test.isExtended = false
      cardData.chatCard.buttons[install.removal ? "removeVehicleMod" : "installVehicleMod"] = SR5_RollMessage.generateChatButton("nonOpposedTest", install.removal ? "removeVehicleMod" : "installVehicleMod", game.i18n.format(install.removal ? "SR5.VehicleModRemoveButton" : "SR5.VehicleModInstallButton", {
        mod: install.modName, vehicle: install.vehicleName
      }))
      //R5 p. 153: a mod that asks for a special skill needs one more test, (special skill) + Logic [Logic] (4)
      if (!install.removal && install.specialSkill) cardData.chatCard.buttons.vehicleModSpecialSkill = end(game.i18n.format("SR5.VehicleModSpecialSkill", {
        skill: install.specialSkill
      }))
      break
    //R5 p. 153: the parts are lost, everything starts again
    case "partsLost":
      cardData.chatCard.buttons.lostVehicleModParts = SR5_RollMessage.generateChatButton("nonOpposedTest", "lostVehicleModParts", game.i18n.format("SR5.VehicleModPartsLostButton", {
        mod: install.modName
      }))
      break
    case "failed":
      cardData.chatCard.buttons.actionEnd = end(game.i18n.localize("SR5.VehicleModRemoveFailed"))
      break
    //SR5 p. 50: the pool has run out (roll-test.js stops the test at one die) before the threshold
    case "unfinished":
      cardData.chatCard.buttons.actionEnd = end(game.i18n.localize("SR5.VehicleModUnfinished"))
      break
    default:
  }
}
