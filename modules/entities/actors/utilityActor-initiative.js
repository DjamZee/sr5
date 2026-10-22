import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5_Toxins
} from "../items/toxins.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"
import {
  spriteInitiativeDice
} from "./sprite-types.js"
import {
  limitAttributeValue
} from "./poolOnlyAttribute.js"
import {
  isOriginalStrainMonad, naniteVolume
} from "../../system/monad-matrix.js"
import {
  SR5Combat
} from "../../system/srcombat.js"
import {
  SR5 
} from "../../config.js"
import {
  _getSRStatusEffect
} from "../../system/effectsList.js"
import {
  refuseByRule
} from "../../system/rule-locks.js"

// Initiative: physical, astral and matrix initiatives, and switching between them.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
export class SR5_CharacterInitiativeUtility {

  // Generate physical initiative
  static updateInitiativePhysical(actor) {
    let actorData = actor.system, initiatives = actorData.initiatives,
      attributes = actorData.attributes, initPhy = initiatives.physicalInit

    initPhy.base = 0
    initPhy.dice.base = 0

    switch (actor.type) {
      case "actorDrone": {
        let controlerData
        if (actorData.vehicleOwner.id) {
          controlerData = actorData.vehicleOwner.system
        }
        switch (actorData.controlMode) {
          case "autopilot":
            SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.VehicleStat_PilotShort'), "linkedAttribute", attributes.pilot.augmented.value)
            SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.VehicleStat_PilotShort'), "linkedAttribute", attributes.pilot.augmented.value)
            initPhy.dice.base = 4
            break
          case "manual":
            SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.InitiativePhysical'), "controler", controlerData.initiatives.physicalInit.value)
            SR5_EntityHelpers.updateModifier(initPhy.dice, game.i18n.localize('SR5.InitiativePhysical'), "controler", controlerData.initiatives.physicalInit.dice.value)
            break
          case "remote":
          case "rigging":
            if (actorData.controlMode === "rigging" && controlerData?.activeSpecialAttribute === "depth") {
              // AI loaded in a vehicle (Data Trails p. 161): Pilot replaces Data Processing for Initiative
              SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.Intuition'), "controler", controlerData.attributes.intuition.augmented.value)
              SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.VehicleStat_PilotShort'), "linkedAttribute", attributes.pilot.augmented.value)
              initPhy.dice.base = 4
              break
            }
            SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.InitiativeMatrix'), "controler", controlerData.initiatives.matrixInit.value)
            SR5_EntityHelpers.updateModifier(initPhy.dice, game.i18n.localize('SR5.InitiativeMatrix'), "controler", controlerData.initiatives.matrixInit.dice.value)
            break
          default:
            SR5_SystemHelpers.srLog(1, `Unknown controle mode '${actorData.controlMode}' in 'updateInitiatives() for drone/vehicle' ('${actorData.model}')`)
        }
        break
      }
      case "actorSpirit": {
        // The homunculus stat block prints (F + 1) + 1D6 (SR5 p. 301), not REA + INT, which would give F - 1
        if (SR5_SpiritTypes.baseType(actorData.type) === "homunculus") {
          SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.SpiritForce'), "linkedAttribute", actorData.force.value + 1)
        } else {
          SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
          SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.Reaction'), "linkedAttribute", attributes.reaction.augmented.value)
        }
        initPhy.dice.base = 1
        const customType = SR5_SpiritTypes.get(actorData.type)
        const customDice = customType ? SR5_SpiritTypes.physicalDice(customType) : null
        const spiritDice = customDice !== null ?
          customDice :
          (SR5_SpiritTypes.baseType(actorData.type) === "homunculus" ? 0 : 1)
        if (spiritDice) SR5_EntityHelpers.updateModifier(initPhy.dice, SR5_SpiritTypes.label(actorData.type), "spiritType", spiritDice)
        const spiritBonus = customType ? SR5_SpiritTypes.physicalBonus(customType) : 0
        if (spiritBonus) SR5_EntityHelpers.updateModifier(initPhy, SR5_SpiritTypes.label(actorData.type), "spiritType", spiritBonus)
        break
      }
      default:
        SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
        //Attribute Boost (SR5 p. 312) leaves the Initiative attribute alone; the AR matrix initiative copies these modifiers
        SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.Reaction'), "linkedAttribute", limitAttributeValue(attributes.reaction))
        initPhy.dice.base = 1
        // A grunt's profile prints its Initiative (SR5 p. 381): typed on the sheet, kept outside the reset initiatives
        if (actor.type === "actorGrunt") {
          const profile = actorData.profileInitiative
          if (profile?.score) SR5_EntityHelpers.updateModifier(initPhy, game.i18n.localize('SR5.InitiativeProfile'), "gruntProfile", profile.score)
          if (profile?.dice) SR5_EntityHelpers.updateModifier(initPhy.dice, game.i18n.localize('SR5.InitiativeProfile'), "gruntProfile", profile.dice)
        }
    }

    this.applyPenalty("condition", initPhy, actor)
    SR5_EntityHelpers.updateValue(initPhy, 0)
    SR5_EntityHelpers.updateValue(initPhy.dice, 0, 5)
    initPhy.dice.value = Math.floor(initPhy.dice.value)
  }

