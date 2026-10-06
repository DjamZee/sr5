import {
  SR5_PrepareRollHelper
} from "../roll-prepare-helpers.js"
import {
  SR5
} from "../../config.js"
import {
  prepareSkillAttribute, SKILL_ATTRIBUTE_FLAG, skillAttributeFlagKey
} from "../roll-helpers/skillAttribute.js"

//Add info for Knowledge / language skill roll
export default function knowledgeSkill(rollData, rollType, item){
  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.SkillTest") + game.i18n.localize("SR5.Colons") + " " + item.name}`

  //Determine dicepool composition
  rollData.dicePool.composition = item.system.test.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, item.system.test.modifiers)

  //SR5 p. 130: a knowledge skill is linked to Logic or Intuition, and its attribute can be changed in the dialog
  if (rollType === "knowledgeSkill" && item.actor){
    let flagKey = skillAttributeFlagKey(rollType, null, item)
    rollData = prepareSkillAttribute(rollData, item.actor.system, item.actor.getFlag?.("sr5", SKILL_ATTRIBUTE_FLAG)?.[flagKey], {
      flagKey,
      linked: item.system.linkedAttribute,
      titleBase: rollData.test.title,
      alwaysInTitle: false,
      labels: SR5.allAttributes,
      localize: k => game.i18n.localize(k),
    })
  }

  //Add others informations
  rollData.dialogSwitch.specialization = true
  rollData.test.type = rollType

  return rollData
}
