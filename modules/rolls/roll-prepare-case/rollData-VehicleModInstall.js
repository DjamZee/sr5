import skill from "./rollData-Skill.js"
import {
  SR5
} from "../../config.js"
import {
  skillAttributeTitle
} from "../roll-helpers/skillAttribute.js"
import {
  installPlan, toolsModifier
} from "../../system/vehicle-workshop.js"

//Installing or removing a vehicle mod (Rigger 5.0 p. 153-154). The options come from the workshop of the drone
//sheet (vehicle-workshop-apply.js): { vehicleUuid, vehicleName, modUuid, modName, threshold, tools, availableTools,
//skillKey, removal, specialSkill }
export default async function vehicleModInstall(rollData, actor, options){
  //R5 p. 153: an extended (Mechanic) + Logic [Logic] test, with the modifiers of the Building / Repair table (SR5 p. 148)
  const actions = rollData.combat.actions
  rollData = await skill(rollData, "skillDicePool", options.skillKey, actor)
  //Hours of work, not an action of the combat turn
  rollData.combat.actions = actions
  rollData.limit.base = actor.system.attributes.logic.augmented.value
  rollData.limit.modifiers = {
  }
  rollData.limit.type = "logic"

  //R5 p. 153: below the tools the mod asks for, Inadequate; without any, Unavailable. The dialog's list starts on it
  const tools = toolsModifier(options.tools, options.availableTools)
  if (tools.key){
    rollData.toolsAndParts = tools.key
    rollData.dicePool.modifiers.push({
      type: "toolsAndParts", label: `${game.i18n.localize(SR5.dicePoolModTypes.toolsAndParts)} (${game.i18n.localize(SR5.toolsAndParts[tools.key])})`, value: tools.value
    })
  }

  const plan = installPlan(options)
  const titleBase = `${game.i18n.localize(options.removal ? "SR5.VehicleModRemove" : "SR5.VehicleModInstall")}${game.i18n.localize("SR5.Colons")} ${options.modName} (${options.vehicleName})`
  if (rollData.skillAttribute){
    rollData.skillAttribute.titleBase = titleBase
    rollData.test.title = skillAttributeTitle(rollData.skillAttribute, k => game.i18n.localize(k))
  } else rollData.test.title = titleBase
  rollData.test.type = "vehicleModInstall"
  rollData.test.typeSub = options.skillKey
  rollData.threshold.value = plan.threshold
  rollData.test.isExtended = true
  rollData.test.extended.interval = plan.interval
  rollData.test.extended.multiplier = plan.multiplier
  rollData.dialogSwitch.extended = true
  rollData.various.vehicleModInstall = {
    vehicleUuid: options.vehicleUuid, vehicleName: options.vehicleName, modUuid: options.modUuid, modName: options.modName,
    removal: options.removal === true, specialSkill: options.specialSkill || "",
  }
  return rollData
}
