import {
  usesModPoints, droneModRule, armorOverload, droneCannotMove
} from "../../system/drone-mod-points.js"
import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5 
} from "../../config.js"
import {
  hasLocalAutosoftRunning, rccAutosoftsForDrone, autosoftFitsDrone
} from "./rcc.js"
import {
  VR_PILOTING_LIMIT_BONUS, controlRigThresholdModifier, dataProcessingCapModifier
} from "../../system/rigging-rules.js"
import {
  modTakesSlots
} from "../../system/vehicle-factory.js"
import {
  replacedVehicleAttribute, armorCapReduction, addedArmor, tactileSensorsOn, TACTILE_PERCEPTION_DICE, TACTILE_HANDLING, metahumanAdaptationPenalty
} from "../../system/vehicle-mods.js"
import {
  speedDemonBonus
} from "../../system/rigger-qualities.js"

// Rigging: vehicle skills and tests, modifications, slots, controlled vehicles and autosofts.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
// SR5_CharacterUtility itself, given by utilityActor.js (importing it here would make an import cycle)
let SR5_CharacterUtility
export function linkRiggingUtility(characterUtility) {
  SR5_CharacterUtility = characterUtility
}

export class SR5_CharacterRiggingUtility {

  // Vehicle Skills Calculations
  static generateVehicleSkills(actor) {
    let actorData = actor.system, skills = actorData.skills, attributes = actorData.attributes, handlingMode = attributes.handling.augmented.value, handlingName = game.i18n.localize('SR5.VehicleStat_HandlingShort')
    let controlerData, controlerName
    if (actorData.vehicleOwner.id) {
      controlerData = actorData.vehicleOwner.system
      controlerName = actorData.vehicleOwner.name
    }

    if (actorData.offRoadMode) {
      if (actorData.isSecondaryPropulsionActivate) {
        handlingMode = attributes.secondaryPropulsionHandlingOffRoad.augmented.value
        handlingName = game.i18n.localize('SR5.VehicleStat_SPHandlingORShort')
      } else {
        handlingMode = attributes.handlingOffRoad.augmented.value
        handlingName = game.i18n.localize('SR5.VehicleStat_HandlingORShort')
      }
    }

    skills.sneaking.rating.base = 0
    skills.sneaking.limit.base = 0
    skills.perception.rating.base = 0
    skills.perception.limit.base = 0

    switch (actorData.controlMode) {
      case "autopilot":
        SR5_EntityHelpers.updateModifier(skills.sneaking.rating, game.i18n.localize('SR5.VehicleStat_PilotShort'), "linkedAttribute", attributes.pilot.augmented.value)
        SR5_EntityHelpers.updateModifier(skills.sneaking.limit, handlingName, "linkedAttribute", handlingMode)
        SR5_EntityHelpers.updateModifier(skills.perception.rating, game.i18n.localize('SR5.VehicleStat_PilotShort'), "linkedAttribute", attributes.pilot.augmented.value)
        SR5_EntityHelpers.updateModifier(skills.perception.limit, game.i18n.localize('SR5.VehicleStat_SensorShort'), "linkedAttribute", attributes.sensor.augmented.value)
        break
      case "remote":
        SR5_EntityHelpers.updateModifier(skills.perception.test, game.i18n.localize('SR5.ControlMode'), actorData.controlMode, controlerData.skills.perception.test.dicePool)
        SR5_EntityHelpers.updateModifier(skills.perception.limit, game.i18n.localize('SR5.VehicleStat_SensorShort'), "linkedAttribute", attributes.sensor.augmented.value)
        if (controlerData.matrix.attributes.dataProcessing.value < attributes.sensor.augmented.value) {
          let mod = controlerData.matrix.attributes.dataProcessing.value - attributes.sensor.augmented.value
          SR5_EntityHelpers.updateModifier(skills.perception.limit, game.i18n.localize('SR5.DataProcessingLimit'), actorData.controlMode, mod)
        }
        //Through a controlled device: the skill and the attribute normally used, Sneaking + Agility (SR5 p. 239, arbitrage de DjamZ du 07/10)
        SR5_EntityHelpers.updateModifier(skills.sneaking.test, `${game.i18n.localize('SR5.Controler')} (${game.i18n.localize('SR5.SkillSneaking')})`, actorData.controlMode, controlerData.skills.sneaking.rating.value)
        SR5_EntityHelpers.updateModifier(skills.sneaking.test, `${game.i18n.localize('SR5.Controler')} (${game.i18n.localize('SR5.Agility')})`, actorData.controlMode, controlerData.attributes.agility.augmented.value)
        SR5_EntityHelpers.updateModifier(skills.sneaking.limit, handlingName, "linkedAttribute", handlingMode)
        if (controlerData.matrix.attributes.dataProcessing.value < handlingMode) {
          let mod = controlerData.matrix.attributes.dataProcessing.value - handlingMode
          SR5_EntityHelpers.updateModifier(skills.sneaking.limit, game.i18n.localize('SR5.DataProcessingLimit'), actorData.controlMode, mod)
        }
        break
      case "manual":
        SR5_EntityHelpers.updateModifier(skills.perception.test, `${game.i18n.localize('SR5.Controler')}${game.i18n.localize('SR5.Colons')} ${controlerName}`, actorData.controlMode, controlerData.skills.perception.test.dicePool)
        SR5_EntityHelpers.updateModifier(skills.perception.limit, game.i18n.localize('SR5.VehicleStat_SensorShort'), "linkedAttribute", attributes.sensor.augmented.value)
        //Driving by hand: the driver's Sneaking + Reaction [Handling] (Rigger 5.0 p. 180); no book text caps it at the piloting skill
        SR5_EntityHelpers.updateModifier(skills.sneaking.test, `${game.i18n.localize('SR5.Controler')} (${game.i18n.localize('SR5.SkillSneaking')})`, actorData.controlMode, controlerData.skills.sneaking.rating.value)
        SR5_EntityHelpers.updateModifier(skills.sneaking.test, `${game.i18n.localize('SR5.Controler')} (${game.i18n.localize('SR5.Reaction')})`, actorData.controlMode, controlerData.attributes.reaction.augmented.value)
        this.applyMetahumanAdaptation(actor, skills.sneaking.test)
        SR5_EntityHelpers.updateModifier(skills.sneaking.limit, handlingName, "linkedAttribute", handlingMode)
        break
      case "rigging":
        //Jumped in, the control rig raises the Handling-based limit; its dice go to piloting skill tests only, not to Perception or Sneaking (SR5 p. 268, 455)
        if (controlerData.specialProperties.controlRig.value) SR5_EntityHelpers.updateModifier(skills.sneaking.limit, game.i18n.localize('SR5.ControlRig'), "augmentations", controlerData.specialProperties.controlRig.value)
        SR5_EntityHelpers.updateModifier(skills.perception.test, game.i18n.localize('SR5.Controler'), actorData.controlMode, controlerData.skills.perception.test.dicePool)
        SR5_EntityHelpers.updateModifier(skills.perception.limit, game.i18n.localize('SR5.VehicleStat_SensorShort'), "linkedAttribute", attributes.sensor.augmented.value)
        //Jumped in, the limits based on Sensor and Handling gain the control rig rating (SR5 p. 268 and errata)
        if (controlerData.specialProperties.controlRig.value) SR5_EntityHelpers.updateModifier(skills.perception.limit, game.i18n.localize('SR5.ControlRig'), "augmentations", controlerData.specialProperties.controlRig.value)
        //Jumped in: Sneaking + Intuition [Handling] (SR5 p. 272)
        SR5_EntityHelpers.updateModifier(skills.sneaking.test, `${game.i18n.localize('SR5.Controler')} (${game.i18n.localize('SR5.SkillSneaking')})`, actorData.controlMode, controlerData.skills.sneaking.rating.value)
        SR5_EntityHelpers.updateModifier(skills.sneaking.test, `${game.i18n.localize('SR5.Controler')} (${game.i18n.localize('SR5.Intuition')})`, actorData.controlMode, controlerData.attributes.intuition.augmented.value)
        SR5_EntityHelpers.updateModifier(skills.sneaking.limit, handlingName, "linkedAttribute", handlingMode)
        if (controlerData.matrix.userMode === "hotsim") {
          SR5_EntityHelpers.updateModifier(skills.perception.test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 1)
          SR5_EntityHelpers.updateModifier(skills.sneaking.test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 1)
        }
        //Tactile sensors: +2 dice to Perception and Sensor tests (Rigger 5.0 p. 170)
        if (tactileSensorsOn(actor.items, actorData.controlMode)) SR5_EntityHelpers.updateModifier(skills.perception.test, game.i18n.localize('SR5.VehicleModEffectKind_tactileSensors'), "itemVehicleMod", TACTILE_PERCEPTION_DICE)
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown controle mode '${actorData.controlMode}' in 'generateVehicleSkills()'`)
    }

    //Update Values
    SR5_EntityHelpers.updateValue(skills.sneaking.rating, 0)
    SR5_EntityHelpers.updateValue(skills.perception.rating, 0)
    //Update DicePools
    skills.sneaking.test.base = 0
    skills.sneaking.test.modifiers = skills.sneaking.test.modifiers.concat(SR5_EntityHelpers.ratingModifiersForTest(skills.sneaking.rating))
    skills.perception.test.base = 0
    skills.perception.test.modifiers = skills.perception.test.modifiers.concat(SR5_EntityHelpers.ratingModifiersForTest(skills.perception.rating))
    //Special for autopilot drone
    if (actorData.controlMode === "autopilot") {
      skills.sneaking.test.modifiers = skills.sneaking.test.modifiers.concat(actor.system.penalties.special.actual.modifiers)
      skills.perception.test.modifiers = skills.perception.test.modifiers.concat(actor.system.penalties.special.actual.modifiers)
    }
    SR5_EntityHelpers.updateDicePool(skills.sneaking.test, 0)
    SR5_EntityHelpers.updateDicePool(skills.perception.test, 0)
    //Update Limits
    SR5_EntityHelpers.updateValue(skills.sneaking.limit, 0)
    SR5_EntityHelpers.updateValue(skills.perception.limit, 0)
  }

  //
  static generateVehicleTest(actor) {
    let actorData = actor.system, vehicleTest = actorData.vehicleTest, attributes = actorData.attributes
    if (actorData.offRoadMode) {
      if (actorData.isSecondaryPropulsionActivate) vehicleTest.limit.base = attributes.secondaryPropulsionHandlingOffRoad.augmented.value
      else vehicleTest.limit.base = attributes.handlingOffRoad.augmented.value
    } else {
      if (actorData.isSecondaryPropulsionActivate) vehicleTest.limit.base = attributes.secondaryPropulsionHandling.augmented.value
      else vehicleTest.limit.base = attributes.handling.augmented.value
    }
    vehicleTest.test.base = 0
    vehicleTest.thresholdModifier = controlRigThresholdModifier(0)
    let controlerData, controlerName
    if (actorData.vehicleOwner.id) {
      controlerData = actorData.vehicleOwner.system
      controlerName = actorData.vehicleOwner.name
    }

    switch (actorData.controlMode) {
      case "autopilot":
        SR5_EntityHelpers.updateModifier(vehicleTest.test, game.i18n.localize('SR5.VehicleStat_PilotShort'), "linkedAttribute", attributes.pilot.augmented.value)
        vehicleTest.test.modifiers = vehicleTest.test.modifiers.concat(actor.system.penalties.special.actual.modifiers)
        break
      case "remote":
        if (actorData.pilotSkill) SR5_EntityHelpers.updateModifier(vehicleTest.test, `${game.i18n.localize('SR5.Controler')}${game.i18n.localize('SR5.Colons')} ${controlerName} (${game.i18n.localize(SR5.pilotSkills[actorData.pilotSkill])})`, actorData.controlMode, controlerData.skills[actorData.pilotSkill].test.dicePool)
        if (controlerData.matrix.userMode === "ar") SR5_EntityHelpers.updateModifier(vehicleTest.limit, game.i18n.localize('SR5.AugmentedReality'), "matrixUserMode", 1)
        else if (controlerData.matrix.userMode === "coldsim" || controlerData.matrix.userMode === "hotsim") SR5_EntityHelpers.updateModifier(vehicleTest.limit, game.i18n.localize('SR5.VirtualReality'), "matrixUserMode", 2)
        break
      case "manual":
        if (actorData.pilotSkill) SR5_EntityHelpers.updateModifier(vehicleTest.test, `${game.i18n.localize('SR5.Controler')}${game.i18n.localize('SR5.Colons')} ${controlerName} (${game.i18n.localize(SR5.pilotSkills[actorData.pilotSkill])})`, actorData.controlMode, controlerData.skills[actorData.pilotSkill].test.dicePool)
        this.applyMetahumanAdaptation(actor, vehicleTest.test)
        if (controlerData.matrix.userMode === "ar") SR5_EntityHelpers.updateModifier(vehicleTest.limit, game.i18n.localize('SR5.AugmentedReality'), "matrixUserMode", 1)
        else if (controlerData.matrix.userMode === "coldsim" || controlerData.matrix.userMode === "hotsim") SR5_EntityHelpers.updateModifier(vehicleTest.limit, game.i18n.localize('SR5.VirtualReality'), "matrixUserMode", 2)
        break
      case "rigging":
        if (actorData.pilotSkill) SR5_EntityHelpers.updateModifier(vehicleTest.test, `${game.i18n.localize('SR5.Controler')}${game.i18n.localize('SR5.Colons')} ${controlerName} (${game.i18n.localize(SR5.pilotSkills[actorData.pilotSkill])})`, actorData.controlMode, controlerData.skills[actorData.pilotSkill].test.dicePool)
        //A jumped in rigger is in VR: +2 to the limit (SR5 p. 201), plus the control rig (SR5 p. 268)
        SR5_EntityHelpers.updateModifier(vehicleTest.limit, game.i18n.localize('SR5.VirtualReality'), "matrixUserMode", VR_PILOTING_LIMIT_BONUS)
        if (controlerData.specialProperties.controlRig.value) {
          SR5_EntityHelpers.updateModifier(vehicleTest.test, game.i18n.localize('SR5.ControlRig'), game.i18n.localize('SR5.Augmentation'), controlerData.specialProperties.controlRig.value)
          SR5_EntityHelpers.updateModifier(vehicleTest.limit, game.i18n.localize('SR5.ControlRig'), game.i18n.localize('SR5.Augmentation'), controlerData.specialProperties.controlRig.value)
          vehicleTest.thresholdModifier = controlRigThresholdModifier(controlerData.specialProperties.controlRig.value, game.i18n.localize('SR5.ControlRig'))
        }
        if (controlerData.matrix.userMode === "hotsim") SR5_EntityHelpers.updateModifier(vehicleTest.test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 1)
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown controle mode '${actorData.controlMode}' in 'generateVehicleTest()'`)
    }
    SR5_CharacterUtility.applySpeedDemon(actor, vehicleTest.test)

