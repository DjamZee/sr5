import {
  SR5_RollMessage
} from "../roll-message.js"

//Deus vult ! / Mon pays (Manuel de l'assassin p. 14-15): the threshold is met or it is not; the GM's card follows
export default async function woundResolveInfo(cardData){
  const held = (Number(cardData.roll.hits) || 0) >= (Number(cardData.threshold.value) || 0)
  cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize(held ? "SR5.WoundResolveHeldShort" : "SR5.WoundResolveBrokenShort"))
}
