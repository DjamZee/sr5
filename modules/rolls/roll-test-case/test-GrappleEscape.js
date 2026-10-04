import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  grappleEscapeOutcome, GRAPPLE_ESCAPE_LABELS
} from "../roll-helpers/grappleEscape.js"

export default async function grappleEscapeInfo(cardData, actorId){
  let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
  let hasCounterGrapple = actor?.system.itemsProperties?.martialArts?.counterGrapple?.isActive ?? false
  let outcome = grappleEscapeOutcome(cardData.roll.hits, cardData.threshold.value, hasCounterGrapple)

  cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize(GRAPPLE_ESCAPE_LABELS[outcome]))
}