    //update vehicle Actions Value
    SR5_EntityHelpers.updateDicePool(vehicleTest.test, 0)
    SR5_EntityHelpers.updateValue(vehicleTest.limit, 0)
    SR5_CharacterUtility.capRemoteLimit(actor, vehicleTest.limit)
  }

  //A metahuman at the controls of a vehicle not adapted to them (Rigger 5.0 p. 171)
  static applyMetahumanAdaptation(actor, test) {
    const actorData = actor.system
    const penalty = metahumanAdaptationPenalty(this.getMetatype(actorData.vehicleOwner), actor.items, actorData.controlMode)
    if (penalty) SR5_EntityHelpers.updateModifier(test, game.i18n.localize("SR5.VehicleModAdaptationMissing"), "itemVehicleMod", penalty)
  }

  //Démon de la vitesse (Rigger 5.0 p. 37): +1 to the piloting test of a vehicle moving fast, its rigger aboard or jumped in
  static applySpeedDemon(actor, test) {
    let actorData = actor.system
    let bonus = speedDemonBonus(actorData, actorData.vehicleOwner?.items)
    if (bonus) SR5_EntityHelpers.updateModifier(test, game.i18n.localize('SR5.RiggerSpeedDemon'), "itemQuality", bonus)
  }

  //Remote control: the limit is the lower of the normal limit and the controller's Data Processing (SR5 p. 239-240)
  static capRemoteLimit(actor, limit) {
    let actorData = actor.system
    if (actorData.controlMode !== "remote" || !actorData.vehicleOwner.id) return
    let mod = dataProcessingCapModifier(limit.value, actorData.vehicleOwner.system.matrix.attributes.dataProcessing.value)
    if (!mod) return
    SR5_EntityHelpers.updateModifier(limit, game.i18n.localize('SR5.DataProcessingLimit'), actorData.controlMode, mod)
    SR5_EntityHelpers.updateValue(limit, 0)
  }

  //
  static generateRammingTest(actor) {
    let actorData = actor.system, rammingTest = actorData.rammingTest, attributes = actorData.attributes
    if (actorData.offRoadMode) {
      if (actorData.isSecondaryPropulsionActivate) rammingTest.limit.base = attributes.secondaryPropulsionHandlingOffRoad.augmented.value
      else rammingTest.limit.base = attributes.handlingOffRoad.augmented.value
    } else {
      if (actorData.isSecondaryPropulsionActivate) rammingTest.limit.base = attributes.secondaryPropulsionHandling.augmented.value
      else rammingTest.limit.base = attributes.handling.augmented.value
    }
    rammingTest.test.base = 0
    let controlerData, controlerName
    if (actorData.vehicleOwner.id) {
      controlerData = actorData.vehicleOwner.system
      controlerName = actorData.vehicleOwner.name
    }

    switch (actorData.controlMode) {
      case "autopilot":
        SR5_EntityHelpers.updateModifier(rammingTest.test, game.i18n.localize('SR5.VehicleStat_PilotShort'), "linkedAttribute", attributes.pilot.augmented.value)
        rammingTest.test.modifiers = rammingTest.test.modifiers.concat(actor.system.penalties.special.actual.modifiers)
        break
      case "remote":
        if (actorData.pilotSkill) SR5_EntityHelpers.updateModifier(rammingTest.test, `${game.i18n.localize('SR5.Controler')}${game.i18n.localize('SR5.Colons')} ${controlerName} (${game.i18n.localize(SR5.pilotSkills[actorData.pilotSkill])})`, actorData.controlMode, controlerData.skills[actorData.pilotSkill].test.dicePool)
        if (controlerData.matrix.userMode === "ar") SR5_EntityHelpers.updateModifier(rammingTest.limit, game.i18n.localize('SR5.AugmentedReality'), "matrixUserMode", 1)
        else if (controlerData.matrix.userMode === "coldsim" || controlerData.matrix.userMode === "hotsim") SR5_EntityHelpers.updateModifier(rammingTest.limit, game.i18n.localize('SR5.VirtualReality'), "matrixUserMode", 2)
        break
      case "manual":
        if (actorData.pilotSkill) SR5_EntityHelpers.updateModifier(rammingTest.test, `${game.i18n.localize('SR5.Controler')}${game.i18n.localize('SR5.Colons')} ${controlerName} (${game.i18n.localize(SR5.pilotSkills[actorData.pilotSkill])})`, actorData.controlMode, controlerData.skills[actorData.pilotSkill].test.dicePool)
        if (controlerData.matrix.userMode === "ar") SR5_EntityHelpers.updateModifier(rammingTest.limit, game.i18n.localize('SR5.AugmentedReality'), "matrixUserMode", 1)
        else if (controlerData.matrix.userMode === "coldsim" || controlerData.matrix.userMode === "hotsim") SR5_EntityHelpers.updateModifier(rammingTest.limit, game.i18n.localize('SR5.VirtualReality'), "matrixUserMode", 2)
        if (actorData.controlMode === "manual") this.applyMetahumanAdaptation(actor, rammingTest.test)
        break
      case "rigging":
        if (actorData.pilotSkill) SR5_EntityHelpers.updateModifier(rammingTest.test, `${game.i18n.localize('SR5.Controler')}${game.i18n.localize('SR5.Colons')} ${controlerName} (${game.i18n.localize(SR5.pilotSkills[actorData.pilotSkill])})`, actorData.controlMode, controlerData.skills[actorData.pilotSkill].test.dicePool)
        //A jumped in rigger is in VR: +2 to the limit (SR5 p. 201), plus the control rig (SR5 p. 268)
        SR5_EntityHelpers.updateModifier(rammingTest.limit, game.i18n.localize('SR5.VirtualReality'), "matrixUserMode", VR_PILOTING_LIMIT_BONUS)
        if (controlerData.specialProperties.controlRig.value) {
          SR5_EntityHelpers.updateModifier(rammingTest.test, game.i18n.localize('SR5.ControlRig'), game.i18n.localize('SR5.Augmentation'), controlerData.specialProperties.controlRig.value)
          SR5_EntityHelpers.updateModifier(rammingTest.limit, game.i18n.localize('SR5.ControlRig'), game.i18n.localize('SR5.Augmentation'), controlerData.specialProperties.controlRig.value)
        }
        if (controlerData.matrix.userMode === "hotsim") SR5_EntityHelpers.updateModifier(rammingTest.test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 1)
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown controle mode '${actorData.controlMode}' in 'generateRammingTest()'`)
    }
    SR5_CharacterUtility.applySpeedDemon(actor, rammingTest.test)

    //update vehicle Actions Value
    SR5_EntityHelpers.updateDicePool(rammingTest.test, 0)
    SR5_EntityHelpers.updateValue(rammingTest.limit, 0)
    SR5_CharacterUtility.capRemoteLimit(actor, rammingTest.limit)
  }

  // Vehicle Slots Calculations
  static updateModificationsSlots(actor, itemData) {
    let actorData = actor.system

    //A factory mod takes up its slots even when its effect is off (Rigger 5.0 p. 154, 156)
    if (modTakesSlots(itemData, itemData.isFactory)) {
      switch (itemData.type) {
        case "powerTrain":
          SR5_EntityHelpers.updateModifier(actorData.modificationSlots.powerTrain, itemData.name, itemData.type, -itemData.slots.value)
          break
        case "protection":
          SR5_EntityHelpers.updateModifier(actorData.modificationSlots.protection, itemData.name, itemData.type, -itemData.slots.value)
          break
        case "body":
          SR5_EntityHelpers.updateModifier(actorData.modificationSlots.body, itemData.name, itemData.type, -itemData.slots.value)
          break
        case "weapons":
          SR5_EntityHelpers.updateModifier(actorData.modificationSlots.weapons, itemData.name, itemData.type, -itemData.slots.value)
          break
        case "electromagnetic":
          SR5_EntityHelpers.updateModifier(actorData.modificationSlots.electromagnetic, itemData.name, itemData.type, -itemData.slots.value)
          break
        case "cosmetic":
          SR5_EntityHelpers.updateModifier(actorData.modificationSlots.cosmetic, itemData.name, itemData.type, -itemData.slots.value)
          break
      }
    }
  }


  // Handle Price Multiplier for itemVehicleMod
  static handleVehiclePriceMultiplier(actor, itemData) {
    let actorData = actor.system
    itemData.vehiclePriceMultiplier.acceleration = actorData.attributes.acceleration.natural.base
    itemData.vehiclePriceMultiplier.handling = actorData.attributes.handling.natural.base
    itemData.vehiclePriceMultiplier.speed = actorData.attributes.speed.natural.base
    itemData.vehiclePriceMultiplier.body = actorData.attributes.body.natural.base
    itemData.vehiclePriceMultiplier.seating = actorData.attributes.seating.natural.base
    itemData.vehiclePriceMultiplier.vehicle = actorData.price
  }

  // Handle secondary Vehicle attributes for secondary propulsion
  static handleSecondaryAttributes(actor, itemData) {
    let actorData = actor.system, attributes = actorData.attributes

    actorData.isSecondaryPropulsion = itemData.secondaryPropulsion.isSecondaryPropulsion
    actorData.secondaryPropulsionType = itemData.secondaryPropulsion.type
    // The sheet checkbox writes the source; the reset turned the prepared value off (Rigger 5 p. 158)
    actorData.isSecondaryPropulsionActivate = actor._source?.system?.isSecondaryPropulsionActivate === true

    switch (actorData.secondaryPropulsionType) {
      case "amphibiousSurface":
        attributes.secondaryPropulsionHandling.natural.base = 2
        attributes.secondaryPropulsionHandlingOffRoad.natural.base = 2
        attributes.secondaryPropulsionSpeed.natural.base = 2
        attributes.secondaryPropulsionAcceleration.natural.base = 1
        break
      case "amphibiousSubmersible":
        attributes.secondaryPropulsionHandling.natural.base = 2
        attributes.secondaryPropulsionHandlingOffRoad.natural.base = 2
        attributes.secondaryPropulsionSpeed.natural.base = 2
        attributes.secondaryPropulsionAcceleration.natural.base = 2
        break
      case "hovercraft":
        attributes.secondaryPropulsionHandling.natural.base = 2
        attributes.secondaryPropulsionHandlingOffRoad.natural.base = 2
        attributes.secondaryPropulsionSpeed.natural.base = 3
        attributes.secondaryPropulsionAcceleration.natural.base = 2
        break
      case "rotor":
        attributes.secondaryPropulsionHandling.natural.base = 2
        attributes.secondaryPropulsionHandlingOffRoad.natural.base = 2
        attributes.secondaryPropulsionSpeed.natural.base = 3
        attributes.secondaryPropulsionAcceleration.natural.base = 2
        break
      case "tracked":
        attributes.secondaryPropulsionHandling.natural.base = 2
        attributes.secondaryPropulsionHandlingOffRoad.natural.base = 4
        attributes.secondaryPropulsionSpeed.natural.base = 2
        attributes.secondaryPropulsionAcceleration.natural.base = 1
        break
      case "walker":
        attributes.secondaryPropulsionHandling.natural.base = 5
        attributes.secondaryPropulsionHandlingOffRoad.natural.base = 5
        attributes.secondaryPropulsionSpeed.natural.base = 1
        attributes.secondaryPropulsionAcceleration.natural.base = 1
        break
      default:
    }

  }

  // Autopilot and Sensor replacements (Rigger 5.0 p. 170): the printed value gives way to the mod's rating, read in the
  // base of the attribute so that the other mods still add to it. A modifier on natural, never the base the sheet edits.
  // Read in prepareBaseData, before the item effects
  static applyVehicleReplacements(actor) {
    const attributes = actor.system.attributes
    for (const [key, label] of [["pilot", "SR5.VehicleModEffectKind_autopilotReplacement"], ["sensor", "SR5.VehicleModEffectKind_sensorReplacement"]]) {
      const replaced = replacedVehicleAttribute(actor.items, key)
      if (replaced === null || !attributes[key]) continue
      SR5_EntityHelpers.updateModifier(attributes[key].natural, game.i18n.localize(label), "itemVehicleMod", replaced - (Number(attributes[key].natural.base) || 0))
    }
    //Tactile sensors: +1 Handling while a rigger is jumped in (Rigger 5.0 p. 170)
    if (tactileSensorsOn(actor.items, actor.system.controlMode)) {
      for (const key of ["handling", "handlingOffRoad", "secondaryPropulsionHandling", "secondaryPropulsionHandlingOffRoad"]) {
        if (attributes[key]) SR5_EntityHelpers.updateModifier(attributes[key].augmented, game.i18n.localize("SR5.VehicleModEffectKind_tactileSensors"), "itemVehicleMod", TACTILE_HANDLING)
      }
    }
  }

  // Armor added by mods: at most the vehicle's Body (Rigger 5.0 p. 161), the excess taken off as a visible modifier
  static capVehicleArmor(actor) {
    const attributes = actor.system.attributes, armor = attributes.armor.augmented
    //Under the optional Modification Points a drone carries up to 3 × its Structure of Armor, then slows down
    //(Rigger 5.0 p. 127-128) instead of the cap of vehicles
    actor.system.cannotMove = false
    if (usesModPoints(droneModRule(), actor.system.type)) {
      const overload = armorOverload(armor.value, attributes.body.augmented.value)
      const label = game.i18n.localize("SR5.DroneArmorOverload")
      for (const [key, penalty] of [["handling", overload.handling], ["handlingOffRoad", overload.handling], ["speed", overload.speed],
        ["speedOffRoad", overload.speed], ["acceleration", overload.acceleration], ["accelerationOffRoad", overload.acceleration]]) {
        if (!penalty || !attributes[key]) continue
        SR5_EntityHelpers.updateModifier(attributes[key].augmented, label, "itemVehicleMod", penalty)
        SR5_EntityHelpers.updateValue(attributes[key].augmented, 0)
      }
      //Below 1 in Handling or below 0 in Speed or Acceleration, the drone can no longer move (R5 p. 128): read before
      //the floor at 0 the sheet shows
      const raw = p => ((Number(p?.base) || 0) + (SR5_EntityHelpers.modifiersSum(p?.modifiers ?? []) || 0)) *
        (SR5_EntityHelpers.modifiersProduct(p?.modifiers ?? []) ?? 1)
      actor.system.cannotMove = droneCannotMove({
        handling: raw(attributes.handling.augmented), speed: raw(attributes.speed.augmented), acceleration: raw(attributes.acceleration.augmented)
      })
      return
    }
    const cut = armorCapReduction(addedArmor(actor.items, armor.modifiers), attributes.body.augmented.value)
    if (!cut) return
    SR5_EntityHelpers.updateModifier(armor, game.i18n.localize("SR5.VehicleArmorCap"), "itemVehicleMod", -cut)
    SR5_EntityHelpers.updateValue(armor, 0)
  }

  // Vehicle slots Update
  static updateVehicleSlots(actor) {
    let actorData = actor.system, slots = actorData.attributes.body.augmented.value

    actorData.modificationSlots.powerTrain.base = slots
    actorData.modificationSlots.protection.base = slots
    actorData.modificationSlots.weapons.base = slots + actorData.modificationSlots.extraWeapons
    actorData.modificationSlots.body.base = slots + actorData.modificationSlots.extraBody
    actorData.modificationSlots.electromagnetic.base = slots
    actorData.modificationSlots.cosmetic.base = slots

    SR5_EntityHelpers.updateValue(actorData.modificationSlots.powerTrain)
    SR5_EntityHelpers.updateValue(actorData.modificationSlots.protection)
    SR5_EntityHelpers.updateValue(actorData.modificationSlots.body)
    SR5_EntityHelpers.updateValue(actorData.modificationSlots.weapons)
    SR5_EntityHelpers.updateValue(actorData.modificationSlots.electromagnetic)
    SR5_EntityHelpers.updateValue(actorData.modificationSlots.cosmetic)
  }

  static async updateControledVehicle(actor) {
    let actorObject = actor.toObject(false)
    if (game.actors) {
      for (let a of game.actors) {
        if (a.type === "actorDrone" && a.system.vehicleOwner.id === actor.id && a.isOwner) {
          await a.update({
            "system.vehicleOwner.system": actorObject.system,
            "system.vehicleOwner.items": actorObject.items,
          })
        }
      }
    }

    if (canvas.scene) {
      for (let t of canvas.tokens.placeables) {
        //A linked token is the world actor, copied just above
        if (t.actor?.type === "actorDrone" && !t.document.actorLink && t.actor.system.vehicleOwner.id === actor.id && t.actor.isOwner) {
          await t.actor.update({
            "system.vehicleOwner.system": actorObject.system,
            "system.vehicleOwner.items": actorObject.items,
          })
        }
      }
    }
  }

  //An autosoft the drone carries itself, not one of the console's copied items (those have no parent)
  static isLocalDroneAutosoft(item, actor) {
    return actor?.type === "actorDrone" && item?.type === "itemProgram" && item.system?.type === "autosoft" && !!item.parent && item.parent.id === actor.id
  }

  //The console's autosofts a slaved drone on autopilot runs (SR5 p. 269, 272): those the rigger shares, up to the
  //console's Sharing, and none if the drone runs one of its own (rcc.js)
  static applyAutosoftEffect(actor) {
    actor.system.matrix.hasLocalAutosoftRunning = actor.system.controlMode === "autopilot" && hasLocalAutosoftRunning(actor.items)
    for (let i of rccAutosoftsForDrone(actor.system, actor.items)) {
      if (autosoftFitsDrone(i.system, actor.system.model) && Object.keys(i.system.customEffects).length) SR5_CharacterUtility.applyCustomEffects(i, actor)
    }
  }
}
