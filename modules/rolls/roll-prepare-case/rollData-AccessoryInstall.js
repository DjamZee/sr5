import skill from "./rollData-Skill.js"
import {
  SR5
} from "../../config.js"
import {
  skillAttributeTitle
} from "../roll-helpers/skillAttribute.js"
import {
  toolsModifier
} from "../../system/vehicle-workshop.js"

//Installing a weapon accessory on the stock, the barrel or inside, or a modification (RG p. 67, lot 12). The options
//come from the weapon's Armurerie tab (item-workshop-apply.js): { hostUuid, hostName, accessoryUuid, accessoryName,
//threshold, interval, tools, availableTools }
export default async function accessoryInstall(rollData, actor, options){
  //RG p. 67, step 3: an extended Armorer + Logic [Mental] test, with the modifiers of the Building / Repair table
  //(SR5 p. 148)
  const actions = rollData.combat.actions
  rollData = await skill(rollData, "skillDicePool", "armorer", actor)
  //Minutes or hours of work, not an action of the combat turn
  rollData.combat.actions = actions

  //RG p. 67, step 2: a kit for the top, the sides and under the barrel, a workshop for the rest
  const tools = toolsModifier(options.tools, options.availableTools)
  if (tools.key){
    rollData.toolsAndParts = tools.key
    rollData.dicePool.modifiers.push({
      type: "toolsAndParts", label: `${game.i18n.localize(SR5.dicePoolModTypes.toolsAndParts)} (${game.i18n.localize(SR5.toolsAndParts[tools.key])})`, value: tools.value
    })
  }

  const titleBase = `${game.i18n.localize("SR5.ItemWorkshopInstall")}${game.i18n.localize("SR5.Colons")} ${options.accessoryName} (${options.hostName})`
  if (rollData.skillAttribute){
    rollData.skillAttribute.titleBase = titleBase
    rollData.test.title = skillAttributeTitle(rollData.skillAttribute, k => game.i18n.localize(k))
  } else rollData.test.title = titleBase
  rollData.test.type = "accessoryInstall"
  rollData.test.typeSub = "armorer"
  rollData.threshold.value = Math.max(1, Math.floor(Number(options.threshold) || 1))
  rollData.test.isExtended = true
  rollData.test.extended.interval = ["minute", "hour", "day"].includes(options.interval) ? options.interval : "hour"
  rollData.test.extended.multiplier = 1
  rollData.dialogSwitch.extended = true
  rollData.various.accessoryInstall = {
    hostUuid: options.hostUuid, hostName: options.hostName, accessoryUuid: options.accessoryUuid, accessoryName: options.accessoryName,
  }
  return rollData
}
