import {
  SR5_RollMessage
} from "../roll-message.js"

//Addiction test (SR5 p. 415-416): below the threshold, a button worsens the addiction by one level
export default async function addictionInfo(cardData){
  if (cardData.roll.hits < cardData.threshold.value) {
    cardData.chatCard.buttons.addictionWorsen = SR5_RollMessage.generateChatButton("nonOpposedTest", "addictionWorsen", game.i18n.localize("SR5.AddictionWorsen"))
  } else {
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.AddictionResisted"))
  }
}
