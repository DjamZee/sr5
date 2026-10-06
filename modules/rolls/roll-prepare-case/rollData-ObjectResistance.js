import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  radicalObjectReduction, drainReduction, reagentSystem
} from "../../system/reagents.js"

export default function objectResistance(rollData, chatData){
  //Determine title
  rollData.test.title = game.i18n.localize("SR5.ObjectResistanceTest")

  //Determine base dicepool
  rollData.dicePool.base = 3
  rollData.dicePool.value = 3

  //Radical reagents spent on the spell (Forbidden Arcana p. 181), shown to the GM who rolls this test
  const reduction = radicalReagentReduction(chatData)
  if (reduction > 0) rollData.dicePool.modifiers.push({
    type: "radicalReagent",
    label: game.i18n.localize("SR5.ReagentRadical"),
    value: -reduction,
  })

  //Add others informations
  rollData.test.type = "objectResistance"
  rollData.previousMessage.hits = chatData.roll.hits
  rollData.previousMessage.messageId = chatData.owner.messageId

  return rollData
}

// The drachms come from the spell card, which its author wrote: they count only when that author owns
// the caster, and never beyond what the caster's Magic allows, read again here from the actor
// The GM reads the casting card again by its id: it must be the caster's own spell card, its flags naming the
// same actor and the same spell. The GM can still change the value in the dialog. The drachms spent are not
// checked against a stock: the Magic cap holds (accepted limit, arbitrage de DjamZ, 2026-10-06)
export function radicalReagentReduction(chatData){
  const message = game.messages?.get(chatData?.owner?.messageId)
  const card = message?.flags?.sr5data
  if (!card) return 0
  if (card.owner?.actorId !== chatData.owner?.actorId || card.owner?.itemId !== chatData.owner?.itemId) return 0
  if (card.test?.type !== "spell" && card.test?.type !== "preparation") return 0
  const magicData = card.magic
  if (!magicData?.hasUsedReagents || magicData.reagentTier !== "radical") return 0
  const caster = SR5_EntityHelpers.getRealActorFromID(card.owner?.actorId)
  if (!caster) return 0
  const author = message.author
  if (!author || (!author.isGM && !caster.testUserPermission(author, "OWNER"))) return 0
  const magic = caster.system?.specialAttributes?.magic?.augmented?.value ?? 0
  const system = reagentSystem()
  const effective = magicData.reagentsEffective ?? magicData.reagentsSpent
  const drainUsed = drainReduction({
    system, tier: "radical", testKind: "spell", spent: effective, magic
  })
  return radicalObjectReduction({
    system, tier: "radical", effective, magic, drainReductionUsed: drainUsed
  })
}
