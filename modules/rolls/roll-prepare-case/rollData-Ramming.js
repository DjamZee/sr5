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
  //Rigger 5 p. 179 against a vehicle (Speed, angle, locomotion p. 184), SR5 p. 203-204 against anything else (m/turn), side impact by default
  let target = game.user.targets.first()?.actor,
    ramming = rollData.combat.ramming
  ramming.targetIsVehicle = target?.type === "actorDrone"
  ramming.attackerSpeed = vehicleSpeed(actor)
  ramming.attackerLocomotion = SR5_ConverterHelpers.rammingLocomotion(locomotionData(actor))
  ramming.targetSpeed = ramming.targetIsVehicle ? vehicleSpeed(target) : 0
  ramming.targetLocomotion = ramming.targetIsVehicle ? SR5_ConverterHelpers.rammingLocomotion(locomotionData(target)) : "ground"
  SR5_ConverterHelpers.rammingRefreshRelativeSpeed(ramming)
  rollData.damage.base = SR5_ConverterHelpers.rammingAttackDamage(ramming, actor.system.attributes.body.augmented.value)
  rollData.damage.value = rollData.damage.base
  rollData.lists.rammingAngles = SR5.rammingAngles
  rollData.lists.rammingLocomotions = SR5.rammingLocomotions
  rollData.lists.rammingGaits = SR5.rammingGaits
  rollData.damage.type = "physical"
  rollData.combat.armorPenetration = -6
  rollData.combat.activeDefenses.full = actor.system.specialProperties.fullDefenseValue || 0
  rollData.combat.activeDefenses.dodge = SR5_PrepareRollHelper.getActiveDefenseValue(actor.system, "dodge", "gymnastics")
  // SR5 p. 191-192: dodge adds a skill, so the Physical limit applies
  rollData.combat.activeDefenses.limit = actor.system.limits?.physicalLimit?.value || 0

  //Handle Actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "ramming"
  })

  return rollData
}

//Current Speed of a vehicle, from its secondary propulsion when it is active
export function vehicleSpeed(vehicle){
  let attributes = vehicle.system.attributes
  if (vehicle.system.isSecondaryPropulsionActivate) return attributes.secondaryPropulsionSpeed?.augmented.value || 0
  return attributes.speed?.augmented.value || 0
}

//What tells a vehicle's locomotion, from its original item on the actor that created it
export function locomotionData(vehicle){
  return SR5_ConverterHelpers.rammingLocomotionData(vehicle.system, (actorId, itemId) => game.actors.get(actorId)?.items.get(itemId))
}