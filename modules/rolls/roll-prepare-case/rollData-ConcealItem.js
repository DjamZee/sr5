import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers
} from "../roll-helpers/miscellaneous.js"

//SR5 p. 422, hiding an object on oneself: Palming + Agility [Physical]. `chatData` comes from the sheet: {itemId}
export default async function concealItem(rollData, actor, chatData){
  const skillModifiers = actor.system.skills.palming.test.modifiers
  const item = actor.items.get(chatData?.itemId)

  rollData.test.title = `${game.i18n.localize("SR5.ConcealItem")} (${item?.name ?? ""})`

  //Determine dicepool composition: Palming and its linked attribute, Agility
  rollData.dicePool.composition = skillModifiers.filter(mod => (mod.type === "skillRating" || mod.type === "skillGroup" || mod.type === "linkedAttribute"))
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, skillModifiers)

  //Determine limit
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.limits.physicalLimit.value, actor.system.limits.physicalLimit.modifiers)
  rollData.limit.type = "physicalLimit"

  //SR5 p. 422: "un minimum de temps pour ce faire (comme une action complexe)"
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "concealItem"
  })

  rollData.test.type = "concealItem"
  rollData.various.concealItemId = item?.id ?? null
  rollData.various.concealItemName = item?.name ?? ""

  return rollData
}
