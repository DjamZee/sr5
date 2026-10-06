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
  grappleHoldOf, counterGrappleHold
} from "../roll-helpers/grapple-rules.js"

export default async function grappleEscapeInfo(cardData, actorId){
  let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
  let hasCounterGrapple = actor?.system.itemsProperties?.martialArts?.counterGrapple?.isActive ?? false
  let outcome = grappleEscapeOutcome(cardData.roll.hits, cardData.threshold.value, hasCounterGrapple)

  if (game.settings.get("sr5", "sr5GrapplingRules")) {
    //Grappling rules: a successful escape ends the hold for both fighters
    //A player's card is the request: the active GM reads it again once posted (grapple.js, onEscapeCard)
    if (outcome === "success") {
      if (game.user.isGM) await SR5_GrappleHelpers.releaseHold(actorId)
      else cardData.various.grappleEscaped = true
    }
    //Run & Gun p. 148-149: with Contre-prise, the escape MAY count as a reversal (« peut la traiter »). The card offers
    //both, and the reversal card comes only once chosen. The new hold reads the stored hold, not the typed threshold.
    else if (outcome === "counterGrapple") {
      const current = grappleHoldOf(actor?.effects)
      if (current?.role === "held") {
        const newHold = counterGrappleHold(cardData.roll.hits, current.hold)
        cardData.various.grappleHoldId = current.holdId
        cardData.various.grappleNewHold = newHold
        cardData.chatCard.buttons.grappleEscapeFree = SR5_RollMessage.generateChatButton("nonOpposedTest", "grappleEscapeFree", game.i18n.localize("SR5.GrappleEscapeFree"))
        cardData.chatCard.buttons.grappleCounterGrapple = SR5_RollMessage.generateChatButton("nonOpposedTest", "grappleCounterGrapple", game.i18n.format("SR5.GrappleCounterGrappleApply", {
          hold: newHold
        }))
        return
      }
    }
  }

  cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize(GRAPPLE_ESCAPE_LABELS[outcome]))
}
