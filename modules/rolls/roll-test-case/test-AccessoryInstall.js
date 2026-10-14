import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  installOutcome
} from "../../system/vehicle-workshop.js"

//Installing a weapon accessory (RG p. 67): it works once the threshold is reached. RG names no loss of parts on a
//critical glitch: the attempt fails, the gamemaster says what follows
export default async function accessoryInstallInfo(cardData){
  const install = cardData.various?.accessoryInstall
  if (!install) return
  const end = label => SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", label)
  const outcome = installOutcome({
    hits: cardData.roll.hits, threshold: cardData.threshold.value, criticalGlitch: !!cardData.roll.criticalGlitchRoll,
    stillExtended: !!cardData.test.isExtended, removal: true,
  })
  switch (outcome){
    case "done":
      cardData.test.isExtended = false
      cardData.chatCard.buttons.installAccessory = SR5_RollMessage.generateChatButton("nonOpposedTest", "installAccessory", game.i18n.format("SR5.ItemWorkshopInstallButton", {
        name: install.accessoryName, weapon: install.hostName
      }))
      break
    case "failed":
      cardData.chatCard.buttons.actionEnd = end(game.i18n.localize("SR5.ItemWorkshopInstallFailed"))
      break
    case "unfinished":
      cardData.chatCard.buttons.actionEnd = end(game.i18n.localize("SR5.VehicleModUnfinished"))
      break
    default:
  }
}
