import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  withdrawalModifier, isDrugAddiction
} from "../roll-helpers/addiction.js"

//Addiction test (SR5 p. 415): rollKey "<pool>_<index of the addiction>", pool being physiological or psychological.
//"<pool>_<index>_withdrawal" is the withdrawal test (SR5 p. 417): the same pool and threshold, the modifier of the
//level of addiction, and a failure brings the craving (p. 79), never a worse addiction
export default async function addictionTest(rollData, rollKey, actor){
  let [pool, index, kind] = (rollKey || "").split("_")
  let addiction = actor.system.addictions?.[parseInt(index)]
  let resistance = actor.system.resistances?.addiction?.[pool]
  if (!addiction || !resistance) return
  let threshold = parseInt(addiction.addiction?.threshold) || 0
  let withdrawal = kind === "withdrawal"

  rollData.test.title = `${game.i18n.localize(withdrawal ? "SR5.WithdrawalTest" : "SR5.AddictionTest")} : ${addiction.name} (${threshold})`
  rollData.dicePool.composition = resistance.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
  //Drug Tolerance (Chrome Flesh p. 58): its dice count for the addiction tests of natural and synthetic drugs, not
  //for a focus nor blood magic, and not when the character tries to get rid of an addiction he already has
  let modifiers = resistance.modifiers
  const drugNames = (actor.items ?? []).filter(i => i.type === "itemDrug").map(i => i.name)
  if (!withdrawal && !addiction.level && isDrugAddiction(addiction, drugNames)) {
    modifiers = modifiers.concat(actor.system.specialProperties?.drugAddictionResistance?.modifiers ?? [])
  }
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, modifiers)
  if (withdrawal){
    let value = withdrawalModifier(addiction.level, game.settings.get("sr5", "sr5WithdrawalModifier"))
    if (value) rollData.dicePool.modifiers.push({
      type: "withdrawalLevel",
      label: game.i18n.localize("SR5.WithdrawalLevelModifier"),
      value,
    })
  }
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  rollData.threshold.value = threshold
  rollData.test.type = "addictionTest"
  rollData.test.typeSub = pool
  rollData.various.addictionIndex = parseInt(index)
  rollData.various.addictionName = addiction.name
  rollData.various.addictionType = addiction.addiction?.type
  rollData.various.withdrawal = withdrawal
  rollData.various.addictionLevel = addiction.level || ""

  return rollData
}
