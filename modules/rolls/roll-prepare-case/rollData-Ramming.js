import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import {
  SR5_ConverterHelpers
} from "../roll-helpers/converter.js"
import {
  SR5
} from "../../config.js"

export default function ramming(rollData, actor){
  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.RammingWith")} ${actor.name}`

  //Determine dicepool composition
  rollData.dicePool.composition = actor.system.rammingTest.test.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup" || mod.type === "manual"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.rammingTest.test.modifiers.filter(mod => (mod.type !== "manual")))

  //Determine base limit
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.rammingTest.limit.value, actor.system.rammingTest.limit.modifiers)

  //Determine limit modififiers
  rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, actor.system.rammingTest.limit.modifiers)
  rollData.limit.type = "handling"

  //Add others informations
  rollData.test.type = "ramming"
  //Rigger 5 p. 179: damage from the initiator's Structure and the speed of the impact, side impact by default
  let target = game.user.targets.first()?.actor
  rollData.combat.ramming.attackerSpeed = actor.system.attributes.speed?.augmented.value || 0
  rollData.combat.ramming.targetSpeed = (target?.type === "actorDrone") ? (target.system.attributes.speed?.augmented.value || 0) : 0
  rollData.damage.base = SR5_ConverterHelpers.collisionDamage(actor.system.attributes.body.augmented.value, SR5_ConverterHelpers.rammingSpeed(rollData.combat.ramming.angle, rollData.combat.ramming.attackerSpeed, rollData.combat.ramming.targetSpeed))
  rollData.damage.value = rollData.damage.base
  rollData.lists.rammingAngles = SR5.rammingAngles
  rollData.damage.type = "physical"
  rollData.combat.armorPenetration = -6
  rollData.combat.activeDefenses.full = actor.system.specialProperties.fullDefenseValue || 0
  rollData.combat.activeDefenses.dodge = actor.system.skills?.gymnastics?.rating.value || 0

  //Handle Actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "ramming"
  })

  return rollData
}