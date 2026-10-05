import {
  SR5
} from "../../config.js"
import {
  drawbackAttributes
} from "../../entities/items/mentor-spirits.js"

//Resisting the disadvantage of a mentor spirit (SR5 p. 325): Charisma + Willpower against the threshold set on the item
export default function mentorDrawback(rollData, actor, item){
  if (item?.type !== "itemMentorSpirit") return
  const threshold = parseInt(item.system.resistThreshold) || 0

  rollData.test.title = `${game.i18n.localize("SR5.MentorResistDrawback")}${game.i18n.localize("SR5.Colons")} ${item.name} (${game.i18n.localize("SR5.Threshold")} ${threshold})`

  //Determine dicepool composition
  //The two attributes set on the mentor, Charisma + Willpower unless the book says otherwise
  rollData.dicePool.composition = drawbackAttributes(item.system.resistAttributes).map(key => ({
    source: game.i18n.localize(SR5.allAttributes[key] ?? key), type: "linkedAttribute", value: actor.system.attributes[key]?.augmented.value ?? 0
  }))
  rollData.dicePool.base = rollData.dicePool.composition.reduce((sum, m) => sum + (m.value || 0), 0)

  rollData.threshold.value = threshold
  rollData.dialogSwitch.penalty = true
  rollData.test.type = "mentorDrawback"

  return rollData
}
