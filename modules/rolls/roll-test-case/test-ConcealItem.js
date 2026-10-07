import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5Conceal
} from "../../interface/conceal.js"

//SR5 p. 422: the object keeps the hits of the one who hid it, until it is taken out (arbitrage de DjamZ, 2026-10-07).
//Written by whoever rolls, on an object of her own actor; a critical glitch hides nothing
export default async function concealItemInfo(cardData){
  const actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId, cardData.actorUuids)
  const item = actor?.items.get(cardData.various.concealItemId)
  cardData.various.concealHidden = await SR5Conceal.hide(item, cardData.roll)
  if (!cardData.various.concealHidden) return
  cardData.chatCard.buttons.concealTakeOut = SR5_RollMessage.generateChatButton("nonOpposedTest", "concealTakeOut", game.i18n.format("SR5.ConcealTakeOut", {
    item: cardData.various.concealItemName
  }), false)
}