  // Generate astral initiative
  static updateInitiativeAstral(actor) {
    let actorData = actor.system, initiatives = actorData.initiatives, attributes = actorData.attributes, initAst = initiatives.astralInit

    initAst.base = 0
    initAst.dice.base = 0

    if (actor.type === "actorSpirit") {
      // Force counts twice for every spirit type, then the type decides its
      // dice and, for shadow spirits, a flat bonus.
      const customType = SR5_SpiritTypes.get(actorData.type)
      const spiritLabel = SR5_SpiritTypes.label(actorData.type)
      SR5_EntityHelpers.updateModifier(initAst, game.i18n.localize('SR5.SpiritForce'), "linkedAttribute", actorData.force.value)
      SR5_EntityHelpers.updateModifier(initAst, game.i18n.localize('SR5.SpiritForce'), "linkedAttribute", actorData.force.value)
      let spiritDice = 3
      let spiritBonus = 0
      switch (SR5_SpiritTypes.baseType(actorData.type)) {
        case "watcher":
          spiritDice = 1
          break
        case "shadowMuse":
        case "shadowNightmare":
        case "shadowShade":
        case "shadowSuccubus":
        case "shadowWraith":
          spiritBonus = 1
          break
      }
      if (customType) {
        const customDice = SR5_SpiritTypes.astralDice(customType)
        if (customDice !== null) spiritDice = customDice
        spiritBonus += SR5_SpiritTypes.astralBonus(customType)
      }
      if (spiritBonus) SR5_EntityHelpers.updateModifier(initAst, spiritLabel, "spiritType", spiritBonus)
      if (spiritDice) SR5_EntityHelpers.updateModifier(initAst.dice, spiritLabel, "spiritType", spiritDice)
    } else {
      SR5_EntityHelpers.updateModifier(initAst, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(initAst, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(initAst.dice, game.i18n.localize('SR5.AstralProjection'), "astralPlane", 3)
    }
    this.applyPenalty("condition", initAst, actor)
    SR5_EntityHelpers.updateValue(initAst, 0)
    SR5_EntityHelpers.updateValue(initAst.dice, 0, 5)
    initAst.dice.value = Math.floor(initAst.dice.value)
  }

  // Generate matrix initiative
  static updateInitiativeMatrix(actor) {
    let actorData = actor.system, initiatives = actorData.initiatives, attributes = actorData.attributes, initMat = initiatives.matrixInit,
      matrixAttributes = actorData.matrix.attributes
    initMat.base = 0
    initMat.dice.base = 0

    switch (actor.type) {
      case "actorPc":
      case "actorGrunt":
        // AI (Data Trails p. 160): (Intuition x 2) + 4D6 without a device, Intuition + Data Processing + 4D6 on a device
        if (actorData.activeSpecialAttribute === "depth") {
          // computed once without a device and again once the device is known: start from a clean list
          initMat.modifiers = []
          initMat.dice.modifiers = []
          SR5_EntityHelpers.updateModifier(initMat, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
          if (actorData.matrix.deviceType) SR5_EntityHelpers.updateModifier(initMat, actorData.matrix.deviceName, "device", matrixAttributes.dataProcessing.value)
          else SR5_EntityHelpers.updateModifier(initMat, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
          SR5_EntityHelpers.updateModifier(initMat.dice, game.i18n.localize('SR5.Depth'), "linkedAttribute", 4)
          break
        }
        // Monad of the original strain (Dark Terrors p. 88): Nanite Volume + Intuition + 4D6, always in hot sim
        if (isOriginalStrainMonad(actor)) {
          SR5_EntityHelpers.updateModifier(initMat, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
          SR5_EntityHelpers.updateModifier(initMat, game.i18n.localize('SR5.NaniteVolume'), "linkedAttribute", naniteVolume(actor))
          SR5_EntityHelpers.updateModifier(initMat.dice, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 4)
          break
        }
        switch (actorData.matrix.userMode) {
          case "ar":
            initMat.modifiers = initiatives.physicalInit.modifiers
            initMat.dice.base = 1
            initMat.dice.modifiers = initiatives.physicalInit.dice.modifiers
            break
          case "coldsim":
            SR5_EntityHelpers.updateModifier(initMat, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
            SR5_EntityHelpers.updateModifier(initMat, actorData.matrix.deviceName, "device", matrixAttributes.dataProcessing.value)
            SR5_EntityHelpers.updateModifier(initMat.dice, game.i18n.localize('SR5.VirtualRealityColdSimShort'), "matrixUserMode", 3)
            break
          case "hotsim":
            SR5_EntityHelpers.updateModifier(initMat, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
            SR5_EntityHelpers.updateModifier(initMat, actorData.matrix.deviceName, "device", matrixAttributes.dataProcessing.value)
            SR5_EntityHelpers.updateModifier(initMat.dice, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 4)
            break
          default:
            SR5_SystemHelpers.srLog(1, `Unknown matrix userMode '${actorData.matrix.userMode}' in 'updateInitiativeMatrix()'`)
        }
        break
      case "actorSprite":
        SR5_EntityHelpers.updateModifier(initMat, game.i18n.localize('SR5.Level'), "linkedAttribute", actorData.level)
        SR5_EntityHelpers.updateModifier(initMat, game.i18n.localize('SR5.DataProcessing'), "linkedAttribute", matrixAttributes.dataProcessing.value)
        SR5_EntityHelpers.updateModifier(initMat.dice, game.i18n.localize(SR5.spriteTypes[actorData.type]), `${game.i18n.localize('TYPES.Actor.actorSprite')}`, spriteInitiativeDice(actorData.type))
        break
      case "actorAgent":
        SR5_EntityHelpers.updateModifier(initMat, `${game.i18n.localize('SR5.Rating')}`, "linkedAttribute", actorData.rating)
        SR5_EntityHelpers.updateModifier(initMat, `${game.i18n.localize('SR5.DataProcessing')}`, "linkedAttribute", matrixAttributes.dataProcessing.value)
        SR5_EntityHelpers.updateModifier(initMat.dice, game.i18n.localize(SR5.spriteTypes[actorData.type]), `${game.i18n.localize('TYPES.Actor.actorAgent')}`, 4)
        break
      case "actorDevice":
        SR5_EntityHelpers.updateModifier(initMat, `${game.i18n.localize('SR5.DeviceRating')}`, "linkedAttribute", actorData.matrix.deviceRating)
        SR5_EntityHelpers.updateModifier(initMat, `${game.i18n.localize('SR5.DataProcessing')}`, "linkedAttribute", matrixAttributes.dataProcessing.value)
        SR5_EntityHelpers.updateModifier(initMat.dice, `${game.i18n.localize(SR5.deviceTypes[actorData.matrix.deviceType])}`, `${game.i18n.localize('TYPES.Actor.actorDevice')}`, 4)
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown actor type '${actor.type}' in 'updateInitiativeMatrix()'`)
    }

    if (actorData.matrix.userMode !== "ar" || this.isDepthActive(actor)) this.applyPenalty("condition", initMat, actor)
    SR5_EntityHelpers.updateValue(initMat, 0)
    SR5_EntityHelpers.updateValue(initMat.dice, 0, 5)
    initMat.dice.value = Math.floor(initMat.dice.value)
  }

  // Find Actor Active Initiative
  //The initiative an actor plays when none is set yet
  static defaultInitiative(actor) {
    switch (actor.type) {
      case "actorPc":
      case "actorGrunt":
        // An AI outside any device is a persona alone: matrix initiative (Data Trails p. 157-158, decision G11 of
        // DjamZ); in a device or a body it starts physical like any character
        return this.isDevicelessAI(actor) ? "matrixInit" : "physicalInit"
      case "actorSpirit":
        // A homunculus is always physical (SR5 p. 301)
        if (SR5_SpiritTypes.baseType(actor.system.type) === "homunculus") return "physicalInit"
        return actor.system.initiatives?.astralInit ? "astralInit" : "physicalInit"
      case "actorDevice":
        return "matrixInit"
      case "actorDrone":
        return "physicalInit"
    }
    return null
  }

  static findActiveInitiative(actor) {
    for (let [key, value] of Object.entries(actor.initiatives)) {
      if (value.isActive) return key
    }
    return false
  }

  //Switching to or from the astral initiative is a complex action, to or from the matrix one (not in AR) a simple one.
  //Synchronous, so that a sheet checkbox can be held back before it changes
  static canSwitchToInitiative(actor, initiative) {
    let currentInitiative = this.findActiveInitiative(actor.system),
      switchCost = []
    //Better Than Bad p. 141: cut from the manasphere by Blight, no astral projection (decision of DjamZ)
    //The "magic" rule lock lifted (B13), the switch goes and the gamemaster hears of it
    if (initiative === "astralInit" && currentInitiative !== "astralInit" && SR5_Toxins.blightBlocksAstral(actor) && refuseByRule("magic", "SR5.WARN_BlightNoSpell", null, {
      actor
    })) return false
    if (initiative === "astralInit" || (initiative === "physicalInit" && currentInitiative === "astralInit")) switchCost = [{
      type: "complex", value: 1
    }]
    else if ((initiative === "matrixInit" || (initiative === "physicalInit" && currentInitiative === "matrixInit")) && actor.system.matrix?.userMode !== "ar") switchCost = [{
      type: "simple", value: 1
    }]
    return SR5Combat.hasActionsLeft(actor, switchCost)
  }

  // Switch Actor To New Initiative
  static async switchToInitiative(entity, initiative) {
    let actor
    if (entity.token) actor = entity.token.actor
    else actor = entity

    let actorData = foundry.utils.duplicate(actor.system),
      initiatives = actorData.initiatives,
      currentInitiative = this.findActiveInitiative(actor.system),
      actorId = (actor.isToken ? actor.token.id : actor.id)

    if (!this.canSwitchToInitiative(actor, initiative)) return false

    if (currentInitiative) initiatives[currentInitiative].isActive = false
    if (currentInitiative === "astralInit") actorData.visions.astral.isActive = false
    initiatives[initiative].isActive = true
    //Astral perception replaces the vision in use, as switchVision does: low-light or thermographic vision stayed
    //active beside it
    if (initiative === "astralInit") {
      for (let key of Object.keys(SR5.visionActive)) {
        if (actorData.visions[key]) actorData.visions[key].isActive = (key === "astral")
      }
    }

    await actor.update({
      'system': actorData 
    })
    //check if previous effect is on
    let previousInitiativeEffect = actor.effects.find(effect => effect.origin === "initiativeMode")
    //generate effect
    let initiativeEffect
    if (initiative !== "physicalInit") initiativeEffect = await _getSRStatusEffect(initiative)

    // if initiative is physical remove effect, else add or update active effect
    if (initiative === "physicalInit") {
      if (previousInitiativeEffect) await actor.deleteEmbeddedDocuments('ActiveEffect', [previousInitiativeEffect.id])
      if (currentInitiative === "astralInit" && game.combat) SR5Combat.changeActionInCombat(actorId, [{
        type: "complex", value: 1, source: "switchInitToPhysical" 
      }])
      else if (currentInitiative === "matrixInit" && game.combat && actorData.matrix.userMode !== "ar") SR5Combat.changeActionInCombat(actorId, [{
        type: "simple", value: 1, source: "switchInitToPhysical" 
      }])
    } else {
      if (previousInitiativeEffect) await previousInitiativeEffect.update(initiativeEffect)
      else await actor.createEmbeddedDocuments('ActiveEffect', [initiativeEffect])
      //Manage actions
      if (initiative === "astralInit" && game.combat) SR5Combat.changeActionInCombat(actorId, [{
        type: "complex", value: 1, source: "switchInitToAstral" 
      }])
      else if (initiative === "matrixInit" && game.combat && actorData.matrix.userMode !== "ar") SR5Combat.changeActionInCombat(actorId, [{
        type: "simple", value: 1, source: "switchInitToMatrix" 
      }])
    }

    if (initiative === "astralInit" || currentInitiative === "astralInit") this.handleAstralVision(entity)
  }
}
