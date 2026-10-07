import skill from "./rollData-Skill.js"
import {
  SR5
} from "../../config.js"
import {
  skillAttributeTitle
} from "../roll-helpers/skillAttribute.js"
import {
  repairPlan
} from "../../system/vehicle-repair.js"

//Repairing a vehicle or a drone (Rigger 5.0 p. 33-34, p. 167). The options come from the repair window of the
//drone sheet (droneSheet.js): { mode, vehicleUuid, vehicleName, skillKey, boxes, missingParts, nanoRating, nanoAssist }
export default async function vehicleRepair(rollData, actor, options){
  if (options.mode === "nanomaintenance") return nanomaintenanceRepair(rollData, options)

  //R5 p. 34: an extended Mechanic (appropriate) + Logic [Mental] test, the skill test of the mechanic. The table of
  //Construction / Repair (SR5 p. 148) is offered by the dialog for every Mechanic skill (rollDialogPartial/modifiers.hbs)
  const actions = rollData.combat.actions
  rollData = await skill(rollData, "skillDicePool", options.skillKey, actor)
  //Hours of work, not an action of the combat turn
  rollData.combat.actions = actions

  const plan = repairPlan(options)
  if (plan.partsModifier) rollData.dicePool.modifiers.push({
    type: "missingParts", label: `${game.i18n.localize(SR5.dicePoolModTypes.missingParts)} (${plan.missingParts})`, value: plan.partsModifier
  })
  //R5 p. 167: the assisted repair adds the rating of the system
  if (plan.nanoModifier) rollData.dicePool.modifiers.push({
    type: "nanomaintenance", label: `${game.i18n.localize(SR5.dicePoolModTypes.nanomaintenance)} ${plan.nanoModifier}`, value: plan.nanoModifier
  })

  //The title keeps the attribute in use, Logic unless the player picks another one in the dialog (SR5 p. 130)
  const titleBase = `${game.i18n.localize("SR5.VehicleRepair")}${game.i18n.localize("SR5.Colons")} ${options.vehicleName} (${game.i18n.localize(SR5.skills[options.skillKey])})`
  if (rollData.skillAttribute){
    rollData.skillAttribute.titleBase = titleBase
    rollData.test.title = skillAttributeTitle(rollData.skillAttribute, k => game.i18n.localize(k))
  } else rollData.test.title = titleBase
  rollData.test.type = "vehicleRepair"
  rollData.test.typeSub = options.skillKey
  rollData.threshold.value = plan.threshold
  //R5 p. 34: 4 hours, one day when parts are missing
  rollData.test.isExtended = true
  rollData.test.extended.interval = plan.interval
  rollData.test.extended.multiplier = plan.multiplier
  rollData.dialogSwitch.extended = true
  rollData.various.vehicleRepair = {
    vehicleUuid: options.vehicleUuid, vehicleName: options.vehicleName, boxes: plan.threshold, missingParts: plan.missingParts
  }
  return rollData
}

//R5 p. 167, autonomous repair: dice equal to the rating of the system, each hit repairs a box, one hour. Rolled
//by the vehicle itself, neither extended nor limited
function nanomaintenanceRepair(rollData, options){
  rollData.test.title = `${game.i18n.localize("SR5.VehicleRepairNano")}${game.i18n.localize("SR5.Colons")} ${options.vehicleName} (${options.nanoRating})`
  rollData.dicePool.composition = [{
    source: game.i18n.localize("SR5.Nanomaintenance"), type: "rating", value: options.nanoRating
  }]
  rollData.dicePool.base = options.nanoRating
  rollData.test.type = "vehicleRepair"
  rollData.test.typeSub = "nanomaintenance"
  rollData.various.vehicleRepair = {
    vehicleUuid: options.vehicleUuid, vehicleName: options.vehicleName, boxes: options.boxes, missingParts: 0
  }
  return rollData
}
