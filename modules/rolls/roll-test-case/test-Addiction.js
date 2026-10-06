import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  withdrawalOutcome
} from "../roll-helpers/addiction.js"

//Addiction test (SR5 p. 415-416): below the threshold, a button worsens the addiction by one level.
//Withdrawal test (SR5 p. 417): below the threshold the craving is told on the card (p. 79); the addiction stays
//as it is, worsening it is the addiction test's alone (p. 416)
export default async function addictionInfo(cardData){
  if (cardData.various?.withdrawal) {
    const outcome = withdrawalOutcome(cardData.roll.hits, cardData.threshold.value, cardData.various.addictionLevel, cardData.various.addictionType)
    const label = outcome.resisted ? game.i18n.localize("SR5.WithdrawalResisted") : game.i18n.format("SR5.WithdrawalCraving", {
      penalty: outcome.penalty, attributes: game.i18n.localize(`SR5.WithdrawalAttributes_${outcome.attributes}`)
    })
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", label)
    return
  }
  if (cardData.roll.hits < cardData.threshold.value) {
    cardData.chatCard.buttons.addictionWorsen = SR5_RollMessage.generateChatButton("nonOpposedTest", "addictionWorsen", game.i18n.localize("SR5.AddictionWorsen"))
  } else {
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.AddictionResisted"))
  }
}
