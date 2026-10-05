import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  reagentWorkChanges, TIER_LABELS
} from "../../system/reagents.js"

//Harvesting and refining reagents: the card says what the stocks become, its button applies it.
//Second Chance rewrites the card before the button is clicked, so the stocks change once
export default async function reagentWorkInfo(cardData){
  const changes = reagentWorkChanges({
    type: cardData.test.type,
    hits: cardData.roll.hits,
    criticalGlitch: cardData.roll.criticalGlitchRoll,
    zone: cardData.magic.reagentHarvestZone,
    from: cardData.magic.reagentRefineFrom,
  })
  cardData.magic.reagentWorkChanges = changes

  const parts = Object.entries(changes).map(([tier, delta]) => `${delta > 0 ? "+" : ""}${delta} ${game.i18n.localize(TIER_LABELS[tier])}`)
  delete cardData.chatCard.buttons.applyReagents
  delete cardData.chatCard.buttons.actionEnd
  if (parts.length) cardData.chatCard.buttons.applyReagents = SR5_RollMessage.generateChatButton("nonOpposedTest", "applyReagents", `${game.i18n.localize("SR5.ReagentApply")} (${parts.join(", ")})`)
  else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.ReagentNothing"))
}
