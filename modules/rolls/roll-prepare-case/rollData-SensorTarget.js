import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import {
  signatureMaskingPenalty
} from "../../system/vehicle-mods.js"

export default function sensorTarget(rollData, actor){
  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.SensorTargeting")}`

  //Determine dicepool composition
  rollData.dicePool.composition = actor.system.skills.perception.test.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.skills.perception.test.modifiers)

  //Determine base limit
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.skills.perception.limit.value, actor.system.skills.perception.limit.modifiers)

  //Determine limit modififiers
  rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, actor.system.skills.perception.limit.modifiers)

  //A vehicle's signature masking: its rating against whoever locks on it (Rigger 5.0 p. 169)
  const masking = signatureMaskingPenalty(game.user.targets?.first()?.actor)
  if (masking) rollData.dicePool.modifiers.push({
    type: "signatureMasking", label: game.i18n.localize("SR5.VehicleModEffectKind_signatureMasking"), value: masking
  })

  //Add others informations
  rollData.test.type = "sensorTarget"

  //Handle Actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "simple", value: 1, source: "useActiveSensor"
  })

  return rollData
}