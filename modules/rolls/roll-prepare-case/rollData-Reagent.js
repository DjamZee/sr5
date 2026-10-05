import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  harvestZones, REFINE_FROM, REFINE_COST, REFINE_THRESHOLD, TIER_LABELS, tierStock
} from "../../system/reagents.js"

//Harvesting reagents, Alchemy + Magic [Mental] (SR5 p. 320), and refining them, Alchemy + Magic [Astral] (3)
//(Street Grimoire p. 211)
export default async function reagentWork(rollData, rollType, rollKey, actor){
  const refine = rollType === "reagentRefine"
  if (refine) {
    if (!REFINE_FROM[rollKey]) return
    if (tierStock(actor.system.magic, rollKey) < REFINE_COST) return void ui.notifications.warn(game.i18n.format("SR5.WARN_RefineNotEnough", {
      cost: REFINE_COST, tier: game.i18n.localize(TIER_LABELS[rollKey])
    }))
  }

  //Determine title
  rollData.test.title = refine ? game.i18n.localize(rollKey === "raw" ? "SR5.ReagentRefineRaw" : "SR5.ReagentRefineRefined") : game.i18n.localize("SR5.ReagentHarvest")

  //Determine dicepool composition: the Alchemy skill with Magic, its linked attribute
  const skill = actor.system.skills.alchemy
  rollData.dicePool.composition = SR5_PrepareRollHelper.getDicepoolComposition(skill.test.modifiers)
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, skill.test.modifiers)

  //Determine limit
  const limit = refine ? actor.system.limits.astralLimit : actor.system.limits.mentalLimit
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(limit.value, limit.modifiers)
  rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, limit.modifiers)
  rollData.limit.type = refine ? "astralLimit" : "mentalLimit"

  if (refine) {
    rollData.threshold.value = REFINE_THRESHOLD
    rollData.magic.reagentRefineFrom = rollKey
  } else rollData.magic.reagentHarvestZones = harvestZones()

  //Add others informations
  rollData.test.type = rollType
  rollData.test.typeSub = rollKey ?? ""
  rollData.dialogSwitch.penalty = true

  return rollData
}
