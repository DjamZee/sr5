import {
  SR5_RollMessage 
} from "../roll-message.js"

export default async function vehicleTestInfo(cardData, _actorId){
  //A chase action (R12): the target opposes it, or the gamemaster applies it to the chase
  if (cardData.chase) {
    const {
      chaseCardButtons
    } = await import("../../system/chase-roll.js")
    return chaseCardButtons(cardData)
  }

  if (cardData.test.typeSub !== ""){
    if (cardData.roll.hits >= cardData.threshold.value){
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.VehicleTestControlled"))
    } else {
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.VehicleTestUncontrolled"))
    }
  }

  if (cardData.previousMessage.messageId) {
    SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "vehicleTest")
  }
}