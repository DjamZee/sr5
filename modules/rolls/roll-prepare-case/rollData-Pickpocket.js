import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers
} from "../roll-helpers/miscellaneous.js"

//SR5 p. 422 (applied to a pocket, p. 135): Palming + Agility [Physical] against the target's Perception + Intuition
//`chatData` comes from the token HUD: {targetActorId, mode, itemId, aim}
export default async function pickpocket(rollData, actor, chatData){
  let skillModifiers = actor.system.skills.palming.test.modifiers

  //Determine title: what the thief says he is after, if anything
  rollData.test.title = game.i18n.localize(chatData?.mode === "plant" ? "SR5.PickpocketPlant" : "SR5.Pickpocket")
  //The card template escapes the title: escaping here too would print &amp; for &
  if (chatData?.aim) rollData.test.title += ` (${String(chatData.aim)})`

  //Determine dicepool composition: Palming and its linked attribute, Agility
  rollData.dicePool.composition = skillModifiers.filter(mod => (mod.type === "skillRating" || mod.type === "skillGroup" || mod.type === "linkedAttribute"))
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, skillModifiers)

  //Determine limit
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.limits.physicalLimit.value, actor.system.limits.physicalLimit.modifiers)
  rollData.limit.type = "physicalLimit"

  //The target is the token the HUD was opened on, not whatever the user had targeted
  rollData.target.hasTarget = true
  rollData.target.actorId = chatData?.targetActorId ?? null

  //SR5 p. 422 gives a Complex Action as the time it takes; a ruling of DjamZ (2026-10-05)
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "pickpocket"
  })

  rollData.test.type = "pickpocket"
  rollData.various.pickpocketMode = chatData?.mode === "plant" ? "plant" : "take"
  //Only when the world lets the thief choose on his own; otherwise the GM chooses
  rollData.various.pickpocketItemId = chatData?.itemId ?? null
  //Planting, the thief says how many of a pile; the GM's field starts from it
  if (rollData.various.pickpocketMode === "plant") rollData.various.pickpocketQuantity = chatData?.quantity ?? null

  return rollData
}
