import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  grappleEscapeOutcome, GRAPPLE_ESCAPE_LABELS
} from "../roll-helpers/grappleEscape.js"
import {
  SR5_GrappleHelpers
} from "../roll-helpers/grapple.js"
import {
  holdAfterReversal
} from "../roll-helpers/grapple-rules.js"

export default async function grappleEscapeInfo(cardData, actorId){
  let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
  let hasCounterGrapple = actor?.system.itemsProperties?.martialArts?.counterGrapple?.isActive ?? false
  let outcome = grappleEscapeOutcome(cardData.roll.hits, cardData.threshold.value, hasCounterGrapple)

  //Grappling rules: a successful escape ends the hold for both fighters. With Contre-prise it counts as a
  //successful reversal (Run & Gun p. 148-149): the roles are swapped, the hits above the threshold as the new hold.
  if (game.settings.get("sr5", "sr5GrapplingRules")) {
    if (outcome === "success") await SR5_GrappleHelpers.releaseHold(actorId)
    else if (outcome === "counterGrapple") await SR5_GrappleHelpers.reverseHold(actorId, holdAfterReversal(cardData.roll.hits - cardData.threshold.value))
  }

  cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize(GRAPPLE_ESCAPE_LABELS[outcome]))
}
