import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"

//Addiction test (SR5 p. 415): rollKey "<pool>_<index of the addiction>", pool being physiological or psychological
export default async function addictionTest(rollData, rollKey, actor){
  let [pool, index] = (rollKey || "").split("_")
  let addiction = actor.system.addictions?.[parseInt(index)]
  let resistance = actor.system.resistances?.addiction?.[pool]
  if (!addiction || !resistance) return
  let threshold = parseInt(addiction.addiction?.threshold) || 0

  rollData.test.title = `${game.i18n.localize("SR5.AddictionTest")} : ${addiction.name} (${threshold})`
  rollData.dicePool.composition = resistance.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, resistance.modifiers)
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  rollData.threshold.value = threshold
  rollData.test.type = "addictionTest"
  rollData.test.typeSub = pool
  rollData.various.addictionIndex = parseInt(index)
  rollData.various.addictionName = addiction.name
  rollData.various.addictionType = addiction.addiction?.type

  return rollData
}
