import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  pickpocketOutcome
} from "../roll-helpers/pickpocket-rules.js"

//SR5 p. 422: the thief's card, whispered to the GM. A critical glitch is caught red-handed (a ruling of DjamZ,
//2026-10-05); anything else goes to the target's Perception, which notices on a tie, even against no hit
export default async function pickpocketInfo(cardData){
  if (cardData.roll.criticalGlitchRoll) {
    cardData.chatCard.buttons.pickpocketCaught = SR5_RollMessage.generateChatButton("nonOpposedTest", "pickpocketCaught", game.i18n.localize("SR5.PickpocketCaught"), true)
    return
  }
  let label = game.i18n.localize("SR5.PickpocketPerceptionButton")
  if (cardData.roll.glitchRoll) label += ` (${game.i18n.localize("SR5.Glitch")})`
  cardData.chatCard.buttons.pickpocketPerception = SR5_RollMessage.generateChatButton("nonOpposedTest", "pickpocketPerception", label, true)
}

//The target's Perception card: the object moves on the GM's click, or the target hears of the thief
export async function pickpocketPerceptionInfo(cardData){
  const thiefCard = game.messages.get(cardData.previousMessage.messageId)?.flags?.sr5data
  const outcome = pickpocketOutcome({
    thiefHits: cardData.previousMessage.hits,
    perceptionHits: cardData.roll.hits,
    glitch: thiefCard?.roll?.glitchRoll,
  })
  cardData.roll.netHits = cardData.previousMessage.hits - cardData.roll.hits
  if (outcome === "noticed") {
    cardData.chatCard.buttons.pickpocketNoticed = SR5_RollMessage.generateChatButton("nonOpposedTest", "pickpocketNoticed", game.i18n.localize("SR5.PickpocketNoticed"), true)
  } else {
    cardData.chatCard.buttons.pickpocketTransfer = SR5_RollMessage.generateChatButton("nonOpposedTest", "pickpocketTransfer", game.i18n.format("SR5.PickpocketTransfer", {
      item: cardData.various.pickpocketItemName ?? ""
    }), true)
  }
}
