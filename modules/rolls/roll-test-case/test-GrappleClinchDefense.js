import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  clinchTakesHold
} from "../roll-helpers/grapple-rules.js"

//Run & Gun p. 133 (Saisie): the clinch holds on the attacker's net hits, which become the hold
export default async function grappleClinchDefenseInfo(cardData){
  cardData.roll.netHits = cardData.previousMessage.hits - cardData.roll.hits
  if (clinchTakesHold(cardData.roll.netHits)) {
    cardData.chatCard.buttons.grappleClinchApply = SR5_RollMessage.generateChatButton("nonOpposedTest", "grappleClinchApply", game.i18n.format("SR5.GrappleApplyClinch", {
      hold: cardData.roll.netHits
    }))
  } else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.SuccessfulDefense"))
}
