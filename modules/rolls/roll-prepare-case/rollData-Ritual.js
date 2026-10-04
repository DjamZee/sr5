import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"

export default function ritual(rollData, actor, item, chatData){
  if (!(actor.system.magic.reagents > 0)) return void ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NoReagents")}`)
  let itemData = item.system

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.PerformRitual")} ${item.name}`

  //Determine base dicepool & composition
  if (itemData.spellLinkedType !== ""){
    rollData.dicePool.composition = actor.system.skills.ritualSpellcasting.spellCategory[itemData.spellLinkedType].modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
    rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
    rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.skills.ritualSpellcasting.spellCategory[itemData.spellLinkedType].modifiers)
  } else {
    rollData.dicePool.composition = actor.system.skills.ritualSpellcasting.test.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))
    rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
    rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.skills.ritualSpellcasting.test.modifiers)
  }

  //Limit
  rollData.limit.type = "force"
  rollData.limit.base = actor.system.specialAttributes.magic.augmented.value

  //Background count limit modifier
  if (actor.system.magic.bgCount.value > 0){
    rollData = SR5_PrepareRollHelper.addBackgroundCountLimitModifiers(rollData, actor)
  }

  //Handle Actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "performRitual"
  })

  //Add others informations
  rollData.test.type = "ritual"
  rollData.magic.force = 1
  rollData.dialogSwitch.reagents = true
  rollData.dialogSwitch.specialization = true
  rollData.owner.itemUuid = item.uuid

  //SR5 p. 299 and p. 51: the participants' teamwork test, rolled on the circle card at the Force chosen there
  const circle = chatData?.ritualCircle
  if (circle) {
    rollData.magic.force = circle.force
    rollData.limit.base = circle.force
    if (circle.bonus.dice > 0) rollData.dicePool.modifiers.push({
      type: "ritualTeamwork", label: game.i18n.localize("SR5.RitualTeamwork"), value: circle.bonus.dice
    })
    if (circle.bonus.limit > 0) rollData.limit.modifiers.ritualTeamwork = {
      value: circle.bonus.limit, label: game.i18n.localize("SR5.RitualTeamwork")
    }
    rollData.magic.ritualParticipants = circle.participants
  }

  return rollData
}