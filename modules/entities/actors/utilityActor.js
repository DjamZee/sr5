import {
  calledShotSkillsOf, calledShotEffectValue, isMartialArtsModifierTarget
} from "../../rolls/roll-helpers/calledShotSkills.js"
import {
  emptyPreparedModifiers
} from "../../migration-source-modifiers.js"
import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5ShopGrades
} from "../../interface/shop-grades.js"
import {
  transhumanGift, currentEssenceHole, essenceAdjustment
} from "../../system/implant-essence.js"
import {
  SR5_Toxins
} from "../items/toxins.js"
import {
  applyDrugQuality, drugAddictionThreshold, effectiveDrugQuality, crashSinceIntake
} from "../items/drug-stat.js"
import {
  longHaulDoseKind
} from "../items/drug-damage.js"
import {
  computeCustomDrug, customDrugShot
} from "../items/drug-designer.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"
import {
  spriteTypeDefinition, spriteMatrixModifiers, spriteInitiativeBonus, SPRITE_MATRIX_KEYS
} from "./sprite-types.js"
import {
  fadingResistanceAttribute
} from "./fading-resistance.js"
import {
  MYSTIC_APTITUDE_ATTRIBUTES, mysticAptitudeKey, mysticAptitudeChoice, mysticAptitudeValue
} from "../items/adept-powers-btb.js"
import {
  HOST_ATTRIBUTES, HOST_TYPE_PAGES, resolveHostAttributes, hostTypeOffsetLabel, untypedHostDefaults
} from "./host-type.js"
import {
  augmentationCapExcess, uncappedRating, limitBase, limitCapNote, CAP_NOTE_LIMITS
} from "./augmentationCap.js"
import {
  limitAttributeValue
} from "./poolOnlyAttribute.js"
import {
  originalStrainDevice, activeHeadcase, naniteVolume, monitorSize
} from "../../system/monad-matrix.js"
import {
  ICE_HOST_ATTRIBUTES, iceHostAttributes, iceHostOf
} from "../../system/ice-host.js"
import {
  situationalValue, isRollTestsTarget, ROLL_TESTS_PREFIX, SITUATIONAL_PREFIX, attributeRedirect, situationalReadable,
  situationalMovement, movementEffectKey, movementEffectOn
} from "../../rolls/roll-helpers/situational.js"
import {
  isIndirect, indirectEffectOf
} from "../../rolls/roll-helpers/indirect.js"
import {
  drugEffectApplies, phaseFromFlags, effectPhase
} from "../items/drug-phase.js"
import {
  replaceModifierValue
} from "./effect-replace.js"
import {
  SR5 
} from "../../config.js"
import {
  _getSRStatusEffect
} from "../../system/effectsList.js"
import {
  mentorPathFor, mentorEffectApplies, isFollowedMentor, mentorMagic, mentorPowerPoints, mentorMaskOn
} from "../items/mentor-spirits.js"
import {
  ELEMENTAL_SPIRIT_TYPES, astralReputation, wildReputation
} from "../items/spirit-bonds.js"
import {
  applyCharacterLedger
} from "../../system/spirit-ledger.js"
import {
  harmoniousDefensePool
} from "../../rolls/roll-helpers/arcana-metamagics.js"
import {
  effectiveSceneBackgroundCount, backgroundCountFor
} from "../../system/background-count.js"
import {
  updateGreyMana
} from "../../system/grey-mana.js"
import {
  actsAsRcc, fixedRccRatings, rccRatings, droneAutopilot, localAutosoftRating
} from "./rcc.js"
import {
  streamOf, firewallBonusOfStream, sleazeBonusOfStream, resonanceRestoredByStream, machineMindRating, hasResonantDissonance, RESONANT_DISSONANCE_ACTIONS
} from "./technomancer-streams.js"
import {
  isLimbAttributeTarget, hostLimb, strengthRecoil
} from "../../system/cyberlimb.js"
import {
  factorySkipsEffect
} from "../../system/vehicle-factory.js"
import {
  replacedVehicleAttributeOf
} from "../../system/vehicle-mods.js"
import {
  consoleNoiseReductionDice
} from "../../rolls/roll-helpers/electronic-warfare.js"
import {
  isPlainDevice, lacksAttackAndSleaze
} from "./device-attributes.js"
import {
  iceDefenseType, iceDesignOf
} from "../../system/ice-design.js"
import {
  hotDropGear, HOT_DROP_DISTANCES
} from "../../system/hot-drop.js"
import {
  SR5_CharacterVisionUtility
} from "./utilityActor-vision.js"
import {
  SR5_CharacterInitiativeUtility
} from "./utilityActor-initiative.js"
import {
  SR5_CharacterHealthUtility, linkHealthUtility
} from "./utilityActor-health.js"
import {
  SR5_CharacterRiggingUtility, linkRiggingUtility
} from "./utilityActor-rigging.js"
import {
  SR5_CharacterSkillsUtility
} from "./utilityActor-skills.js"
import {
  SR5_CharacterSpiritsUtility
} from "./utilityActor-spirits.js"


export class SR5_CharacterUtility extends Actor {
  //************************************************//
  //                     ACTORS                     //
  //************************************************//

  // Reset Actors Properties
  static resetCalculatedValues(actor) {
    let actorData = actor.system, list

    // Every modifiers array is computed: none starts from the source nor from the previous preparation,
    // including those the resets below forget (the fatigue and fall resistances grew at each preparation)
    emptyPreparedModifiers(actorData)

    // Reset Attributes
    switch (actor.type) {
      case "actorDrone":
        list = SR5.vehicleAttributes
        break
      case "actorPc":
      case "actorGrunt":
      case "actorSpirit":
      case "actorSprite":
        list = SR5.characterAttributes
    }

    if (list) {
      for (let key of Object.keys(list)) {
        actorData.attributes[key].natural.value = 0
        actorData.attributes[key].natural.modifiers = []
        actorData.attributes[key].augmented.value = 0
        actorData.attributes[key].augmented.modifiers = []
      }
    }

    // Reset Special Attributes
    if (actorData.specialAttributes) {
      for (let key of Object.keys(SR5.characterSpecialAttributes)) {
        if (actorData.specialAttributes[key]) {
          actorData.specialAttributes[key].natural.value = 0
          actorData.specialAttributes[key].natural.modifiers = []
          actorData.specialAttributes[key].augmented.value = 0
          actorData.specialAttributes[key].augmented.modifiers = []
        }
      }
    }

    // Reset Initiatives
    for (let key of Object.keys(SR5.characterInitiatives)) {
      if (actorData.initiatives[key]) {
        actorData.initiatives[key].value = 0
        actorData.initiatives[key].modifiers = []
        if (!actorData.initiatives[key].dice) { actorData.initiatives[key].dice = {
          value: 0, base: 1, modifiers: [] 
        } }
        actorData.initiatives[key].dice.value = 0
        actorData.initiatives[key].dice.modifiers = []
      }
    }
    if (!this.findActiveInitiative(actorData)) {
      const initiative = this.defaultInitiative(actor)
      if (initiative && actorData.initiatives[initiative]) actorData.initiatives[initiative].isActive = true
    }

    // Reset Limits
    if (actorData.limits) {
      for (let key of Object.keys(SR5.characterLimits)) {
        if (actorData.limits[key]) {
          actorData.limits[key].value = 0
          actorData.limits[key].modifiers = []
        }
      }
    }

    // Reset Defenses
    if (actorData.defenses) {
      for (let key of Object.keys(SR5.characterDefenses)) {
        if (actorData.defenses[key]) {
          actorData.defenses[key].dicePool = 0
          actorData.defenses[key].modifiers = []
          actorData.defenses[key].limit.value = 0
          actorData.defenses[key].limit.modifiers = []
          actorData.defenses[key].unlimited = false
        }
      }
    }

    // Reset Resistances
    if (actorData.resistances) {
      for (let key of Object.keys(SR5.characterResistances)) {
        if (actorData.resistances[key]) {
          let subkey = ""
          switch (key) {
            case "disease":
            case "toxin":
              for (subkey of Object.keys(SR5.propagationVectors)) {
                actorData.resistances[key][subkey].dicePool = 0
                actorData.resistances[key][subkey].modifiers = []
              }
              break
            case "specialDamage":
              for (subkey of Object.keys(SR5.specialDamageTypes)) {
                actorData.resistances[key][subkey].dicePool = 0
                actorData.resistances[key][subkey].modifiers = []
              }
              break
            case "astralDamage":
            case "physicalDamage":
            case "directSpellMana":
            case "directSpellPhysical":
            case "crashDamage":
            case "fatigue":
            case "fall":
              actorData.resistances[key].dicePool = 0
              actorData.resistances[key].modifiers = []
              break
          }
        }
      }
      if (actorData.resistances.addiction) {
        for (let kind of ["physiological", "psychological"]) {
          actorData.resistances.addiction[kind].dicePool = 0
          actorData.resistances.addiction[kind].modifiers = []
        }
      }
    }

    // Reset itemsProperties
    if (actorData.itemsProperties?.armor) {
      actorData.itemsProperties.armor.value = 0
      actorData.itemsProperties.armor.modifiers = []
      actorData.itemsProperties.armor.padded = false
      for (let key of Object.keys(SR5.specialDamageTypes)) {
        actorData.itemsProperties.armor.specialDamage[key].modifiers = []
        actorData.itemsProperties.armor.specialDamage[key].value = 0
      }
      for (let key of Object.keys(SR5.propagationVectors)) {
        actorData.itemsProperties.armor.toxin[key].modifiers = []
        actorData.itemsProperties.armor.toxin[key].value = 0
      }
    }

    if (actorData.itemsProperties?.weapon) {
      actorData.itemsProperties.weapon.accuracy.value = 0
      actorData.itemsProperties.weapon.accuracy.modifiers = []
      actorData.itemsProperties.weapon.damageValue.value = 0
      actorData.itemsProperties.weapon.damageValue.modifiers = []
      if (actorData.itemsProperties.weapon.reach) {
        actorData.itemsProperties.weapon.reach.value = 0
        actorData.itemsProperties.weapon.reach.modifiers = []
      }
    }

    if (actorData.itemsProperties?.environmentalMod) {
      for (let key of Object.keys(SR5.environmentalModifiers)) {
        actorData.itemsProperties.environmentalMod[key].value = 0
        actorData.itemsProperties.environmentalMod[key].modifiers = []
      }
    }

    if (actorData.itemsProperties?.martialArts) {
      for (let key of Object.keys(SR5.calledShotsMartialArts)) {
        actorData.itemsProperties.martialArts[key].isActive = false
        if (actorData.itemsProperties.martialArts[key].modifier) {
          actorData.itemsProperties.martialArts[key].modifier.modifiers = []
        }
      }
    }

    if (actorData.itemsProperties?.calledShots) {
      for (let key of Object.keys(SR5.calledShotsItems)) {
        if (actorData.itemsProperties.calledShots[key]?.modifier) actorData.itemsProperties.calledShots[key].modifier.modifiers = []
      }
    }

    // Reset Essence
    if (actorData.essence) {
      actorData.essence.value = 0
      actorData.essence.modifiers = []
    }

    // Reset Derived Attributes
    if (actorData.derivedAttributes) {
      for (let key of Object.keys(SR5.characterDerivedAttributes)) {
        actorData.derivedAttributes[key].dicePool = 0
        actorData.derivedAttributes[key].modifiers = []
      }
    }

    // Reset Recoil Compensation
    if (actorData.recoilCompensation) {
      actorData.recoilCompensation.value = 0
      actorData.recoilCompensation.modifiers = []
    }

    // Reset Penalties
    if (actorData.penalties) {
      for (let key of Object.keys(SR5.penaltyTypes)) {
        actorData.penalties[key].actual.value = 0
        actorData.penalties[key].actual.modifiers = []
        if (actorData.penalties[key].boxReduction) {
          actorData.penalties[key].boxReduction.value = 0
          actorData.penalties[key].boxReduction.modifiers = []
        }
        if (actorData.penalties[key].step) {
          actorData.penalties[key].step.base = 3
          actorData.penalties[key].step.value = 0
          actorData.penalties[key].step.modifiers = []
        }
      }
    }

    // Reset Movements
    if (actorData.movements) {
      for (let key of Object.keys(SR5.movements)) {
        actorData.movements[key].movement.value = 0
        actorData.movements[key].movement.modifiers = []
        actorData.movements[key].extraMovement.value = 0
        actorData.movements[key].extraMovement.modifiers = []
        actorData.movements[key].test.dicePool = 0
        actorData.movements[key].test.modifiers = []
        actorData.movements[key].maximum.value = 0
        actorData.movements[key].maximum.modifiers = []
        actorData.movements[key].limit.value = 0
        actorData.movements[key].limit.modifiers = []
        if (key === "walk" || key === "run") {
          actorData.movements[key].multiplier.value = 0
          actorData.movements[key].multiplier.modifiers = []
        }
      }
    }

    // Reset Weight Actions
    if (actorData.weightActions) {
      for (let key of Object.keys(SR5.weightActions)) {
        actorData.weightActions[key].baseWeight.value = 0
        actorData.weightActions[key].baseWeight.modifiers = []
        actorData.weightActions[key].extraWeight.value = 0
        actorData.weightActions[key].extraWeight.modifiers = []
        actorData.weightActions[key].test.dicePool = 0
        actorData.weightActions[key].test.modifiers = []
      }
    }

    // Reset Reach
    if (actorData.reach) {
      actorData.reach.value = 0
      actorData.reach.modifiers = []
    }

    // Reset Skill Groups
    if (actorData.skillGroups) {
      for (let key of Object.keys(SR5.skillGroups)) {
        actorData.skillGroups[key].value = 0
        actorData.skillGroups[key].modifiers = []
      }
    }

    // Reset Skills
    if (actorData.skills) {
      for (let key of Object.keys(SR5.skills)) {
        if (actorData.skills[key]) {
          actorData.skills[key].rating.value = 0
          actorData.skills[key].rating.modifiers = []
          actorData.skills[key].test.base = 0
          actorData.skills[key].test.dicePool = 0
          actorData.skills[key].test.modifiers = []
          actorData.skills[key].limit.value = 0
          actorData.skills[key].limit.modifiers = []
          switch (key) {
            case "spellcasting":
            case "counterspelling":
            case "ritualSpellcasting":
            case "alchemy":
              for (let category of Object.keys(SR5.spellCategories)) {
                if (actorData.skills[key].spellCategory[category]) {
                  actorData.skills[key].spellCategory[category].base = 0
                  actorData.skills[key].spellCategory[category].dicePool = 0
                  actorData.skills[key].spellCategory[category].modifiers = []
                } else {
                  actorData.skills[key].spellCategory[category] = {
                    "base": 0,
                    "value": 0,
                    "modifiers": []
                  }
                }
              }
              break
            case "binding":
            case "banishing":
            case "summoning":
              for (let type of Object.keys(SR5.spiritTypes)) {
                if (actorData.skills[key].spiritType[type]) {
                  actorData.skills[key].spiritType[type].base = 0
                  actorData.skills[key].spiritType[type].dicePool = 0
                  actorData.skills[key].spiritType[type].modifiers = []
                } else {
                  actorData.skills[key].spiritType[type] = {
                    "base": 0,
                    "value": 0,
                    "modifiers": []
                  }
                }
              }
              break
            case "perception":
              for (let type of Object.keys(SR5.perceptionTypes)) {
                if (actorData.skills[key].perceptionType[type]) {
                  actorData.skills[key].perceptionType[type].test.value = 0
                  actorData.skills[key].perceptionType[type].test.modifiers = []
                  actorData.skills[key].perceptionType[type].limit.base = 0
                  actorData.skills[key].perceptionType[type].limit.value = 0
                  actorData.skills[key].perceptionType[type].limit.modifiers = []
                }
              }
          }
        }
      }
    }

    // Reset Language Skills
    if (actorData.languageSkills) {
      actorData.languageSkills.value = 0
      actorData.languageSkills.modifiers = []
    }

    // Reset Knowledge Skills
    if (actorData.knowledgeSkills) {
      actorData.knowledgeSkills.value = 0
      actorData.knowledgeSkills.modifiers = []
    }

    // Reset Vision
    if (actorData.visions) {
      for (let key of Object.keys(SR5.visionTypes)) {
        actorData.visions[key].hasVision = false
        actorData.visions[key].natural = false
        actorData.visions[key].augmented = false
      }
      if (actorData.visions.cyberEyes) {
        actorData.visions.cyberEyes.hasCyberEyes = !!this.getCyberEyes(actor)
        actorData.visions.cyberEyes.replacedNaturalVision = []
      }
    }

    // Reset Special properties
    if (actorData.specialProperties) {
      for (let key of Object.keys(SR5.specialProperties)) {
        actorData.specialProperties[key].value = 0
        actorData.specialProperties[key].modifiers = []
      }
      for (let key of Object.keys(SR5.hardenedArmorTypes)) {
        actorData.specialProperties.hardenedArmors[key].value = 0
        actorData.specialProperties.hardenedArmors[key].modifiers = []
        actorData.specialProperties.hardenedArmors[key].type = ""
      }
      for (let key of Object.keys(SR5.actionTypes)) {
        if (actorData.specialProperties.actions[key]) {
          actorData.specialProperties.actions[key].value = 0
          actorData.specialProperties.actions[key].modifiers = []
        }
      }
      actorData.specialProperties.doublePenalties = false
      actorData.specialProperties.calledShotHalved = false
      actorData.specialProperties.energyAura = ""
      actorData.specialProperties.spellAuraElement = ""
      actorData.specialProperties.regeneration = ""
      actorData.specialProperties.naniteToxinResistance = false
      actorData.specialProperties.immunodeficiency = false
      actorData.specialProperties.hardenedArmorHitsOnly = false
      actorData.specialProperties.anticoagulant = ""
      actorData.specialProperties.aggravatedWounds = false
      actorData.specialProperties.essenceDrain = ""
      actorData.specialProperties.fullDefenseAttribute = "willpower"
      actorData.specialProperties.fullDefenseValue = 0
    }

    // Reset Vehicule Test
    if (actorData.vehicleTest) {
      actorData.vehicleTest.test.base = 0
      actorData.vehicleTest.test.modifiers = []
      actorData.vehicleTest.limit.base = 0
      actorData.vehicleTest.limit.modifiers = []
    }

    // Reset Ramming Test
    if (actorData.rammingTest) {
      actorData.rammingTest.test.base = 0
      actorData.rammingTest.test.modifiers = []
      actorData.rammingTest.limit.base = 0
      actorData.rammingTest.limit.modifiers = []
    }

    // Reset Vehicule Mods
    if (actorData.vehiclesMod) {
      actorData.modificationSlots.powerTrain.modifiers = []
      actorData.modificationSlots.protection.base = 0
      actorData.modificationSlots.protection.modifiers = []
      actorData.modificationSlots.body.base = 0
      actorData.modificationSlots.body.modifiers = []
      actorData.modificationSlots.weapons.base = 0
      actorData.modificationSlots.weapons.modifiers = []
      actorData.modificationSlots.electromagnetic.base = 0
      actorData.modificationSlots.electromagnetic.modifiers = []
      actorData.modificationSlots.cosmetic.base = 0
      actorData.modificationSlots.cosmetic.modifiers = []
    }

    // Reset Vehicule Secondary Propulsion: the activation stays off unless an active secondary propulsion
    // mod reads it again from the source (handleSecondaryAttributes)
    if (actor.type === "actorDrone") actorData.isSecondaryPropulsionActivate = false
    if (actorData.isSecondaryPropulsion) {
      actorData.isSecondaryPropulsion = false
      actorData.secondaryPropulsionType = ""
    }

    if (actorData.matrix) {
      //Reset general data
      if (actor.type === "actorPc" || actor.type === "actorGrunt") {
        actorData.matrix.deviceType = ""
        actorData.matrix.deviceName = ""
      }

      // Reset Matrix Attributes
      if (actorData.matrix.attributes) {
        for (let key of Object.keys(SR5.matrixAttributes)) {
          actorData.matrix.attributes[key].value = 0
          actorData.matrix.attributes[key].modifiers = []
        }
      }

      //Reset Link Lock
      if (actorData.matrix.isLinkLocked) actorData.matrix.isLinkLocked = false
      //Reset Jamming
      if (actorData.matrix.isJamming) actorData.matrix.isJamming = false

      // Reset Matrix Programs
      if (actorData.matrix.programsCurrentActive) {
        actorData.matrix.programsCurrentActive.value = 0
        actorData.matrix.programsCurrentActive.modifiers = []
      }
      if (actorData.matrix.programsMaximumActive) {
        actorData.matrix.programsMaximumActive.value = 0
        actorData.matrix.programsMaximumActive.modifiers = []
      }
      if (actorData.matrix.programs) {
        for (let key of Object.keys(SR5.programs)) {
          actorData.matrix.programs[key].isActive = false
        }
      }

      // Reset Matrix Resistances
      for (let key of Object.keys(SR5.matrixResistances)) {
        actorData.matrix.resistances[key].dicePool = 0
        actorData.matrix.resistances[key].modifiers = []
      }

      // Reset Matrix Noise
      if (actorData.matrix.noise) {
        actorData.matrix.noise.value = 0
        actorData.matrix.noise.modifiers = []
      }

      // Reset Matrix Marks
      // An AI outside any device keeps the marks placed on its persona, which no device carries (Data Trails p. 157)
      if (actorData.matrix.marks && !this.isDevicelessAI(actor)) actorData.matrix.marks = []

      // Reset Matrix Actions
      if (actorData.matrix.actions) {
        for (let key of Object.keys(SR5.matrixRolledActions)) {
          actorData.matrix.actions[key].test.base = 0
          actorData.matrix.actions[key].test.dicePool = 0
          actorData.matrix.actions[key].test.modifiers = []
          actorData.matrix.actions[key].limit.value = 0
          actorData.matrix.actions[key].limit.modifiers = []
          actorData.matrix.actions[key].defense.base = 0
          actorData.matrix.actions[key].defense.dicePool = 0
          actorData.matrix.actions[key].defense.modifiers = []
        }
      }

      // Reset Resonance Actions
      if (actorData.matrix.resonanceActions) {
        for (let key of Object.keys(SR5.resonanceActions)) {
          if (actorData.matrix.resonanceActions[key].test) {
            actorData.matrix.resonanceActions[key].test.dicePool = 0
            actorData.matrix.resonanceActions[key].test.modifiers = []
          }
          if (actorData.matrix.resonanceActions[key].limit) {
            actorData.matrix.resonanceActions[key].limit.value = 0
            actorData.matrix.resonanceActions[key].limit.modifiers = []
          }
        }
      }

      // Reset Concentration
      actorData.matrix.concentration = false
      actorData.matrix.complexFormList = {
      }

      //Reset public grid if Grid rules are not active
      if (!game.settings.get("sr5", "sr5MatrixGridRules")) {
        actorData.matrix.userGrid = "local"
      }

      //Reset connected Objects
      if (actorData.matrix.connectedObject) {
        actorData.matrix.connectedObject.augmentations = {
        }
        actorData.matrix.connectedObject.weapons = {
        }
        actorData.matrix.connectedObject.armors = {
        }
        actorData.matrix.connectedObject.gears = {
        }
        actorData.matrix.connectedObject.vehicles = {
        }
      }

      //Reset potential PanO Objects
      if (actorData.matrix.potentialPanObject) {
        actorData.matrix.potentialPanObject.augmentations = {
        }
        actorData.matrix.potentialPanObject.weapons = {
        }
        actorData.matrix.potentialPanObject.armors = {
        }
        actorData.matrix.potentialPanObject.gears = {
        }
        actorData.matrix.potentialPanObject.vehicles = {
        }
      }

      //Reset regiseterd sprite
      actorData.matrix.registeredSprite.current = 0
    }

    if (actorData.magic) {

      // Reset Concentration
      actorData.magic.concentration = false
      actorData.magic.spellList = {
      }

      // Reset Elements
      for (let key of Object.keys(SR5.spellCategories)) {
        actorData.magic.elements[key] = ""
      }

      // Reset Astral Damage
      actorData.magic.astralDamage.value = 0
      actorData.magic.astralDamage.modifiers = []

      // Reset Astral Defense
      actorData.magic.astralDefense.dicePool = 0
      actorData.magic.astralDefense.modifiers = []

      // Reset Astral Tracking
      actorData.magic.astralTracking.dicePool = 0
      actorData.magic.astralTracking.modifiers = []

      // Reset Magic Barrier Traversal
      actorData.magic.passThroughBarrier.dicePool = 0
      actorData.magic.passThroughBarrier.modifiers = []

      // Reset Power Points
      actorData.magic.powerPoints.value = 0
      actorData.magic.powerPoints.modifiers = []
      actorData.magic.powerPoints.maximum.value = 0
      actorData.magic.powerPoints.maximum.modifiers = []

      // Reset Drain Resistance
      actorData.magic.drainResistance.dicePool = 0
      actorData.magic.drainResistance.modifiers = []
      actorData.magic.drainResistance.linkedAttribute = ""

      // Reset Possession
      actorData.magic.possession = false
      actorData.magic.mentorMask = false

      // Astral and Wild Reputation (Street Grimoire p. 207, Forbidden Arcana p. 170), derived from the indexes,
      // which the gamemaster's ledger holds and not the sheet (system/spirit-ledger.js)
      applyCharacterLedger(actor, ELEMENTAL_SPIRIT_TYPES)
      actorData.magic.astralReputation = astralReputation(actorData.magic.spiritIndex, actorData.magic.astralReputationAdjustment)
      actorData.magic.wildReputation = wildReputation(actorData.magic.wildIndex)

      // Reset counterspelling
      actorData.magic.counterSpellPool.value = 0
      actorData.magic.counterSpellPool.modifiers = []

      //Reset bounded spirit
      actorData.magic.boundedSpirit.current = 0

      //Reset metamagic
      actorData.magic.metamagics.centering = false
      actorData.magic.metamagics.quickening = false
      actorData.magic.metamagics.shielding = false
      actorData.magic.metamagics.spellShaping = false
      actorData.magic.metamagics.structuredSpellcasting = false
      actorData.magic.metamagics.harmoniousDefense = false
      actorData.magic.metamagics.centeringValue.value = 0
      actorData.magic.metamagics.centeringValue.modifiers = []
      actorData.magic.metamagics.spellShapingValue.value = 0
      actorData.magic.metamagics.spellShapingValue.modifiers = []

      //Reset magical masteries (Forbidden Arcana p. 30-41)
      for (let mastery of Object.values(actorData.magic.masteries || {
      })) {
        mastery.value = 0
        mastery.modifiers = []
      }

      //Reset background count
      actorData.magic.bgCount.value = 0
      actorData.magic.bgCount.modifiers = []

      //Reset grey mana (Better Than Bad p. 140)
      if (actorData.magic.greyMana) {
        actorData.magic.greyMana.value = 0
        actorData.magic.greyMana.modifiers = []
        actorData.magic.greyMana.fromArmor = false
      }
    }

    // Reset Monitors
    if (actorData.conditionMonitors) {
      for (let key of Object.keys(SR5.monitorTypes)) {
        if (actorData.conditionMonitors[key]) {
          actorData.conditionMonitors[key].value = 0
          actorData.conditionMonitors[key].modifiers = []
          actorData.conditionMonitors[key].actual.value = 0
          actorData.conditionMonitors[key].actual.modifiers = []
          if (actorData.conditionMonitors[key].actual.base < 0) actorData.conditionMonitors[key].actual.base = 0
        }
      }
    }

    // Reset Karma
    if (actorData.karma) {
      actorData.karma.value = 0
      actorData.karma.modifiers = []
    }

    // Reset Reputation
    if (actorData.notoriety) {
      actorData.notoriety.value = 0
      actorData.notoriety.modifiers = []
    }

    if (actorData.streetCred) {
      actorData.streetCred.value = 0
      actorData.streetCred.modifiers = []
    }

    if (actorData.publicAwareness) {
      actorData.publicAwareness.value = 0
      actorData.publicAwareness.modifiers = []
    }

    // Reset Nuyen
    if (actorData.nuyen) {
      actorData.nuyen.value = 0
      actorData.nuyen.modifiers = []
    }
  }

  ///////////////////////////////////////

  static updateActions(actor) {
    for (let key of Object.keys(SR5.actionTypes)) {
      if (actor.system.specialProperties.actions[key]) SR5_EntityHelpers.updateValue(actor.system.specialProperties.actions[key])
    }

  }

  static updateNuyens(actor) {
    SR5_EntityHelpers.updateValue(actor.system.nuyen)
  }

  static updateKarmas(actor) {
    SR5_EntityHelpers.updateValue(actor.system.karma)
    let karmaGained = SR5_EntityHelpers.modifiersOnlyPositivesSum(actor.system.karma.modifiers)
    // Karma / 10 (SR5 p. 372); a quality can raise the divisor (Assassin's Primer p. 15, Consummate Professional: / 20)
    let divisor = 10 + SR5_EntityHelpers.modifiersSum(actor.system.specialProperties?.streetCredDivisor?.modifiers || [])
    if (divisor < 1) divisor = 1
    if (karmaGained >= divisor) SR5_EntityHelpers.updateModifier(actor.system.streetCred, `${game.i18n.localize('SR5.KarmaGained')}`, "karma", Math.floor(karmaGained / divisor), false, true)
  }

  static updateNotoriety(actor) {
    SR5_EntityHelpers.updateValue(actor.system.notoriety)
    if (actor.system.notoriety.value < 0) {
      SR5_EntityHelpers.updateModifier(actor.system.streetCred, `${game.i18n.localize('SR5.ReputationNotorietyNegative')}`, "notoriety", -actor.system.notoriety.value, false, true)
      SR5_CharacterUtility.updateStreetCred(actor)
      actor.system.notoriety.value = 0
    }
  }

  static updateStreetCred(actor) {
    SR5_EntityHelpers.updateValue(actor.system.streetCred)
  }

  static updatePublicAwareness(actor) {
    SR5_EntityHelpers.updateValue(actor.system.publicAwareness)
  }

  //Return the metatype of a character. Every actor now holds it in 'metatype' ; 'characterMetatype'
  //is the legacy key the migration renames, still read for an actor not migrated yet. Reading only
  //one of the two leaves such a character without its metatype, and so without the vision that
  //metatype is owed (SR5 p. 68). 'metatype' comes first : it is the field the sheets write.
  static getMetatype(actor) {
    const biography = actor?.system?.biography
    return biography?.metatype || biography?.characterMetatype || ""
  }

  static applyRacialModifers(actor) {
    let actorData = actor.system
    const metatype = this.getMetatype(actor)
    if (!metatype) return
    let label = `${game.i18n.localize(SR5.metatypes[metatype])}`

    switch (metatype) {
      case "human":
        break
      case "elf":
        this.grantMetatypeVision(actor, "lowLight")
        if (actor.type === "actorGrunt") {
          SR5_EntityHelpers.updateModifier(actorData.attributes.agility.natural, label, "metatype", 1)
          SR5_EntityHelpers.updateModifier(actorData.attributes.charisma.natural, label, "metatype", 2)
        }
        break
      case "dwarf":
        // Lifestyle cost +20 %: lifestyle-metatype.js
        this.grantMetatypeVision(actor, "thermographic")
        for (let vector of Object.keys(SR5.propagationVectors)) {
          SR5_EntityHelpers.updateModifier(actorData.resistances.disease[vector], label, "metatype", 2)
          SR5_EntityHelpers.updateModifier(actorData.resistances.toxin[vector], label, "metatype", 2)
        }
        if (actor.type === "actorGrunt") {
          SR5_EntityHelpers.updateModifier(actorData.attributes.body.natural, label, "metatype", 2)
          SR5_EntityHelpers.updateModifier(actorData.attributes.reaction.natural, label, "metatype", -1)
          SR5_EntityHelpers.updateModifier(actorData.attributes.strength.natural, label, "metatype", 2)
          SR5_EntityHelpers.updateModifier(actorData.attributes.willpower.natural, label, "metatype", 1)
        }
        break
      case "ork":
        this.grantMetatypeVision(actor, "lowLight")
        if (actor.type === "actorGrunt") {
          SR5_EntityHelpers.updateModifier(actorData.attributes.body.natural, label, "metatype", 3)
          SR5_EntityHelpers.updateModifier(actorData.attributes.strength.natural, label, "metatype", 2)
          SR5_EntityHelpers.updateModifier(actorData.attributes.logic.natural, label, "metatype", -1)
          SR5_EntityHelpers.updateModifier(actorData.attributes.charisma.natural, label, "metatype", -1)
        }
        break
      case "troll":
        // Lifestyle cost +100 %: lifestyle-metatype.js
        this.grantMetatypeVision(actor, "thermographic")
        SR5_EntityHelpers.updateModifier(actorData.reach, label, "metatype", 1)
        SR5_EntityHelpers.updateModifier(actorData.resistances.physicalDamage, label, "metatype", 1)
        if (actor.type === "actorGrunt") {
          SR5_EntityHelpers.updateModifier(actorData.attributes.body.natural, label, "metatype", 4)
          SR5_EntityHelpers.updateModifier(actorData.attributes.agility.natural, label, "metatype", -1)
          SR5_EntityHelpers.updateModifier(actorData.attributes.strength.natural, label, "metatype", 4)
          SR5_EntityHelpers.updateModifier(actorData.attributes.logic.natural, label, "metatype", -1)
          SR5_EntityHelpers.updateModifier(actorData.attributes.intuition.natural, label, "metatype", -1)
          SR5_EntityHelpers.updateModifier(actorData.attributes.charisma.natural, label, "metatype", -2)
        }
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown metatype '${metatype}' in 'applyRacialModifers()'`)
        return
    }
  }

  //Cut what an attribute gains over its cap (world setting, SR5 p. 96 by default). The help of the
  //augmented rating lists the cut with the real and the kept values. updateAttributes runs again
  //after the armor encumbrance, so the previous cut is removed first.
  static applyAugmentationCap(actor, key) {
    let augmented = actor.system.attributes[key].augmented
    augmented.modifiers = augmented.modifiers.filter(m => m.type !== "augmentationCap")
    SR5_EntityHelpers.updateValue(augmented, 0)
    let mode = "bonus"
    try {
      mode = game.settings.get("sr5", "sr5AugmentationCap")
    } catch {
      //setting not registered yet: the book
    }
    const real = augmented.value
    const items = Array.from(actor.items ?? [])
    const effectsOf = i => Object.values(i.system?.customEffects ?? {
    })
    //The Increase Attribute spell and the Attribute Boost adept power reach the attribute through an
    //itemEffect named after them (applyExternalEffect), whose own type is the item that cast it
    const boostNames = items.filter(i => i.type === "itemEffect" && ["itemSpell", "itemAdeptPower"].includes(i.system?.type) &&
      effectsOf(i).some(e => e.target === `system.attributes.${key}.augmented`)).map(i => i.name)
    //Improved Physical Attribute (SR5 p. 312) goes "up to the augmented maximum" too: an active adept power whose own
    //custom effect raises the attribute
    boostNames.push(...items.filter(i => i.type === "itemAdeptPower" && i.system?.isActive &&
      effectsOf(i).some(e => e.target === `system.attributes.${key}.augmented`)).map(i => i.name))
    //Exceptional Attribute (SR5 p. 68) raises the natural maximum by 1: the qualities of the
    //compendiums carry it as a custom effect on system.attributes.<key>.maximum
    const exceptional = items.filter(i => i.type === "itemQuality").flatMap(effectsOf)
      .filter(e => e.target === `system.attributes.${key}.maximum`).reduce((sum, e) => sum + (Number(e.value) || 0), 0)
    //Possession (choix technique d'Élise): the spirit's attributes replace the host's, it is not an
    //augmentation in the sense of SR5 p. 96 (cyberware, bioware, magic), so it stays out of the cap
    const gains = augmented.modifiers.filter(m => !m.isMultiplier && m.value > 0 && m.type !== "possession")
    const gain = gains.reduce((sum, m) => sum + m.value, 0)
    //Seen in game: the modifier carries the type of the casting item (itemSpell, itemAdeptPower), not itemEffect
    const boostGain = gains.filter(m => ["itemEffect", "itemSpell", "itemAdeptPower"].includes(m.type) && boostNames.includes(m.source)).reduce((sum, m) => sum + m.value, 0)
    const {
      capExcess, boostExcess, unknownMetatype
    } = augmentationCapExcess({
      mode, metatype: this.getMetatype(actor), key, natural: actor.system.attributes[key].natural.value, gain, boostGain, exceptional
    })
    const cut = (value, reason) => SR5_EntityHelpers.updateModifier(augmented, game.i18n.format("SR5.AugmentationCapModifier", {
      real, kept: real - capExcess - boostExcess, reason: game.i18n.localize(reason)
    }), "augmentationCap", -value)
    if (capExcess > 0) cut(capExcess, `SR5.AugmentationCapReason_${mode}`)
    if (boostExcess > 0) cut(boostExcess, "SR5.AugmentationCapReason_boost")
    //No table maximum for this metatype: nothing is cut, and the help says why
    if (unknownMetatype && gain > 0) SR5_EntityHelpers.updateModifier(augmented, game.i18n.localize("SR5.AugmentationCapUnknownMetatype"), "augmentationCap", 0)
    SR5_EntityHelpers.updateValue(augmented, 0)
  }

  // Update Attributes
  static updateAttributes(actor) {
    let actorData = actor.system, list

    if (actor.type == "actorDrone") {
      list = SR5.vehicleAttributes
    } else {
      list = SR5.characterAttributes
    }

    for (let key of Object.keys(list)) {
      SR5_EntityHelpers.updateValue(actorData.attributes[key].natural, 0)
      actorData.attributes[key].augmented.base = actorData.attributes[key].natural.value
      SR5_EntityHelpers.updateValue(actorData.attributes[key].augmented, 0)
      if (actor.type === "actorPc" || actor.type === "actorGrunt") this.applyAugmentationCap(actor, key)
    }

    if (actorData.initiatives.astralInit?.isActive && (actor.type == "actorPc" || actor.type == "actorGrunt")) {
      actorData.attributes.agility.augmented = actorData.attributes.logic.augmented
      actorData.attributes.body.augmented = actorData.attributes.willpower.augmented
      actorData.attributes.reaction.augmented = actorData.attributes.intuition.augmented
      actorData.attributes.strength.augmented = actorData.attributes.charisma.augmented
    }

  }

  // AI (Data Trails p. 152): an AI is a PC or grunt sheet whose active special attribute is Depth
  static isDepthActive(actor) {
    return (actor.type === "actorPc" || actor.type === "actorGrunt") && actor.system?.activeSpecialAttribute === "depth"
  }

  // AI outside any device (Data Trails p. 157): a persona alone, with no active device
  static isDevicelessAI(actor) {
    return this.isDepthActive(actor) && !actor.items.some(i => i.type === "itemDevice" && i.system.isActive)
  }

  // SR5 p. 229: each value of the active cyberdeck's attribute array must be assigned to a matrix attribute
  static isDeckUnconfigured(actorData) {
    if (actorData.matrix?.deviceType !== "cyberdeck") return false
    const collection = actorData.matrix.attributesCollection ?? {
    }
    return [1, 2, 3, 4].some(i => collection[`value${i}`] > 0 && !collection[`value${i}isSet`])
  }

  // Data Trails p. 157: the attribute an AI outside any device defends with where the defense calls for Logic
  static devicelessAILogicStandIn(actorData) {
    let intuition = actorData.attributes.intuition.augmented.value,
      willpower = actorData.attributes.willpower.augmented.value
    switch (game.settings.get("sr5", "sr5DevicelessAILogicDefense")) {
      case "intuition": return {
        label: "SR5.Intuition", value: intuition
      }
      case "willpower": return {
        label: "SR5.Willpower", value: willpower
      }
      default: return intuition >= willpower ? {
        label: "SR5.Intuition", value: intuition
      } : {
        label: "SR5.Willpower", value: willpower
      }
    }
  }

  // The book sets no cap of its own on an AI's active programs (Data Trails p. 151-161 is silent).
  // DjamZ's ruling: the smaller of Depth x 2 and the slots of the device the AI runs on
  static aiProgramCap(depth, deviceSlots) {
    return Math.min(depth * 2, deviceSlots)
  }

  // Apply DjamZ's ruling to an AI on a device: when Depth x 2 is the lower, it replaces the device as the cap
  static applyAIProgramCap(actor) {
    if (!this.isDepthActive(actor)) return
    let max = actor.system.matrix.programsMaximumActive
    let depth = actor.system.specialAttributes.depth?.augmented.value || 0
    // generateMatrixAttributes runs first in prepareEmbeddedDocuments, before updateSpecialAttributes, so Depth is still 0;
    // it runs again in updateItems with the real Depth: drop what the earlier call wrote
    let others = max.modifiers.filter(m => m.details !== "aiProgramCap" && m.type !== "device" && m.type !== "deviceRating")
    let deviceMods = max.modifiers.filter(m => m.type === "device" || m.type === "deviceRating")
    let slots = deviceMods.reduce((sum, m) => sum + m.value, 0)
    if (this.aiProgramCap(depth, slots) === slots) max.modifiers = [...deviceMods, ...others]
    else {
      max.modifiers = others
      SR5_EntityHelpers.updateModifier(max, `${game.i18n.localize('SR5.Depth')} ${depth} × 2`, "linkedAttribute", depth * 2, false, true, "aiProgramCap")
    }
    SR5_EntityHelpers.updateValue(max, 0)
  }

  // Warning shown when an AI loads one program too many. DjamZ's ruling: it warns and does not block.
  // An AI outside any device cannot load programs at all (Data Trails p. 157). Other actors are left alone
  static aiProgramCapWarning(actor) {
    if (!this.isDepthActive(actor)) return null
    if (this.isDevicelessAI(actor)) return game.i18n.localize('SR5.AIProgramsNoDevice')
    let current = actor.system.matrix.programsCurrentActive.value, max = actor.system.matrix.programsMaximumActive.value
    if (current + 1 <= max) return null
    return game.i18n.format('SR5.AIProgramsCapReached', {
      current: current + 1, max
    })
  }

  // An AI outside any device resists matrix damage with no device and no Firewall. The book gives it no pool
  // (Data Trails p. 157 and 161): it resists with the attribute it defends with where the defense calls for Logic.
  static generateDevicelessAIMatrixResistance(actor) {
    let matrixDamage = actor.system.matrix.resistances.matrixDamage
    let standIn = this.devicelessAILogicStandIn(actor.system)
    matrixDamage.base = 0
    SR5_EntityHelpers.updateModifier(matrixDamage, game.i18n.localize(standIn.label), "linkedAttribute", standIn.value)
    SR5_EntityHelpers.updateDicePool(matrixDamage)
  }

  // Update Actors Special Attributes
  static updateSpecialAttributes(actor) {
    let actorData = actor.system

    for (let key of Object.keys(SR5.characterSpecialAttributes)) {
      if (actorData.specialAttributes[key]) {
        SR5_EntityHelpers.updateValue(actorData.specialAttributes[key].natural, 0)

        actorData.specialAttributes[key].augmented.base = actorData.specialAttributes[key].natural.value
        SR5_EntityHelpers.updateValue(actorData.specialAttributes[key].augmented, 0)

        // KEEP IN STEP with mentorMagic() (modules/entities/items/mentor-spirits.js), which works out the same Magic
        // earlier, to tell whether a mentor lies dormant: never change one of the two without the other
        if ((key == 'magic' || key == 'resonance') && actorData.essence) {
          let edgeLoss = 0
          for (let m of actorData.essence.modifiers) {
            if (m.type === 'itemAugmentation') edgeLoss += m.value
          }
          if (edgeLoss < 0) {
            SR5_EntityHelpers.updateModifier(actorData.specialAttributes[key].augmented, game.i18n.localize('SR5.EssenceLoss'), "augmentations", Math.floor(edgeLoss))
            //Cyberadept daemon (Kill Code p. 100): the Resonance lost to cyberware alone comes back, up to half the
            //submersion grade rounded up
            if (key == 'resonance') {
              const cyberwareLost = actor.items.filter(i => i.type === "itemAugmentation" && i.system.type === "cyberware" && !i.system.isAccessory)
                .reduce((sum, i) => sum + (Number(i.system.essenceCost?.value) || 0), 0)
              const restored = resonanceRestoredByStream(streamOf(actor), actorData.matrix?.submersionGrade, -edgeLoss, cyberwareLost)
              if (restored) SR5_EntityHelpers.updateModifier(actorData.specialAttributes[key].augmented, game.i18n.localize('SR5.StreamCyberadept'), "technomancerStream", restored)
            }
            SR5_EntityHelpers.updateValue(actorData.specialAttributes[key].augmented, 0)
          }
        }

        // BTB p. 142: "en plus de la perte de Magie due à la réduction d'Essence, les personnages Éveillés
        // perdent un point de Magie supplémentaire […] par implant GreyWare installé". On top of the Essence
        // loss above, which already counts the implant's Essence, so nothing is counted twice. Derived from
        // the implants themselves: removing one gives the point back (DjamZ's ruling, 2026-10-05).
        if (key == 'magic' && actorData.specialAttributes.magic.natural.value > 0) {
          const penalty = SR5ShopGrades.greywareMagicPenalty(actor.items)
          if (penalty) {
            SR5_EntityHelpers.updateModifier(actorData.specialAttributes.magic.augmented, game.i18n.localize('SR5.GreywareMagicLoss'), "greyware", -penalty)
            SR5_EntityHelpers.updateValue(actorData.specialAttributes.magic.augmented, 0)
          }
        }
      }
    }

    if (actor.type === "actorPc" || actor.type === "actorGrunt") {
      // Check Magic/Resonance Actor Sheet Display (and Default to Magic)
      if (!actorData.activeSpecialAttribute) actorData.activeSpecialAttribute = "magic"

      // AI (Data Trails p. 152): Depth is the maximum Edge rating
      if (actorData.activeSpecialAttribute === "depth" && actorData.specialAttributes.depth) {
        let depth = actorData.specialAttributes.depth.augmented.value, edge = actorData.specialAttributes.edge.augmented
        if (edge.value > depth) {
          SR5_EntityHelpers.updateModifier(edge, game.i18n.localize('SR5.DepthEdgeMax'), "linkedAttribute", depth - edge.value)
          SR5_EntityHelpers.updateValue(edge, 0)
        }
      }

      // Update encumbrance
      let armorAccessoriesModifiers = actorData.itemsProperties.armor.modifiers.filter(m => m.type == "armorAccessory")
      if (armorAccessoriesModifiers) {
        let totalArmorAccessoriesValue = SR5_EntityHelpers.modifiersSum(armorAccessoriesModifiers)
        if (totalArmorAccessoriesValue > actorData.attributes.strength.augmented.value + 1) {
          let armorPenalty = Math.floor((totalArmorAccessoriesValue - actorData.attributes.strength.augmented.value) / 2)
          SR5_EntityHelpers.updateModifier(actorData.attributes.agility.augmented, game.i18n.localize('SR5.ArmorEncumbrance'), 'armorEncumbrance', -1 * armorPenalty)
          SR5_EntityHelpers.updateModifier(actorData.attributes.reaction.augmented, game.i18n.localize('SR5.ArmorEncumbrance'), 'armorEncumbrance', -1 * armorPenalty)
          this.updateAttributes(actor)
        }
      }
    }
  }

  // Generate Essence
  static updateEssence(actor) {
    const essence = actor.system.essence
    // Typed as the implants are, so the Magic and Resonance lost with the Essence count them (updateSpecialAttributes)
    // Prototype de transhumain (Chrome Flesh p. 57): its bioware costs no Essence, up to its point
    // KEEP IN STEP with essenceAdjustment() (implant-essence.js), which mentorMagic() reads earlier
    const gift = transhumanGift(actor.items)
    if (gift?.used) SR5_EntityHelpers.updateModifier(essence, gift.name, "itemAugmentation", gift.used)
    // Faille d'Essence what a removed implant took stays lost (SR5 p. 53), filled under the Faille d'Essence (Chrome Flesh p. 74)
    essence.hole = currentEssenceHole(actor)
    if (essence.hole)SR5_EntityHelpers.updateModifier(essence, game.i18n.localize("SR5.EssenceHole"), "itemAugmentation", -essence.hole)
    SR5_EntityHelpers.updateValue(essence)
  }

  static applyMysticAptitude(actor) {
    const actorData = actor.system, levels = {
    }
    for (const attribute of MYSTIC_APTITUDE_ATTRIBUTES) {
      const property = actorData.specialProperties?.[mysticAptitudeKey(attribute)]
      if (!property) continue
      SR5_EntityHelpers.updateValue(property, 0)
      levels[attribute] = property.value
    }
    const aptitude = mysticAptitudeChoice(levels)
    const augmented = aptitude ? actorData.attributes?.[aptitude.attribute]?.augmented : null
    if (!augmented || !actorData.specialAttributes?.magic) return
    const value = mysticAptitudeValue(actorData.specialAttributes.magic.augmented, aptitude.level)
    augmented.modifiers.push({
      source: game.i18n.localize("SR5.AdeptPowerMysticAptitude"), type: "adeptPower", value: value - augmented.value, isMultiplier: false, replace: true
    })
    augmented.value = value
  }

  // Generate Special Properties
  static updateSpecialProperties(actor) {
    let actorData = actor.system
    let hardenedArmors = actorData.specialProperties.hardenedArmors

    //Mystic Aptitude (Better Than Bad p. 143): Magic (without power focus) + level stands in for the Physical Attribute
    //chosen, once the Magic is known and before the limits, Initiative and dice pools that read it (not the monitors)
    this.applyMysticAptitude(actor)

    //Hardened Armors
    for (let key of Object.keys(SR5.hardenedArmorTypes)) {
      //Special = for hardened armor values linked to an attributes
      for (let m of hardenedArmors[key].modifiers) {
        if (m.details) {
          switch (m.details.type) {
            case "essence":
              m.value = actorData.essence.value
              break
            case "essenceX2":
              m.value = actorData.essence.value * 2
              break
            case "willpower":
              m.value = actorData.attributes.willpower.augmented.value
              break
            case "body":
              m.value = actorData.attributes.body.augmented.value
              break
            //A fixed value put on the target by a spell: Pétrification's barrier armor (magic-supplements-rules.js)
            case "value":
              m.value = Number(m.details.value) || 0
              break
          }
        }
      }

      //Updates hardened armors values
      SR5_EntityHelpers.updateValue(hardenedArmors[key])

      //Update resistance linked to hardened armor
      switch (key) {
        case "normalWeapon":
          actorData.itemsProperties.armor.modifiers = actorData.itemsProperties.armor.modifiers.concat(hardenedArmors[key].modifiers)
          break
        case "astral":
          actorData.resistances.astralDamage.modifiers = actorData.resistances.astralDamage.modifiers.concat(hardenedArmors[key].modifiers)
          break
        case "fire":
        case "cold":
          actorData.resistances.specialDamage[key].modifiers = actorData.resistances.specialDamage[key].modifiers.concat(hardenedArmors[key].modifiers)
          break
        case "toxins":
          actorData.resistances.toxin.contact.modifiers = actorData.resistances.toxin.contact.modifiers.concat(hardenedArmors[key].modifiers)
          actorData.resistances.toxin.ingestion.modifiers = actorData.resistances.toxin.ingestion.modifiers.concat(hardenedArmors[key].modifiers)
          actorData.resistances.toxin.inhalation.modifiers = actorData.resistances.toxin.inhalation.modifiers.concat(hardenedArmors[key].modifiers)
          actorData.resistances.toxin.injection.modifiers = actorData.resistances.toxin.injection.modifiers.concat(hardenedArmors[key].modifiers)
          break
      }
    }

    // Dice on every toxin resistance (Increased Stress, The Complete Trog p. 180), whatever the vector
    if (actorData.resistances?.toxin && actorData.specialProperties.toxinResistance?.modifiers.length) {
      for (let vector of Object.keys(SR5.propagationVectors)) {
        actorData.resistances.toxin[vector].modifiers = actorData.resistances.toxin[vector].modifiers.concat(actorData.specialProperties.toxinResistance.modifiers)
      }
    }

    if (actorData.specialProperties.fullDefenseAttribute) {
      if (actorData.specialProperties.fullDefenseAttribute === "perception" || actorData.specialProperties.fullDefenseAttribute === "gymnastics") {
        actorData.specialProperties.fullDefenseValue = actorData.skills[actorData.specialProperties.fullDefenseAttribute].rating.value
      } else actorData.specialProperties.fullDefenseValue = actorData.attributes[actorData.specialProperties.fullDefenseAttribute].augmented.value
    }

    //Echo Possession de la machine (SR5 p. 261): the benefit of a control rig of rating 1 to 3, the higher of the two
    //when the technomancer also has one
    const machineMind = machineMindRating(actor)
    const controlRig = actorData.specialProperties.controlRig
    if (machineMind && controlRig) {
      const implanted = controlRig.modifiers.reduce((sum, m) => sum + (Number(m.value) || 0), 0)
      if (machineMind > implanted) SR5_EntityHelpers.updateModifier(controlRig, game.i18n.localize('SR5.EchoMachineMind'), "echo", machineMind - implanted)
    }

    for (let key of Object.keys(SR5.specialProperties)) {
      if (actorData.specialProperties[key]) {
        SR5_EntityHelpers.updateValue(actorData.specialProperties[key])
      }
    }
  }

  // Generate Actor Derived Attributes
  static updateDerivedAttributes(actor) {
    let derivedAttributes = actor.system.derivedAttributes,
      attributes = actor.system.attributes

    for (let key of Object.keys(SR5.characterDerivedAttributes)) {
      derivedAttributes[key].base = 0
      switch (key) {
        case "composure":
          SR5_EntityHelpers.updateModifier(derivedAttributes[key], game.i18n.localize('SR5.Charisma'), "linkedAttribute", attributes.charisma.augmented.value)
          SR5_EntityHelpers.updateModifier(derivedAttributes[key], game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
          break
        case "judgeIntentions":
          SR5_EntityHelpers.updateModifier(derivedAttributes[key], game.i18n.localize('SR5.Charisma'), "linkedAttribute", attributes.charisma.augmented.value)
          SR5_EntityHelpers.updateModifier(derivedAttributes[key], game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
          break
        case "memory":
          SR5_EntityHelpers.updateModifier(derivedAttributes[key], game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
          SR5_EntityHelpers.updateModifier(derivedAttributes[key], game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
          break
        case "surprise":
          SR5_EntityHelpers.updateModifier(derivedAttributes[key], game.i18n.localize('SR5.Reaction'), "linkedAttribute", attributes.reaction.augmented.value)
          SR5_EntityHelpers.updateModifier(derivedAttributes[key], game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
          break
        default:
          SR5_SystemHelpers.srLog(1, `Unknown derived attribute '${key}' in 'updateDerivedAttributes()'`)
      }
      this.applyPenalty("condition", derivedAttributes[key], actor)
      this.applyPenalty("matrix", derivedAttributes[key], actor)
      this.applyPenalty("magic", derivedAttributes[key], actor)
      this.applyPenalty("special", derivedAttributes[key], actor)
      SR5_EntityHelpers.updateDicePool(derivedAttributes[key], 0)
    }
  }

  // Generate Actors Recoil Compensation
  static updateRecoil(actor) {
    if (actor.type === "actorDrone") actor.system.recoilCompensation.base = actor.system.attributes.body.augmented.value
    else actor.system.recoilCompensation.base = strengthRecoil(actor.system.attributes.strength.augmented.value)

    SR5_EntityHelpers.updateValue(actor.system.recoilCompensation)
  }

  // Generate  Actors Weights Actions
  static updateEncumbrance(actor) {
    let attributes = actor.system.attributes,
      weightActions = actor.system.weightActions

    for (let key of Object.keys(SR5.weightActions)) {
      switch (key) {
        case "carry":
          weightActions[key].baseWeight.base = attributes.strength.augmented.value * 10
          weightActions[key].extraWeight.base = 10
          break
        case "lift":
          weightActions[key].baseWeight.base = attributes.strength.augmented.value * 15
          weightActions[key].extraWeight.base = 15
          break
        case "liftAboveHead":
          weightActions[key].baseWeight.base = attributes.strength.augmented.value * 5
          weightActions[key].extraWeight.base = 5
          break
        default:
          SR5_SystemHelpers.srLog(1, `Unknown weights action '${key}' in 'updateEncumbrance()'`)
      }
      SR5_EntityHelpers.updateValue(weightActions[key].baseWeight)
      SR5_EntityHelpers.updateValue(weightActions[key].extraWeight)
      weightActions[key].test.base = 0
      SR5_EntityHelpers.updateModifier(weightActions[key].test, game.i18n.localize('SR5.Strength'), "linkedAttribute", attributes.strength.augmented.value)
      SR5_EntityHelpers.updateModifier(weightActions[key].test, game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
      this.applyPenalty("condition", weightActions[key].test, actor)
      this.applyPenalty("matrix", weightActions[key].test, actor)
      this.applyPenalty("magic", weightActions[key].test, actor)
      this.applyPenalty("special", weightActions[key].test, actor)
      SR5_EntityHelpers.updateDicePool(weightActions[key].test, 0)
    }
  }

  // Handle Actors Movement
  // Running modifiers (SR5 p. 179, 188, 190) are offered by the roll dialog, see modules/system/running.js; the
  // movement modifiers of Run & Gun come on top of them (rg-combat-options.js)
  static updateMovements(actor) {
    let movements = actor.system.movements,
      attributes = actor.system.attributes,
      skills = actor.system.skills,
      biography = actor.system.biography

    //Manage walk and run multiplier
    SR5_EntityHelpers.updateValue(movements.walk.multiplier)
    SR5_EntityHelpers.updateValue(movements.run.multiplier)

    for (let key of Object.keys(SR5.movements)) {
      movements[key].movement.base = 0
      switch (key) {
        case "fly":
          if (actor.type == "actorSpirit") {
            movements[key].extraMovement.base = 5
          }
          if (skills.flight?.rating?.value > 0) {
            SR5_EntityHelpers.updateModifier(movements[key].movement, game.i18n.localize('SR5.Agility'), "linkedAttribute", attributes.agility.augmented.value * movements.run.multiplier.value)
            // Flight is an Agility skill
            SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Agility'), "linkedAttribute", attributes.agility.augmented.value)
            SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillFly'), "skillRating", skills.flight.rating.value)
            // Flight movement: x2/x4/+3 (sprint +3m per hit)
            movements[key].extraMovement.base = 3
          }
          break
        case "verticalJump": {
          let height = (biography && biography.characterHeight ? biography.characterHeight / 100 : 1)
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Agility'), "linkedAttribute", attributes.agility.augmented.value)
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillGymnastics'), "skillRating", skills.gymnastics.rating.value)
          movements[key].extraMovement.base = 0.5
          movements[key].max = SR5_EntityHelpers.roundDecimal(1.5 * height, 2)
          break
        }
        case "horizontalJumpStanding":
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Agility'), "linkedAttribute", attributes.agility.augmented.value)
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillGymnastics'), "skillRating", skills.gymnastics.rating.value)
          movements[key].extraMovement.base = 1
          movements[key].maximum.base = Math.ceil(1.5 * attributes.agility.augmented.value)
          break
        case "horizontalJumpRunning":
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Agility'), "linkedAttribute", attributes.agility.augmented.value)
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillGymnastics'), "skillRating", skills.gymnastics.rating.value)
          movements[key].extraMovement.base = 2
          movements[key].maximum.base = Math.ceil(1.5 * attributes.agility.augmented.value)
          break
        case "holdBreath":
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillSwimming'), "skillRating", skills.swimming.rating.value)
          movements[key].movement.base = 60
          movements[key].extraMovement.base = 15
          break
        case "run":
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Strength'), "linkedAttribute", attributes.strength.augmented.value)
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillRunning'), "skillRating", skills.running.rating.value)
          movements[key].movement.base = attributes.agility.augmented.value * movements[key].multiplier.value
          if (biography && (biography.metatype === "dwarf" || biography.metatype === "troll"))
            movements[key].extraMovement.base = 1
          // A homunculus prints x2/x4/+1 (SR5 p. 301)
          else if (actor.type === "actorSpirit" && SR5_SpiritTypes.baseType(actor.system.type) === "homunculus")
            movements[key].extraMovement.base = 1
          //Spirits sprint like everyone else: +2 m per hit (Aetherology p. 35)
          else movements[key].extraMovement.base = 2
          break
        case "swim":
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Strength'), "linkedAttribute", attributes.strength.augmented.value)
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillSwimming'), "skillRating", skills.swimming.rating.value)
          movements[key].movement.base = Math.ceil((attributes.strength.augmented.value + attributes.agility.augmented.value) / 2)
          if (biography && (biography.metatype === "elf" || biography.metatype === "troll"))
            movements[key].extraMovement.base = 2
          //No swimming rule of their own for spirits: the general +1 m per hit
          else movements[key].extraMovement.base = 1
          break
        case "treadWater":
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Strength'), "linkedAttribute", attributes.strength.augmented.value)
          SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillSwimming'), "skillRating", skills.swimming.rating.value)
          movements[key].movement.base = attributes.strength.augmented.value
          movements[key].extraMovement.base = attributes.strength.augmented.value
          break
        case "walk":
          SR5_EntityHelpers.updateModifier(movements[key].movement, game.i18n.localize('SR5.Agility'), "linkedAttribute", attributes.agility.augmented.value * movements[key].multiplier.value)
          break
        case "hotDrop":
          //Hot-Drop (Street Lethal p. 58-59): « Utilisez Chute Libre pour manœuvrer », Free Fall being a Body skill
          //that can default (SR5 p. 135, -1 untrained: SR5 p. 130); the row shows only on the actor carrying one, its
          //height of 50 m telling the sheet so
          if (hotDropGear(actor.items)) {
            const freeFall = skills.freeFall?.rating?.value ?? 0
            movements[key].movement.base = HOT_DROP_DISTANCES.up
            SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Body'), "linkedAttribute", attributes.body.augmented.value)
            if (freeFall > 0) SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.SkillFreeFall'), "skillRating", freeFall)
            else SR5_EntityHelpers.updateModifier(movements[key].test, game.i18n.localize('SR5.Defaulting'), "skillRating", -1)
          }
          break
        default:
          SR5_SystemHelpers.srLog(1, `Unknown movement '${key}' in 'updateMovements()'`)
      }
      SR5_EntityHelpers.updateValue(movements[key].movement)
      SR5_EntityHelpers.updateValue(movements[key].extraMovement)
      SR5_EntityHelpers.updateValue(movements[key].maximum)
      this.applyPenalty("condition", movements[key].test, actor)
      this.applyPenalty("matrix", movements[key].test, actor)
      this.applyPenalty("magic", movements[key].test, actor)
      this.applyPenalty("special", movements[key].test, actor)
      SR5_EntityHelpers.updateDicePool(movements[key].test, 0)
    }
  }

  // // Generate Actors Limits
  static updateLimits(actor) {
    let actorData = actor.system, limits = actorData.limits, attributes = actorData.attributes
    // AI on a device (Data Trails p. 160): Data Processing can replace the Mental limit and joins the Social limit
    let aiDataProcessing = (this.isDepthActive(actor) && actorData.matrix?.deviceType) ? actorData.matrix.attributes.dataProcessing.value : null
    const spiritType = actor.type === "actorSpirit" ? SR5_SpiritTypes.get(actorData.type) : null

    const context = {
      attributes, essence: actorData.essence?.value, aiDataProcessing
    }
    const kept = {
      ...context, rating: a => a.augmented.value, physical: limitAttributeValue
    }
    const uncapped = {
      ...context, rating: a => uncappedRating(a), physical: a => uncappedRating(a, true)
    }

    for (let key of Object.keys(SR5.characterLimits)) {
      const base = limitBase(key, kept)
      if (base === undefined) SR5_SystemHelpers.srLog(1, `Unknown limit '${key}' in 'updateLimits()'`)
      if (!limits[key]) continue
      if (base !== undefined) limits[key].base = base
      //The extraplanar entities print (P x 4) / 3 for every limit (Howling Shadows p. 130 and following)
      const forceLimit = spiritType ? SR5_SpiritTypes.forceLimit(spiritType, actorData.force?.value, key) : null
      if (forceLimit !== null) limits[key].base = forceLimit
      limits[key].modifiers = (limits[key].modifiers ?? []).filter(m => m.type !== "augmentationCap")
      SR5_EntityHelpers.updateValue(limits[key], 0)
      //Augmentation cap (SR5 p. 96): the limit reads the kept ratings; when the cap did cut something, the help
      //also gives the limit the real ratings would reach (arbitrage de DjamZ). The line counts for 0.
      if (base === undefined || forceLimit !== null || !CAP_NOTE_LIMITS.includes(key)) continue
      const note = limitCapNote(limits[key].value, base, limitBase(key, uncapped))
      if (note) SR5_EntityHelpers.updateModifier(limits[key], game.i18n.format("SR5.AugmentationCapLimitModifier", note), "augmentationCap", 0)
    }
  }

  // Update adept power point
  static updatePowerPoints(actor) {
    let actorData = actor.system, magic = actorData.magic, specialAttributes = actorData.specialAttributes
    magic.powerPoints.base = 0
    magic.powerPoints.maximum.base = 0

    if (!magic.magicType) return SR5_SystemHelpers.srLog(3, `Actor has no magic type selected or no magic capabilities for ${this.name}`)

    if (magic.magicType === "adept") {
      for (let category of Object.keys(SR5.spellCategories)) {
        magic.elements[category] = ""
      }
      magic.powerPoints.maximum.base = specialAttributes.magic.augmented.value
    }

    SR5_EntityHelpers.updateValue(magic.powerPoints)
    SR5_EntityHelpers.updateValue(magic.powerPoints.maximum)
  }

  // Magical Traditions Calculations
  static updateTradition(actor, itemData) {
    let magic = actor.system.magic

    if (!magic.magicType) return SR5_SystemHelpers.srLog(3, `Actor has no magic type selected or no magic capabilities for ${this.name}`)
    magic.possession = false

    if (itemData) {
      magic.drainResistance.linkedAttribute = itemData.drainAttribute
      magic.elements.combat = itemData.spiritCombat
      magic.elements.detection = itemData.spiritDetection
      magic.elements.illusion = itemData.spiritIllusion
      magic.elements.manipulation = itemData.spiritManipulation
      magic.elements.health = itemData.spiritHealth
      magic.possession = itemData.possession
      if (itemData.systemEffects.length) {
        let traditionType = itemData.systemEffects.find(i => i.category === "tradition")
        if (traditionType) magic.tradition = traditionType.value
      }
    }
  }

  // Magic and Astral Calculations
  static updateAstralValues(actor) {
    let actorData = actor.system, magic = actorData.magic, attributes = actorData.attributes, specialAttributes = actorData.specialAttributes, skills = actorData.skills

    if (!magic.magicType) return SR5_SystemHelpers.srLog(3, `Actor has no magic type selected or no magic capabilities for ${this.name}`)

    //Pass through barrier and astral defense
    if (magic.magicType == 'magician' || magic.magicType == 'aspectedMagician' || magic.magicType == 'mysticalAdept' || magic.magicType == 'spirit') {
      magic.passThroughBarrier.base = 0
      SR5_EntityHelpers.updateModifier(magic.passThroughBarrier, `${game.i18n.localize('SR5.Charisma')}`, "linkedAttribute", attributes.charisma.augmented.value)
      SR5_EntityHelpers.updateModifier(magic.passThroughBarrier, `${game.i18n.localize('SR5.Magic')}`, "linkedAttribute", specialAttributes.magic.augmented.value)
      magic.astralDefense.base = 0
      SR5_EntityHelpers.updateModifier(magic.astralDefense, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(magic.astralDefense, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    }
    this.applyPenalty("condition", magic.passThroughBarrier, actor)
    this.applyPenalty("matrix", magic.passThroughBarrier, actor)
    this.applyPenalty("magic", magic.passThroughBarrier, actor)
    this.applyPenalty("special", magic.passThroughBarrier, actor)
    SR5_EntityHelpers.updateDicePool(magic.passThroughBarrier, 0)
    this.applyPenalty("condition", magic.astralDefense, actor)
    this.applyPenalty("matrix", magic.astralDefense, actor)
    this.applyPenalty("magic", magic.astralDefense, actor)
    this.applyPenalty("special", magic.astralDefense, actor)
    SR5_EntityHelpers.updateDicePool(magic.astralDefense, 0)

    //Drain Resistance
    magic.drainResistance.base = 0
    SR5_EntityHelpers.updateModifier(magic.drainResistance, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
    if (magic.magicType === "adept") magic.drainResistance.linkedAttribute = "body"
    if (magic.drainResistance.linkedAttribute) {
      let drainAttr = attributes[magic.drainResistance.linkedAttribute] || specialAttributes[magic.drainResistance.linkedAttribute]
      if (drainAttr) {
        let label = `${game.i18n.localize(SR5.allAttributes[magic.drainResistance.linkedAttribute])}`
        SR5_EntityHelpers.updateModifier(magic.drainResistance, label, "linkedAttribute", drainAttr.augmented.value)
      }
    }
    //SR5 p. 403: spirits resist the Drain of an innate spell with Intuition or Charisma, at the GM's discretion,
    //added to Willpower as a tradition attribute is (Shadow Spells p. 19). A world setting chooses, Charisma by default
    if (magic.magicType === "spirit") {
      let drainKey = game.settings?.get?.("sr5", "sr5SpiritDrainAttribute") === "intuition" ? "intuition" : "charisma"
      SR5_EntityHelpers.updateModifier(magic.drainResistance, `${game.i18n.localize(SR5.allAttributes[drainKey])}`, "linkedAttribute", attributes[drainKey].augmented.value)
    }
    SR5_EntityHelpers.updateDicePool(magic.drainResistance, 0)

    //Astral damage
    magic.astralDamage.base = 0
    if ((actor.type === "actorPc") || (actor.type === "actorGrunt")) SR5_EntityHelpers.updateModifier(magic.astralDamage, `${game.i18n.localize('SR5.Charisma')}`, "linkedAttribute", attributes.charisma.augmented.value)
    if (actor.type === "actorSpirit") {
      // Watchers and homunculi deal 1 astral damage (SR5 p. 318), custom types based on them included
      if (["homunculus", "watcher"].includes(SR5_SpiritTypes.baseType(actorData.type))) {
        SR5_EntityHelpers.updateModifier(magic.astralDamage, SR5_SpiritTypes.label(actorData.type), "actorSpirit", 1)
      } else {
        SR5_EntityHelpers.updateModifier(magic.astralDamage, `${game.i18n.localize('SR5.SpiritForceShort')}`, "linkedAttribute", actorData.force.value)
      }
    }
    SR5_EntityHelpers.updateValue(magic.astralDamage, 0)

    //Astral tracking
    magic.astralTracking.base = 0
    SR5_EntityHelpers.updateModifier(magic.astralTracking, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    if (skills.assensing.rating.value) {
      SR5_EntityHelpers.updateModifier(magic.astralTracking, `${game.i18n.localize('SR5.SkillAssensing')}`, "skillRating", skills.assensing.rating.value)
    }
    this.applyPenalty("condition", magic.astralTracking, actor)
    this.applyPenalty("matrix", magic.astralTracking, actor)
    this.applyPenalty("magic", magic.astralTracking, actor)
    this.applyPenalty("special", magic.astralTracking, actor)
    SR5_EntityHelpers.updateDicePool(magic.astralTracking, 0)

    //Max bounded spirit
    magic.boundedSpirit.max = specialAttributes.magic.augmented.value

    //Metamagic stuff
    magic.metamagics.centeringValue.base = magic.initiationGrade
    magic.metamagics.spellShapingValue.base = specialAttributes.magic.augmented.value
    SR5_EntityHelpers.updateValue(magic.metamagics.centeringValue, 0)
    SR5_EntityHelpers.updateValue(magic.metamagics.spellShapingValue, 0)
  }

  // Counterspell pool
  static updateCounterSpellPool(actor) {
    let actorData = actor.system, magic = actorData.magic, skills = actorData.skills
    //Better Than Bad p. 141: under Blight no counterspelling, no spell defense dice (decision H1 of DjamZ)
    if (SR5_Toxins.isCutFromManasphere(actor)) {
      magic.counterSpellPool.base = 0
      magic.counterSpellPool.value = 0
      return
    }
    magic.counterSpellPool.base = skills.counterspelling.rating.value
    if (magic.metamagics.shielding) SR5_EntityHelpers.updateModifier(magic.counterSpellPool, `${game.i18n.localize('SR5.MetamagicShielding')}`, "metamagic", magic.initiationGrade)
    //Harmonious Defense (Forbidden Arcana p. 45): Willpower + Magic + initiate grade, used as spell defense dice.
    //Accepted approximation (review H2): the pool is always there, with no free action to declare it and no switch to
    //astral perception, which the book ties to its use
    if (magic.metamagics.harmoniousDefense) SR5_EntityHelpers.updateModifier(magic.counterSpellPool, `${game.i18n.localize('SR5.MetamagicHarmoniousDefense')}`, "metamagic",
      harmoniousDefensePool(actorData.attributes.willpower.augmented.value, actorData.specialAttributes.magic.augmented.value, magic.initiationGrade))
    SR5_EntityHelpers.updateValue(magic.counterSpellPool)
    //Arcane Bodyguard (Forbidden Arcana p. 36): spell defense dice doubled, applied last
    //(never more than dice / 3 to protect himself: left to the players)
    if (magic.masteries && this.updateMagicMasteries(magic).arcaneBodyguard > 0 && magic.counterSpellPool.value > 0) {
      SR5_EntityHelpers.updateModifier(magic.counterSpellPool, `${game.i18n.localize('SR5.MagicMasteryArcaneBodyguard')}`, "metamagic", magic.counterSpellPool.value)
      SR5_EntityHelpers.updateValue(magic.counterSpellPool)
    }
  }

  //Magical masteries (Forbidden Arcana p. 30-41): computes each level from its effects, returns {key: level}
  static updateMagicMasteries(magic) {
    const levels = {
    }
    for (let [key, mastery] of Object.entries(magic?.masteries || {
    })) {
      SR5_EntityHelpers.updateValue(mastery, 0)
      levels[key] = mastery.value
    }
    return levels
  }

  // Better Than Bad p. 140-141: the grey mana worn, and its penalty on tests using Magic
  static updateGreyMana(actor) {
    updateGreyMana(actor, game.i18n.localize("SR5.GreyMana"))
  }

  // Background count calcultations
  static updateBackgroundCount(actor) {
    let actorData = actor.system
    let scene = game.scenes.active
    if (scene) {
      let token = scene.tokens.find((t) => t.actorId === actor.id)
      //check if actor already has a modifier on background count to avoid scene modifiers and prefer template modifier
      if (token && !actorData.magic.bgCount.modifiers.length) {
        let sceneData = scene.flags.sr5
        //A scene whose background count was never set stores null, or nothing at all, and both
        //differ from 0 : read the rating as a number so they add no empty modifier to the actor
        //Aetherologie p. 34 and Shadow Spells p. 25: the count of the scene with its running Mana Flux / Ebb,
        //from -24 to +24, below 0 a penalty for everyone whatever the alignment
        let backgroundCount = effectiveSceneBackgroundCount(sceneData, game.time?.worldTime ?? 0)
        if (backgroundCount !== 0) {
          const alignment = backgroundCount < 0 ? "" : sceneData.backgroundCountAlignement
          SR5_EntityHelpers.updateModifier(actorData.magic.bgCount, game.i18n.localize("SR5.SceneBackgroundCount"), alignment, backgroundCountFor(backgroundCount, alignment, actorData.magic.tradition), false, true)
        }
      }
    }
    SR5_EntityHelpers.updateValue(actor.system.magic.bgCount)
  }

  // Generate Drug addiction
  // focusRating: for a focus, the total Force of the active foci (SR5 p. 416), its own Force by default
  static generateDrugAddiction(item, focusRating = item.system.itemRating) {
    let addiction = [], drugTaken

    if (item.type === "itemDrug") {
      drugTaken = {
        "name": item.name,
        //A drug's addiction: the dice of Drug Tolerance are for it alone (rollData-Addiction.js)
        "kind": "drug",
        "shot": {
          "value": 0,
          "base": 1,
          "modifiers": []
        },
        //Pharmaceutical drugs: threshold -1 (Chrome Flesh p. 194)
        "addiction": {
          ...item.system.addiction, "threshold": drugAddictionThreshold(item.system)
        },
        "weekAddiction": {
          "value": 0,
          "base": 11 - item.system.addiction.rating,
          "modifiers": []
        },
      }
    }

    if (item.type === "itemFocus") {
      drugTaken = {
        "name": item.name,
        "shot": {
          "value": 0,
          "base": 1,
          "modifiers": []
        },
        // Foci (SR5 p. 416): the rating is the total Force of the active foci, threshold 2. A nested
        // object, so that the sheet and the addiction test read it (dotted keys stayed dotted in the array)
        "addiction": {
          "type": "psychological", "rating": focusRating, "threshold": 2
        },
        "weekAddiction": {
          "value": 0,
          "base": Math.max(1, 11 - focusRating),
          "modifiers": []
        },
      }
    }
    SR5_EntityHelpers.updateValue(drugTaken.shot)
    SR5_EntityHelpers.updateValue(drugTaken.weekAddiction)
    addiction.push(drugTaken)
    return addiction
  }

  // Handle drug stats
  //`consumer`: who takes it. The sheet passes a copy of the item, without a parent (Liesel's D4)
  //The doses counted (Soothsayer) are read by the sheet on its working list (entities/items/drug-damage.js, M7 D1)
  static async handleDrugShots(item, drugType, actorData, consumer = item.parent) {
    let drugStat
    let roll, rollRoll, rollSpeed, rollRollSpeed, duration, effect

    switch (drugType.value) {
      case "bliss":
        duration = Math.max(6 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "cram":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 10,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "deepweed":
        duration = Math.max(6 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "jazz":
        //(10 × 1D6) minutes, one die times ten (SR5 p. 413-414), not the sum of ten dice
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "minute",
        }
        break
      case "kamikaze":
        //(10 × 1D6) minutes, one die times ten (SR5 p. 413-414), not the sum of ten dice
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "minute",
        }
        break
      case "longHaul": {
        roll = new Roll(`8d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 10,
          "speedType": "SR5.Minutes",
          "duration": 4,
          "durationType": "day",
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "hour",
        }
        //SR5 p. 413: a second dose taken after the first one wore off (in its crash) keeps awake (1D6/2) days more,
        //(12 × 1D6) hours, then 10S unresisted and the same crash (drug-damage.js). No further dose keeps awake. Counted
        //for the actor, the same pile taken during its own crash or another Long Haul item (Eudoxie's review, D1)
        const kind = longHaulDoseKind(item, consumer)
        if (kind === "noMore") {
          ui.notifications.warn(game.i18n.localize("SR5.DrugLongHaulNoMore"))
          //One Combat Turn, the shortest the drug clock counts (0 is never counted): back to its crash at once
          drugStat.duration = 1
          drugStat.durationType = "combatTurn"
          drugStat.longHaulNoMore = true
        } else if (kind === "second") {
          rollSpeed = new Roll(`1d6 * 12`)
          rollRollSpeed = await rollSpeed.evaluate()
          drugStat.duration = rollRollSpeed.total
          drugStat.durationType = "hour"
          drugStat.longHaulSecondDose = true
          ui.notifications.info(`${item.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.DrugLongHaulSecondDose")}`)
        }
        break
      }
      //KAMI+, custom drug of the Megapack (Chrome Flesh p. 194-196): base duration (10 × 1D6) minutes, base Speed of
      //3 Combat Turns brought to 1 by its two Speed enhancers; crash 10S (drug-damage.js)
      case "kamiPlus":
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": rollRoll.total,
          "durationType": "minute",
        }
        break
      //A drug made with the designer (Chrome Flesh p. 194-196): Speed, (10 × ND6) minutes and crash worked out from its
      //recipe (drug-designer.js), the crash damage carried by the stat (drug-damage.js)
      case "customDrug": {
        const recipe = item.system?.designer?.recipe
        roll = new Roll(`${computeCustomDrug(recipe).durationDice}d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = customDrugShot(recipe, rollRoll.total)
        break
      }
      case "nitro":
        //(10 × 1D6) minutes, one die times ten (SR5 p. 413), not the sum of ten dice
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": rollRoll.total,
          "durationType": "minute",
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "minute",
        }
        break
      case "novacoke":
        duration = Math.max(10 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "psyche":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 10,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "zen":
        //(10 × 1D6) minutes, one die times ten (SR5 p. 413-414), not the sum of ten dice
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 5,
          "speedType": "SR5.Minutes",
          "duration": rollRoll.total,
          "durationType": "minute",
        }
        break
      case "aexd":
        roll = new Roll(`2d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 10 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "aisa":
        roll = new Roll(`2d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 20 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "animalTongue":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        rollSpeed = new Roll(`3d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "ayaosWill":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": 2,
          "speedType": "SR5.CombatTurns",
          "duration": 10 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "betel":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 10 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "betameth":
        duration = Math.max(9 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "cereprax":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        rollSpeed = new Roll(`1d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "crimsonOrchid":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "dopadrine":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 10 * rollRoll.total,
          "durationType": "minute",
        }
        break
      case "eX":
        duration = Math.max(8 - actorData.attributes.body.augmented.value, 1)
        rollSpeed = new Roll(`1d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          //Chrome Flesh p. 186: disorientation as long as the effect, and -2 social Limit for (Body) hours
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
          "socialLimitContrecoup": actorData.attributes.body.augmented.value,
        }
        break
      case "forgetMeNot":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "galak":
        duration = Math.max(9 - actorData.attributes.body.augmented.value, 3)
        rollSpeed = new Roll(`1d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          //Chrome Flesh p. 186, as eX: disorientation as long as the effect, and -2 social Limit for (Body) hours
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
          "socialLimitContrecoup": actorData.attributes.body.augmented.value,
        }
        break
      case "g3":
        duration = Math.max(15 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Hour",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "guts":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "hecatesBlessing":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 10 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "minute",
          "durationContrecoup": 2 * duration,
          "durationContrecoupType": "minute",
        }
        break
      case "hurlg":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        rollSpeed = new Roll(`2d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "immortalFlower":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        //Its 2D6 Physical at the crash, for the characters with implants, are in entities/items/drug-damage.js
        drugStat = {
          "name": drugType.value,
          "speed": 16,
          "speedType": "SR5.CombatTurns",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "k10":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 5 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "laes":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 20 * rollRoll.total
        effect = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "minute",
          "effectDuration": effect,
          "effectDurationType": "SR5.Hours",
        }
        break
      //Stolen Souls p. 192 rather than Chrome Flesh p. 190 (arbitrage de DjamZ, H20): Power 10, and drowsiness
      //rather than unconsciousness, which the book does not quantify. Stolen Souls gives no duration: 5 × 1D6
      //minutes stays the one of Chrome Flesh p. 190
      case "leal":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 5 * rollRoll.total
        effect = Math.max(120 - actorData.attributes.body.augmented.value, 100)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "minute",
          "drowsy": true,
          "effectDuration": effect,
          "effectDurationType": "SR5.Minutes",
        }
        break
      case "littleSmoke":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        rollSpeed = new Roll(`2d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "memoryFog":
        duration = Math.max(14 - actorData.attributes.body.augmented.value, 2)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "nightwatch":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 20 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "noPaint":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "hour",
        }
        break
      case "oneiro":
        roll = new Roll(`3d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
          //Chrome Flesh p. 190: disorientation "pour une durée égale à celle de l'effet de la drogue"
          "durationContrecoup": rollRoll.total,
          "durationContrecoupType": "minute",
        }
        break
      case "oxygenatedFluorocarbons":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRoll.total,
          "speedType": "SR5.Hours",
          "duration": 1,
          "durationType": "week",
          "durationContrecoup": actorData.attributes.body.augmented.value,
          "durationContrecoupType": "day",
        }
        break
      case "overdrive":
        duration = Math.max(10 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
        }
        break
      //Chrome Flesh p. 191: +1 Charisma and Perception, Pain Tolerance 1, memory loss; no damage, on taking or after
      case "pixieDust":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        rollSpeed = new Roll(`1d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
          "effectDuration": rollRollSpeed.total,
          "effectDurationType": "SR5.Minutes",
        }
        break
      case "push":
        duration = Math.max(15 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "redMescaline":
        duration = Math.max(18 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Hour",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "ripper":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 10 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "rockLizardBlood":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": 30,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "shade":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "slab":
        duration = Math.max(10 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 2,
          "speedType": "SR5.CombatTurns",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": Math.floor(duration / 2),
          "durationContrecoupType": "hour",
        }
        break
      case "snuff":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 10 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "minute",
          "durationContrecoup": duration * 2,
          "durationContrecoupType": "minute",
        }
        break
      case "soberTime":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 10 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "minute",
        }
        break
      case "soothsayer": {
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        //Its 8S on intake, 1 less per application already made, are in entities/items/drug-damage.js
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Minute",
          "duration": duration,
          "durationType": "hour",
        }
        break
      }
      case "trance":
        duration = Math.max(6 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "hour",
          "durationContrecoup": duration,
          "durationContrecoupType": "hour",
        }
        break
      case "woad":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = 5 * rollRoll.total
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.CombatTurn",
          "duration": duration,
          "durationType": "minute",
          //Chrome Flesh p. 187: "une durée 10 fois supérieure à la durée de l'effet", which is in minutes
          "durationContrecoup": 10 * duration,
          "durationContrecoupType": "minute",
        }
        break
      case "wuduAku":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        rollSpeed = new Roll(`2d6`)
        rollRollSpeed = await rollSpeed.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": rollRollSpeed.total,
          "speedType": "SR5.Minutes",
          "duration": duration,
          "durationType": "hour",
          //Chrome Flesh p. 193: "une fois la drogue ingérée", -2 dice to the other spirits "pendant une durée de 24 heures",
          //counted from the intake: the crash holds what is left of them once the speed and the effect are over
          "sinceIntake": 24 * 60,
        }
        break
      case "zero":
        duration = Math.max(20 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Hour",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "zombieDust":
        roll = new Roll(`1d6`)
        rollRoll = await roll.evaluate()
        duration = Math.min(rollRoll.total + actorData.essence.value, 12)
        drugStat = {
          "name": drugType.value,
          "speed": 2,
          "speedType": "SR5.CombatTurns",
          "duration": duration,
          "durationType": "hour",
        }
        break
      case "zone":
        duration = Math.max(12 - actorData.attributes.body.augmented.value, 1)
        drugStat = {
          "name": drugType.value,
          "speed": 1,
          "speedType": "SR5.Hour",
          "duration": duration,
          "durationType": "hour",
        }
        break
      //Chrome Flesh p. 194: speed "Immédiate", 48 hours, no crash
      case "psychochip":
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 48,
          "durationType": "hour",
        }
        break
      //Bullets & Bandages p. 19: (30 - Body) minutes, no speed given
      case "cryo":
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": Math.max(30 - actorData.attributes.body.augmented.value, 1),
          "durationType": "minute",
        }
        break
      //Bullets & Bandages p. 19: (Body) Combat Turns
      case "hemoSynth":
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": Math.max(actorData.attributes.body.augmented.value, 1),
          "durationType": "combatTurn",
        }
        break
      //Bullets & Bandages p. 19-20: 24 hours
      case "nanoScan":
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": 24,
          "durationType": "hour",
        }
        break
      //Bullets & Bandages p. 20: 1D6 × 10 minutes, one die times ten. A BTL program (SR5 p. 414): speed "Immédiate",
      //duration "typically (10 × 1D6) minutes", the same die; its rebound (p. 415) has no figure, so no crash
      case "neostigmine":
      case "ondansetron":
      case "btl":
        roll = new Roll(`1d6 * 10`)
        rollRoll = await roll.evaluate()
        drugStat = {
          "name": drugType.value,
          "speed": item.system.speed,
          "duration": rollRoll.total,
          "durationType": "minute",
        }
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${drugType.value}' drug type in handleDrugShots()`)
        return
    }
    //"ESS + 1D6 heures" (Chrome Flesh p. 191-193) gives 9.9 hours with a datajack: the book rounds up when it does not
    //say otherwise (SR5 p. 50, written for divisions: its use for a sum is a reading). Rounded to the hundredth first, or an Essence of 5 stored as 5.0000001 would give one hour more
    if (typeof drugStat.duration === "number") drugStat.duration = Math.ceil(Math.round(drugStat.duration * 100) / 100)
    //An antitoxin divides the duration of the effect by its rating (Chrome Flesh p. 154)
    const antitoxin = SR5_Toxins.antitoxinRating(actorData)
    if (antitoxin > 1) drugStat.duration = SR5_Toxins.drugDuration(drugStat.duration, antitoxin)
    //The quality of the drug changes the duration of its crash (Chrome Flesh p. 194)
    applyDrugQuality(drugStat, effectiveDrugQuality(item.system, consumer))
    //After the quality: 24 hours from the intake are not a crash the quality lengthens
    if (drugStat.sinceIntake) Object.assign(drugStat, crashSinceIntake(drugStat))
    return drugStat
  }

  // Generate Matrix attributes
  static generateMatrixAttributes(item, actor) {
    let actorData = actor.system, attributes = actorData.attributes
    let matrix = actorData.matrix, matrixAttributes = matrix.attributes

    matrix.deviceType = item.system.type
    matrix.deviceName = item.name

    switch (item.system.type) {
      case "cyberdeck":
        matrix.attributesCollection.value1 = item.system.attributesCollection.value1
        matrix.attributesCollection.value2 = item.system.attributesCollection.value2
        matrix.attributesCollection.value3 = item.system.attributesCollection.value3
        matrix.attributesCollection.value4 = item.system.attributesCollection.value4
        matrix.programsMaximumActive.base = 0
        SR5_EntityHelpers.updateModifier(matrix.programsMaximumActive, item.name, "device", item.system.program.max, false, false)
        matrix.deviceRating = item.system.deviceRating
        break
      case "riggerCommandConsole":
        matrix.attributes.attack.base = 0
        matrix.attributes.sleaze.base = 0
        matrix.attributes.dataProcessing.base = item.system.attributesCollection.value3
        matrix.attributes.firewall.base = item.system.attributesCollection.value4
        matrix.programsMaximumActive.base = 0
        SR5_EntityHelpers.updateModifier(matrix.programsMaximumActive, item.name, "deviceRating", item.system.deviceRating, false, false)
        matrix.deviceRating = item.system.deviceRating
        break
      case "commlink":
        matrix.attributes.attack.base = 0
        matrix.attributes.sleaze.base = 0
        matrix.attributes.dataProcessing.base = item.system.deviceRating
        matrix.attributes.firewall.base = item.system.deviceRating
        matrix.programsMaximumActive.base = 0
        SR5_EntityHelpers.updateModifier(matrix.programsMaximumActive, item.name, "deviceRating", item.system.deviceRating, false, false)
        matrix.deviceRating = item.system.deviceRating
        break
      case "livingPersona":
        matrix.attributes.attack.base = attributes.charisma.augmented.value
        matrix.attributes.sleaze.base = attributes.intuition.augmented.value
        matrix.attributes.dataProcessing.base = attributes.logic.augmented.value
        matrix.attributes.firewall.base = attributes.willpower.augmented.value
        matrix.deviceRating = actorData.specialAttributes.resonance.augmented.value
        //Worked out, never typed: the persona's Device Rating is the Resonance (SR5 p. 253), shown on its own sheet too
        item.system.deviceRating = matrix.deviceRating
        break
      case "headcase": {
        let nanite = actorData.specialAttributes.nanite.augmented.value
        if (originalStrainDevice(actor) === item) {
          // Original strain (Dark Terrors p. 88): an AI on its nanite swarm, a device rated by the Nanite Volume, whose
          // four attributes are each the Nanite Volume (arbitrage de DjamZ, 06/10); no program slot; always in hot sim
          for (let key of ["attack", "sleaze", "dataProcessing", "firewall"]) matrix.attributes[key].base = nanite
          matrix.deviceRating = nanite
          matrix.userMode = "hotsim"
          // The swarm's matrix monitor: 8 + NV / 2, worked out here because the device knows no Nanite Volume
          item.system.deviceRating = nanite
          item.system.conditionMonitors.matrix.base = monitorSize(nanite)
          SR5_EntityHelpers.updateValue(item.system.conditionMonitors.matrix, 0)
          SR5_EntityHelpers.updateValue(item.system.conditionMonitors.matrix.actual, 0)
          SR5_EntityHelpers.GenerateMonitorBoxes(item.system, 'matrix')
          break
        }
        // Head case matrix attributes (Lockdown p. 206): same attribute layout as a
        // living persona, with the full Nanite Volume added to each one.
        matrix.attributes.attack.base = attributes.charisma.augmented.value + nanite
        matrix.attributes.sleaze.base = attributes.intuition.augmented.value + nanite
        matrix.attributes.dataProcessing.base = attributes.logic.augmented.value + nanite
        matrix.attributes.firewall.base = attributes.willpower.augmented.value + nanite
        matrix.deviceRating = nanite
        break
      }
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${item.system.type}' deck type in generateMatrixAttributes()`)
        return
    }

    matrix.pan = item.system.pan
    matrix.marks = item.system.marks
    matrix.markedItems = item.system.markedItems
    //Noise Reduction and Sharing belong to a console, their total within its Device Rating (SR5 p. 269): a deck or a
    //commlink equipped instead no longer reduces the noise with the console's setting
    //A Machinist's persona takes Willpower and Charisma instead (Kill Code p. 101)
    const rcc = fixedRccRatings(actor) ?? rccRatings(matrixAttributes.noiseReduction.base, matrixAttributes.sharing.base, matrix.deviceRating, actsAsRcc(actor))
    matrixAttributes.noiseReduction.base = rcc.noiseReduction
    matrixAttributes.sharing.base = rcc.sharing
    //Erisian daemon: half the submersion grade, rounded up, on the persona's Firewall (Kill Code p. 146). Non-cumulative,
    //since this function runs twice in a preparation
    if (item.system.type === "livingPersona") {
      const firewallBonus = firewallBonusOfStream(streamOf(actor), matrix.submersionGrade)
      if (firewallBonus) SR5_EntityHelpers.updateModifier(matrixAttributes.firewall, game.i18n.localize('SR5.StreamErisian'), "technomancerStream", firewallBonus, false, false)
      //Apophenian daemon: the same on Sleaze (Kill Code p. 146)
      const sleazeBonus = sleazeBonusOfStream(streamOf(actor), matrix.submersionGrade)
      if (sleazeBonus) SR5_EntityHelpers.updateModifier(matrixAttributes.sleaze, game.i18n.localize('SR5.StreamApophenian'), "technomancerStream", sleazeBonus, false, false)
    }
    SR5_EntityHelpers.updateValue(matrix.noise)
    SR5_EntityHelpers.updateValue(matrix.programsMaximumActive, 0)
    SR5_EntityHelpers.updateValue(matrix.programsCurrentActive, 0)
    this.applyAIProgramCap(actor)

    for (let key of Object.keys(SR5.matrixAttributes)) {
      SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
    }
  }

  // Generate Resonance actions
  static generateResonanceMatrix(actor) {
    let actorData = actor.system, specialAttributes = actorData.specialAttributes, skills = actorData.skills
    let matrix = actorData.matrix, resonanceActions = matrix.resonanceActions

    matrix.registeredSprite.max = specialAttributes.resonance.augmented.value

    resonanceActions.compileSprite.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.compileSprite.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.compileSprite.test, `${game.i18n.localize('SR5.MatrixActionCompileSprite')}`, "skillRating", skills.compiling.rating.value)
    resonanceActions.decompileSprite.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.decompileSprite.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.decompileSprite.test, `${game.i18n.localize('SR5.MatrixActionDecompileSprite')}`, "skillRating", skills.decompiling.rating.value)
    resonanceActions.eraseResonanceSignature.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.eraseResonanceSignature.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.eraseResonanceSignature.test, `${game.i18n.localize('SR5.SkillComputer')}`, "skillRating", skills.computer.rating.value)
    resonanceActions.killComplexForm.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.killComplexForm.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.killComplexForm.test, `${game.i18n.localize('SR5.SkillSoftware')}`, "skillRating", skills.software.rating.value)
    resonanceActions.registerSprite.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.registerSprite.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.registerSprite.test, `${game.i18n.localize('SR5.SkillRegistering')}`, "skillRating", skills.registering.rating.value)
    resonanceActions.threadComplexForm.test.base = 0
    SR5_EntityHelpers.updateModifier(resonanceActions.threadComplexForm.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    SR5_EntityHelpers.updateModifier(resonanceActions.threadComplexForm.test, `${game.i18n.localize('SR5.SkillSoftware')}`, "skillRating", skills.software.rating.value)

    // handle resonance final calculation
    for (let key of Object.keys(SR5.resonanceActions)) {
      if (resonanceActions[key].test) {
        this.applyPenalty("condition", resonanceActions[key].test, actor)
        this.applyPenalty("matrix", resonanceActions[key].test, actor)
        this.applyPenalty("magic", resonanceActions[key].test, actor)
        this.applyPenalty("special", resonanceActions[key].test, actor)
        if (matrix.userMode === "hotsim" && key === "eraseResonanceSignature") {
          SR5_EntityHelpers.updateModifier(resonanceActions[key].test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 2)
        }
        //Écho Dissonance résonante (Better Than Bad p. 145, VO p. 161): in hot sim, +2 dice to compile and decompile a
        //sprite and to thread a complex form
        if (matrix.userMode === "hotsim" && RESONANT_DISSONANCE_ACTIONS.includes(key) && hasResonantDissonance(actor)) {
          SR5_EntityHelpers.updateModifier(resonanceActions[key].test, game.i18n.localize('SR5.EchoResonantDissonance'), "echo", 2)
        }
        //test
        SR5_EntityHelpers.updateDicePool(resonanceActions[key].test)
        if (resonanceActions[key].test.dicePool < 0) resonanceActions[key].test.dicePool = 0
        // limit calculation
        if (resonanceActions[key].limit) {
          let linkedLimit = resonanceActions[key].limit.base
          if (actorData.limits[linkedLimit]) {
            resonanceActions[key].limit.value = actorData.limits[linkedLimit].value + SR5_EntityHelpers.modifiersSum(resonanceActions[key].limit.modifiers)
          }
        }
      }
    }
  }

  // The rule constants of a matrix action (type, source, marks, legality, limit attribute) are those of the
  // schema: an actor created with an earlier version keeps them in its stored data, so a rule fix would
  // otherwise never reach existing actors
  static resetMatrixActionRules(actor, key) {
    const field = actor.system.schema?.getField(`matrix.actions.${key}`)
    const action = actor.system.matrix?.actions?.[key]
    if (!field?.fields || !action) return
    for (const name of ["actionType", "source", "increaseOverwatchScore", "neededMarks"]) {
      if (field.fields[name] && field.fields[name].initial !== undefined) action[name] = field.fields[name].initial
    }
    const linkedAttribute = field.fields.limit?.fields?.linkedAttribute
    if (linkedAttribute && action.limit) action.limit.linkedAttribute = linkedAttribute.initial
  }

  static generateMatrixActions(actor) {
    let actorData = actor.system, attributes = actorData.attributes, specialAttributes = actorData.specialAttributes, skills = actorData.skills,
      matrix = actorData.matrix, matrixAttributes = matrix.attributes, matrixActions = matrix.actions
    //Écho Dissonance résonante (Better Than Bad p. 145): in cold sim, the +2 dice of hot sim kept on every matrix action
    const coldSimBonus = matrix.userMode === "coldsim" && hasResonantDissonance(actor)

    SR5_EntityHelpers.updateModifier(matrixActions.jamSignals.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jamSignals.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.controlDevice.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.controlDevice.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.disarmDataBomb.test, game.i18n.localize('SR5.SkillSoftware'), "skillRating", skills.software.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.disarmDataBomb.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.editFile.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.editFile.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.eraseMark.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.eraseMark.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    if (specialAttributes.resonance.augmented.value > 0) {
      SR5_EntityHelpers.updateModifier(matrixActions.eraseMatrixSignature.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.eraseMatrixSignature.test, `${game.i18n.localize('SR5.Resonance')}`, "linkedAttribute", specialAttributes.resonance.augmented.value)
    }
    SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.snoop.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.snoop.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.hackOnTheFly.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.hackOnTheFly.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.spoofCommand.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.spoofCommand.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.garbageInGarbageOut.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.garbageInGarbageOut.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.bruteForce.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.bruteForce.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixPerception.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixPerception.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.dataSpike.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.dataSpike.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.crackFile.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.crackFile.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.crashProgram.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.crashProgram.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.setDataBomb.test, game.i18n.localize('SR5.SkillSoftware'), "skillRating", skills.software.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.setDataBomb.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jumpIntoRiggedDevice.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jumpIntoRiggedDevice.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.rebootDevice.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.rebootDevice.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.trackback.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.trackback.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixSearch.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixSearch.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.hide.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.hide.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jackOut.test, game.i18n.localize('SR5.SkillHardware'), "skillRating", skills.hardware.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.jackOut.test, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.traceIcon.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.traceIcon.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
    SR5_EntityHelpers.updateModifier(matrixActions.checkOverwatchScore.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
    SR5_EntityHelpers.updateModifier(matrixActions.checkOverwatchScore.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)

    if (game.settings.get("sr5", "sr5KillCodeRules")) {
      SR5_EntityHelpers.updateModifier(matrixActions.calibration.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.calibration.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.denialOfService.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.denialOfService.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.iAmTheFirewall.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.iAmTheFirewall.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.haywire.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.haywire.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.intervene.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.intervene.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.masquerade.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.masquerade.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.popupHacking.test, game.i18n.localize('SR5.SkillHacking'), "skillRating", skills.hacking.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.popupHacking.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.popupCybercombat.test, game.i18n.localize('SR5.SkillCybercombat'), "skillRating", skills.cybercombat.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.popupCybercombat.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.squelch.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.squelch.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.subvertInfrastructure.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.subvertInfrastructure.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.tag.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.tag.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.watchdog.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.watchdog.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    }		
    if (game.settings.get("sr5", "sr5Rigger5Actions")) {
      //The console's own noise reduction, without the Suppress Noise of the turn (Rigger 5.0 p. 34-35)
      const consoleNoise = consoleNoiseReductionDice(matrixAttributes.noiseReduction)
      SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
      SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
      SR5_EntityHelpers.updateModifier(matrixActions.detectTargetLock.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.detectTargetLock.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.detectTargetLock.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
      SR5_EntityHelpers.updateModifier(matrixActions.suppressNoise.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.suppressNoise.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.suppressNoise.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.test, game.i18n.localize('SR5.SkillElectronicWarfare'), "skillRating", skills.electronicWarfare.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.test, game.i18n.localize('SR5.NoiseReduction'), "rccNoiseReduction", consoleNoise)
    }

    // AI Depth action (Data Trails p. 160): Redefine Ownership, Logic + Computer [Depth]
    if (this.isDepthActive(actor)) {
      SR5_EntityHelpers.updateModifier(matrixActions.redefineOwnership.test, game.i18n.localize('SR5.SkillComputer'), "skillRating", skills.computer.rating.value)
      SR5_EntityHelpers.updateModifier(matrixActions.redefineOwnership.test, game.i18n.localize('SR5.Logic'), "linkedAttribute", attributes.logic.augmented.value)
    }

    for (let key of Object.keys(SR5.matrixActions)) {
      this.resetMatrixActionRules(actor, key)
      if (matrixActions[key].test !== undefined) {
        // test
        if (matrix.runningSilent) {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.RunningSilent'), "silentMode", -2)
        }
        if (matrix.userMode === "hotsim") {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 2)
        }
        if (coldSimBonus) SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.EchoResonantDissonance'), "matrixUserMode", 2)
        if (matrixActions[key].specialization) {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, `${game.i18n.localize('SR5.Specialization')}`, "specialization", 2, false, true)
        }
        this.applyPenalty("condition", matrixActions[key].test, actor)
        this.applyPenalty("matrix", matrixActions[key].test, actor)
        this.applyPenalty("magic", matrixActions[key].test, actor)
        this.applyPenalty("special", matrixActions[key].test, actor)
        SR5_EntityHelpers.updateDicePool(matrixActions[key].test, 0)
        // limits
        let linkedAttribute = matrixActions[key].limit.linkedAttribute
        matrixActions[key].limit.base = 0
        if (matrixActions[key].source === "dataTrails") SR5_EntityHelpers.updateModifier(matrixActions[key].limit, game.i18n.localize('SR5.Depth'), "linkedAttribute", actorData.specialAttributes?.depth?.augmented.value || 0)
        else SR5_EntityHelpers.updateModifier(matrixActions[key].limit, game.i18n.localize(SR5.matrixAttributes[linkedAttribute]), "linkedAttribute", matrixAttributes[linkedAttribute].value)
        SR5_EntityHelpers.updateValue(matrixActions[key].limit, 0)
      }
    }
  }


  static generateDeviceMatrixActions(actor){
    let actorData = actor.system, matrix = actorData.matrix, matrixAttributes = matrix.attributes, matrixActions = matrix.actions

    for (let key of Object.keys(SR5.matrixActions)) {
      this.resetMatrixActionRules(actor, key)
      if (matrixActions[key].test !== undefined) {
        SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.DeviceRating'), "linkedAttribute", matrix.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.DeviceRating'), "linkedAttribute", matrix.deviceRating)
        // test
        if (matrix.runningSilent) {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.RunningSilent'), "silentMode", -2)
        }
        if (matrix.userMode === "hotsim") {
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, game.i18n.localize('SR5.VirtualRealityHotSimShort'), "matrixUserMode", 2)
        }
        if (matrixActions[key].specialization){
          SR5_EntityHelpers.updateModifier(matrixActions[key].test, `${game.i18n.localize('SR5.Specialization')}`, "specialization", 2, false, true)
        }
        SR5_EntityHelpers.updateDicePool(matrixActions[key].test, 0)
        // limits
        let linkedAttribute = matrixActions[key].limit.linkedAttribute
        matrixActions[key].limit.base = 0
        if (matrixActions[key].source === "dataTrails") SR5_EntityHelpers.updateModifier(matrixActions[key].limit, game.i18n.localize('SR5.Depth'), "linkedAttribute", actorData.specialAttributes?.depth?.augmented.value || 0)
        else SR5_EntityHelpers.updateModifier(matrixActions[key].limit, game.i18n.localize(SR5.matrixAttributes[linkedAttribute]), "linkedAttribute", matrixAttributes[linkedAttribute].value)
        SR5_EntityHelpers.updateValue(matrixActions[key].limit, 0)
      }
    }
  }

  static generateMatrixActionsDefenses(actor) {
    let actorData = actor.system, matrix = actorData.matrix, matrixAttributes = matrix.attributes, matrixActions = matrix.actions
    let intuitionValue, willpowerValue, logicValue, firewallValue, sleazeValue, dataProcessingValue, attackValue
    let modifierTypeIntuition = "linkedAttribute"
    let modifierTypeWillpower = "linkedAttribute"
    let modifierTypeLogic = "linkedAttribute"
    let modifierTypeFirewall = "matrixAttribute"
    let modifierTypeSleaze = "matrixAttribute"
    let modifierTypeDataProcessing = "matrixAttribute"
    let modifierTypeAttack = "matrixAttribute"
    let modifierTypeSensor = "sensorAttribute"
    let modifierTypePilot = "pilotAttribute"
    let logicLabel = 'SR5.Logic', deviceless = false
    let intuitionLabel = 'SR5.Intuition', willpowerLabel = 'SR5.Willpower'

    if (actor.type === "actorPc" || actor.type === "actorGrunt" || actor.type === "actorAgent") {
      intuitionValue = actorData.attributes.intuition.augmented.value
      willpowerValue = actorData.attributes.willpower.augmented.value
      logicValue = actorData.attributes.logic.augmented.value
      firewallValue = matrixAttributes.firewall.value
      sleazeValue = matrixAttributes.sleaze.value
      dataProcessingValue = matrixAttributes.dataProcessing.value
      attackValue = matrixAttributes.attack.value
      //Data Trails p. 157: an AI outside any device defends with its Willpower or Intuition alone, no matrix attribute
      if (this.isDevicelessAI(actor)) {
        let standIn = this.devicelessAILogicStandIn(actorData)
        deviceless = true
        logicValue = standIn.value
        logicLabel = standIn.label
      }
    } else if (actor.type === "actorSprite" || (actor.type === "actorDevice" && matrix.deviceType !== "slavedDevice")) {
      intuitionValue = matrix.deviceRating
      willpowerValue = matrix.deviceRating
      logicValue = matrix.deviceRating
      //A sprite's rating is its Level
      intuitionLabel = willpowerLabel = logicLabel = actor.type === "actorSprite" ? 'SR5.Level' : 'SR5.DeviceRating'
      firewallValue = matrixAttributes.firewall.value
      sleazeValue = matrixAttributes.sleaze.value
      dataProcessingValue = matrixAttributes.dataProcessing.value
      attackValue = matrixAttributes.attack.value
    } else if (actor.type === "actorDrone" && actorData.vehicleOwner.id && actorData.slaved) {
      let controler = actorData.vehicleOwner.system
      if (controler.attributes.intuition.augmented.value > matrix.deviceRating) {
        intuitionValue = controler.attributes.intuition.augmented.value
        modifierTypeIntuition = "controler"
      } else {
        intuitionValue = matrix.deviceRating
        intuitionLabel = 'SR5.DeviceRating'
      }

      if (controler.attributes.willpower.augmented.value > matrix.deviceRating) {
        willpowerValue = controler.attributes.willpower.augmented.value
        modifierTypeWillpower = "controler"
      } else {
        willpowerValue = matrix.deviceRating
        willpowerLabel = 'SR5.DeviceRating'
      }

      if (controler.attributes.logic.augmented.value > matrix.deviceRating) {
        logicValue = controler.attributes.logic.augmented.value
        modifierTypeLogic = "controler"
      } else {
        logicValue = matrix.deviceRating
        logicLabel = 'SR5.DeviceRating'
      }

      if (controler.matrix.attributes.firewall.value > matrix.deviceRating) {
        firewallValue = controler.matrix.attributes.firewall.value
        modifierTypeFirewall = "controler"
      } else firewallValue = matrix.deviceRating

      if (controler.matrix.attributes.sleaze.value > matrix.deviceRating) {
        sleazeValue = controler.matrix.attributes.sleaze.value
        modifierTypeSleaze = "controler"
      } else sleazeValue = matrix.deviceRating

      if (controler.matrix.attributes.dataProcessing.value > matrix.deviceRating) {
        dataProcessingValue = controler.matrix.attributes.dataProcessing.value
        modifierTypeDataProcessing = "controler"
      } else dataProcessingValue = matrix.deviceRating

      if (controler.matrix.attributes.attack.value > matrix.deviceRating) {
        attackValue = controler.matrix.attributes.attack.value
        modifierTypeAttack = "controler"
      } else attackValue = matrix.deviceRating
    } else {
      intuitionValue = matrix.deviceRating
      willpowerValue = matrix.deviceRating
      logicValue = matrix.deviceRating
      intuitionLabel = willpowerLabel = logicLabel = 'SR5.DeviceRating'
      firewallValue = matrix.deviceRating
      sleazeValue = matrix.deviceRating
      dataProcessingValue = matrix.deviceRating
      attackValue = matrix.deviceRating
    }
    //A device of the scenery has no Attack nor Sleaze (SR5 p. 235-236): it defends with the first element alone
    //(SR5 p. 237, « Logique seule si l'objet ne dispose pas d'un attribut Corruption »)
    const noAttackSleaze = lacksAttackAndSleaze(actor)

    SR5_EntityHelpers.updateModifier(matrixActions.editFile.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.editFile.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.eraseMark.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.eraseMark.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    // A Monad adds its Nanite Volume to resist Format Device (Dark Terrors p. 88); kept for the Lockdown strain too, as
    // the sidebar p. 91 recommends (arbitrage de DjamZ, 06/10)
    if (activeHeadcase(actor)) SR5_EntityHelpers.updateModifier(matrixActions.formatDevice.defense, game.i18n.localize('SR5.NaniteVolume'), "linkedAttribute", naniteVolume(actor))
    SR5_EntityHelpers.updateModifier(matrixActions.snoop.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    SR5_EntityHelpers.updateModifier(matrixActions.snoop.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.hackOnTheFly.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.hackOnTheFly.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.spoofCommand.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    SR5_EntityHelpers.updateModifier(matrixActions.spoofCommand.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.garbageInGarbageOut.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    SR5_EntityHelpers.updateModifier(matrixActions.garbageInGarbageOut.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.bruteForce.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.bruteForce.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.matrixPerception.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.matrixPerception.defense, game.i18n.localize('SR5.Sleaze'), modifierTypeSleaze, sleazeValue)
    SR5_EntityHelpers.updateModifier(matrixActions.dataSpike.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.dataSpike.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.crashProgram.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.crashProgram.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.jumpIntoRiggedDevice.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.jumpIntoRiggedDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.rebootDevice.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    SR5_EntityHelpers.updateModifier(matrixActions.rebootDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    SR5_EntityHelpers.updateModifier(matrixActions.hide.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.hide.defense, game.i18n.localize('SR5.DataProcessing'), modifierTypeDataProcessing, dataProcessingValue)
    SR5_EntityHelpers.updateModifier(matrixActions.jackOut.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
    if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.jackOut.defense, game.i18n.localize('SR5.MatrixAttack'), modifierTypeAttack, attackValue)
    SR5_EntityHelpers.updateModifier(matrixActions.traceIcon.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
    if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.traceIcon.defense, game.i18n.localize('SR5.Sleaze'), modifierTypeSleaze, sleazeValue)
    SR5_EntityHelpers.updateModifier(matrixActions.controlDevice.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
    SR5_EntityHelpers.updateModifier(matrixActions.controlDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)

    if (game.settings.get("sr5", "sr5KillCodeRules")) {
      SR5_EntityHelpers.updateModifier(matrixActions.denialOfService.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.denialOfService.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.haywire.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.haywire.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.masquerade.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
      SR5_EntityHelpers.updateModifier(matrixActions.masquerade.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.popupHacking.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.popupHacking.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.popupCybercombat.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.popupCybercombat.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.squelch.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
      if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.squelch.defense, game.i18n.localize('SR5.Sleaze'), modifierTypeSleaze, sleazeValue)
      SR5_EntityHelpers.updateModifier(matrixActions.subvertInfrastructure.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
      SR5_EntityHelpers.updateModifier(matrixActions.subvertInfrastructure.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      SR5_EntityHelpers.updateModifier(matrixActions.tag.defense, game.i18n.localize(intuitionLabel), modifierTypeIntuition, intuitionValue)
      if (!noAttackSleaze) SR5_EntityHelpers.updateModifier(matrixActions.tag.defense, game.i18n.localize('SR5.Sleaze'), modifierTypeSleaze, sleazeValue)
      SR5_EntityHelpers.updateModifier(matrixActions.watchdog.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
      SR5_EntityHelpers.updateModifier(matrixActions.watchdog.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
    }

    if (game.settings.get("sr5", "sr5Rigger5Actions")) {
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.defense, game.i18n.localize(willpowerLabel), modifierTypeWillpower, willpowerValue)
      SR5_EntityHelpers.updateModifier(matrixActions.targetDevice.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      if (actor.type === "actorDrone") {	
        SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.defense, game.i18n.localize(logicLabel), modifierTypeLogic, logicValue)
        SR5_EntityHelpers.updateModifier(matrixActions.breakTargetLock.defense, game.i18n.localize('SR5.VehicleStat_SensorFull'), modifierTypeSensor, actorData.attributes.sensor.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.defense, game.i18n.localize('SR5.VehicleStat_PilotFull'), modifierTypePilot, actorData.attributes.pilot.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixActions.confusePilot.defense, game.i18n.localize('SR5.Firewall'), modifierTypeFirewall, firewallValue)
      }
    }


    matrixActions.checkOverwatchScore.defense.base = 6

    if (deviceless) {
      for (let key of Object.keys(SR5.matrixActions)) {
        if (matrixActions[key].defense) matrixActions[key].defense.modifiers = matrixActions[key].defense.modifiers.filter(m => m.type !== "matrixAttribute")
      }
    }

    // handle final calculation
    for (let key of Object.keys(SR5.matrixActions)) {
      if (matrixActions[key].defense) {
        this.applyPenalty("condition", matrixActions[key].defense, actor)
        this.applyPenalty("matrix", matrixActions[key].defense, actor)
        this.applyPenalty("magic", matrixActions[key].defense, actor)
        this.applyPenalty("special", matrixActions[key].defense, actor)
        SR5_EntityHelpers.updateDicePool(matrixActions[key].defense, 0)
      }
    }
  }

  static generateMatrixResistances(actor, item) {
    let actorData = actor.system, attributes = actorData.attributes, specialAttributes = actorData.specialAttributes
    let matrix = actorData.matrix, matrixAttributes = matrix.attributes, matrixResistances = matrix.resistances

    matrixResistances.matrixDamage.base = 0
    matrixResistances.biofeedback.base = 0
    matrixResistances.dumpshock.base = 0
    matrixResistances.dataBomb.base = 0
    matrixResistances.fading.base = 0
    switch (item.system.type) {
      case "commlink":
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "deviceRating", item.system.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        //A commlink with a sim module goes into VR too: biofeedback and dumpshock are resisted with Willpower + Firewall,
        //whatever the device (SR5 p. 229 and 231). The pool was left empty, 0 dice
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        break
      case "cyberdeck":
      case "riggerCommandConsole":
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "deviceRating", item.system.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, item.name, "deviceRating", item.system.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        break
      case "livingPersona":
      case "headcase": {
        // Living personas resist with Resonance, head cases with their Nanite Volume
        let personaKey = item.system.type === "headcase" ? "nanite" : "resonance"
        let personaLabel = game.i18n.localize(SR5.characterSpecialAttributes[personaKey])
        SR5_EntityHelpers.updateModifier(matrixResistances.fading, personaLabel, "linkedAttribute", specialAttributes[personaKey].augmented.value)
        // Willpower by the book (SR5 p. 254); a module may name another attribute (hook sr5.fadingResistance)
        const fadingAttribute = fadingResistanceAttribute(actor, personaKey)
        SR5_EntityHelpers.updateModifier(matrixResistances.fading, game.i18n.localize(SR5.characterAttributes[fadingAttribute]), "linkedAttribute", attributes[fadingAttribute].augmented.value)
        // A Monad of the original strain resists with Willpower + Firewall, on both its monitors (Dark Terrors p. 88)
        if (originalStrainDevice(actor) === item) SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        else SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, personaLabel, "linkedAttribute", specialAttributes[personaKey].augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.biofeedback, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Willpower'), "linkedAttribute", attributes.willpower.augmented.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dumpshock, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, item.name, "deviceRating", item.system.deviceRating)
        SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        break
      }
      case "baseDevice":
        if (actor.type === "actorDrone") {
          if (actorData.vehicleOwner.id && actorData.slaved) {
            let controler = actorData.vehicleOwner.system
            SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "controler", controler.matrix.resistances.matrixDamage.dicePool)
          } else {
            SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "deviceRating", actorData.matrix.deviceRating)
            SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", actorData.matrix.attributes.firewall.value)
          }
        } else if (actor.type === "actorDevice") {
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, item.name, "deviceRating", actorData.matrix.deviceRating)
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", actorData.matrix.attributes.firewall.value)
        } else if (actor.type === "actorSprite") {
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Level'), "level", matrix.deviceRating)
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
          SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Level'), "level", matrix.deviceRating)
          SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        } else if (actor.type === "actorAgent") {
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, `${game.i18n.localize('SR5.ProgramTypeAgent')}`, "itemRating", actorData.rating)
          SR5_EntityHelpers.updateModifier(matrixResistances.matrixDamage, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
          SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, `${game.i18n.localize('SR5.ProgramTypeAgent')}`, "itemRating", actorData.rating)
          SR5_EntityHelpers.updateModifier(matrixResistances.dataBomb, game.i18n.localize('SR5.Firewall'), "matrixAttribute", matrixAttributes.firewall.value)
        }
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${item.system.type}' deck type in generateMatrixResistances()`)
        return
    }

    for (let key of Object.keys(SR5.matrixResistances)) {
      SR5_EntityHelpers.updateDicePool(matrixResistances[key])
    }
  }

  static generateVehicleMatrix(actor, itemData) {
    let actorData = actor.system

    actorData.matrix.deviceRating = actorData.attributes.pilot.augmented.value
    actorData.matrix.programsMaximumActive.value = Math.ceil(actorData.matrix.deviceRating / 2)
    actorData.matrix.marks = itemData.marks
    actorData.matrix.markedItems = itemData.markedItems

    for (let key of Object.keys(SR5.matrixAttributes)) {
      actorData.matrix.attributes[key].base = 0
      SR5_EntityHelpers.updateModifier(actorData.matrix.attributes[key], game.i18n.localize('SR5.DeviceRating'), "linkedAttribute", actorData.matrix.deviceRating)
      SR5_EntityHelpers.updateValue(actorData.matrix.attributes[key])
    }

    SR5_EntityHelpers.updateValue(actorData.matrix.noise)
  }

  // Host types (Kill Code p. 48-52): a typed host takes its attributes from its rating and its type, the free ones
  // keeping the gamemaster's arrangement while it fits; with no type the attributes stay as entered, save for a host
  // never arranged, which gets the default order of SR5 p. 248 instead of four attributes at 0
  static applyHostType(matrix) {
    const stored = Object.fromEntries(HOST_ATTRIBUTES.map(key => [key, matrix.attributes[key].base]))
    const resolved = resolveHostAttributes(matrix.hostType, matrix.deviceRating, stored)
    if (!resolved) {
      const collection = matrix.attributesCollection
      const defaults = untypedHostDefaults(matrix.deviceRating, stored, [1, 2, 3, 4].some(i => collection[`value${i}isSet`]))
      if (!defaults) return
      for (let i = 1; i <= 4; i++) collection[`value${i}isSet`] = true
      for (const key of HOST_ATTRIBUTES) {
        matrix.attributes[key].base = defaults[key]
        SR5_EntityHelpers.updateModifier(matrix.attributes[key], game.i18n.format('SR5.HostUntypedDealt', {
          offset: hostTypeOffsetLabel(defaults[key], matrix.deviceRating)
        }), "hostType", 0)
      }
      return
    }
    // The collection only offers the free values, all of them already dealt
    for (let i = 1; i <= 4; i++) {
      matrix.attributesCollection[`value${i}`] = resolved.collection[i - 1] ?? 0
      matrix.attributesCollection[`value${i}isSet`] = true
    }
    const type = `${game.i18n.localize(SR5.hostTypes[matrix.hostType])} (KC p. ${HOST_TYPE_PAGES[matrix.hostType]})`
    for (const key of HOST_ATTRIBUTES) {
      const value = resolved.values[key]
      matrix.attributes[key].base = value
      const label = game.i18n.format(resolved.fixed.includes(key) ? 'SR5.HostTypeFixed' : 'SR5.HostTypeDealt', {
        type, offset: hostTypeOffsetLabel(value, matrix.deviceRating)
      })
      SR5_EntityHelpers.updateModifier(matrix.attributes[key], label, "hostType", 0)
    }
  }

  static generateDeviceMatrix(actor, itemData) {
    let actorData = actor.system, matrix = actorData.matrix,
      matrixAttributes = matrix.attributes

    actorData.matrix.marks = itemData.marks
    actorData.matrix.markedItems = itemData.markedItems
    matrix.deviceName = actor.name

    if (matrix.deviceType === "host") {
      matrix.attributesCollection.value1 = matrix.deviceRating
      matrix.attributesCollection.value2 = matrix.deviceRating + 1
      matrix.attributesCollection.value3 = matrix.deviceRating + 2
      matrix.attributesCollection.value4 = matrix.deviceRating + 3
      this.applyHostType(matrix)
    }

    //Handle Ice attack and defense
    if (matrix.deviceType === "ice") {
      //A designed IC keeps its own description (its recipe, written by the module that made it)
      if (!iceDesignOf(matrix)) actorData.description = game.i18n.localize(SR5.iceTypes[matrix.deviceSubType] + "_GE")
      if (!matrix.ice) matrix.ice = {
        attackDicepool: 0, defenseFirstAttribute: "", defenseSecondAttribute: "" 
      }
      matrix.ice.attackDicepool = matrix.deviceRating * 2
      matrix.actions.matrixPerception.test.dicePool = matrix.deviceRating * 2
      //SR5 p. 249: an IC uses its host's matrix attributes; with no host, its own
      const host = iceHostOf(actor), hostValues = iceHostAttributes(host)
      if (hostValues) for (const key of ICE_HOST_ATTRIBUTES) {
        matrixAttributes[key].base = hostValues[key]
        SR5_EntityHelpers.updateModifier(matrixAttributes[key], game.i18n.format('SR5.IceHostAttribute', {
          host: host.name
        }), "iceHost", 0)
      }
      SR5_EntityHelpers.updateValue(matrixAttributes.dataProcessing, 0)
      matrix.actions.matrixPerception.limit.value = matrixAttributes.dataProcessing.value
      //A designed IC defends against with the pair of the book's IC its recipe names (system/ice-design.js)
      switch (iceDefenseType(matrix)) {
        case "iceAcid":
        case "iceScramble":
          matrix.ice.defenseFirstAttribute = "willpower"
          matrix.ice.defenseSecondAttribute = "firewall"
          break
        case "iceBinder":
          matrix.ice.defenseFirstAttribute = "willpower"
          matrix.ice.defenseSecondAttribute = "dataProcessing"
          break
        case "iceCrash":
        case "iceBlack":
        case "iceKiller":
        case "iceProbe":
        case "iceSparky":
        case "iceShocker":
          matrix.ice.defenseFirstAttribute = "intuition"
          matrix.ice.defenseSecondAttribute = "firewall"
          break
        case "iceBlaster":
        case "iceTarBaby":
        case "iceCatapult":
        case "iceFlicker":
        case "iceSleuther":
        case "iceBlueGoo":
          matrix.ice.defenseFirstAttribute = "logic"
          matrix.ice.defenseSecondAttribute = "firewall"
          break
        case "iceJammer":
          matrix.ice.defenseFirstAttribute = "willpower"
          matrix.ice.defenseSecondAttribute = "attack"
          break
        case "iceTrack":
        case "iceMarker":
        case "iceBloodhound":
          matrix.ice.defenseFirstAttribute = "willpower"
          matrix.ice.defenseSecondAttribute = "sleaze"
          break
        case "icePatrol":
          break
        default:
          SR5_SystemHelpers.srLog(1, `Unknown '${matrix.deviceSubType}' ice type in generateDeviceMatrix()`)
      }
    }

    //Handle Attributes
    //A device, a maglock among them, has a Device Rating and two matrix attributes, Data Processing and Firewall, equal
    //to it (SR5 p. 235-236): no Attack, no Sleaze, and Noise Reduction and Sharing belong to rigger consoles
    if (isPlainDevice(matrix.deviceType, actorData.isDirectlyConnected)) {
      for (let key of Object.keys(SR5.matrixAttributes)) {
        matrixAttributes[key].base = (key === "dataProcessing" || key === "firewall") ? matrix.deviceRating : 0
        SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
      }
    } else {
      for (let key of Object.keys(SR5.matrixAttributes)) {
        SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
      }
    }

    SR5_EntityHelpers.updateValue(matrix.noise)
  }

  static generateSpriteMatrix(actor, itemData) {
    let actorData = actor.system,
      matrix = actorData.matrix,
      matrixAttributes = matrix.attributes

    actorData.matrix.marks = itemData.marks
    actorData.matrix.markedItems = itemData.markedItems
    matrix.deviceRating = actorData.level

    //Handle base matrix attributes
    for (let key of Object.keys(SR5.matrixAttributes)) {
      matrixAttributes[key].base = matrix.deviceRating
    }

    //Apply matrix attributes by type
    let label = `${game.i18n.localize(SR5.spriteTypes[actorData.type])}`
    // The type's modifiers to the Level (SR5 p. 261, Kill Code p. 110; module types: sprite-types.js)
    if (!spriteTypeDefinition(actorData.type)) {
      SR5_SystemHelpers.srLog(1, `Unknown '${actorData.type}' sprite type in generateSpriteMatrix()`)
    }
    const typeModifiers = spriteMatrixModifiers(actorData.type)
    for (let key of SPRITE_MATRIX_KEYS) {
      if (typeModifiers[key]) SR5_EntityHelpers.updateModifier(matrixAttributes[key], label, "spriteType", typeModifiers[key])
    }
    const initiativeBonus = spriteInitiativeBonus(actorData.type, actorData.level)
    if (initiativeBonus) SR5_EntityHelpers.updateModifier(actorData.initiatives.matrixInit, label, "spriteType", initiativeBonus)

    //handle matrix attributes
    for (let key of Object.keys(SR5.matrixAttributes)) {
      SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
    }

    SR5_EntityHelpers.updateValue(matrix.noise)
  }

  static generateAgentMatrix(actor, itemData) {
    let actorData = actor.system,
      matrixAttributes = actorData.matrix.attributes,
      //An agent without a creator is loaded on no device: no matrix attributes (SR5 p. 248), its rating still counts
      creatorMatrix = actorData.creatorData?.system?.matrix

    actorData.matrix.marks = itemData.marks
    actorData.matrix.markedItems = itemData.markedItems
    //Device
    if (creatorMatrix) actorData.matrix.deviceRating = creatorMatrix.deviceRating

    //Agent attributes are equal to the rating (Kill code page 26)
    for (let key of Object.keys(SR5.characterAttributes)) {
      actorData.attributes[key].augmented.value = actorData.rating
    }
    //Agent matrix attributes are the same as decker attributes
    for (let key of Object.keys(SR5.deckerAttributes)) {
      matrixAttributes[key].base = creatorMatrix?.attributes[key].value ?? 0
      SR5_EntityHelpers.updateValue(matrixAttributes[key], 0)
    }
    //Agent skills are equal to program rating
    for (let key of Object.keys(SR5.agentSkills)) {
      actorData.skills[key].rating.base = actorData.rating
      SR5_EntityHelpers.updateValue(actorData.skills[key].rating, 0)
      actorData.skills[key].test.base = actorData.skills[key].rating.value
      SR5_EntityHelpers.updateDicePool(actorData.skills[key].test, 0)
    }
    //Noise
    SR5_EntityHelpers.updateValue(actorData.matrix.noise)
    //Grid
    if (creatorMatrix) actorData.userGrid = creatorMatrix.userGrid
  }

  static applyProgramToAgent(actor) {
    let actorData = actor.system
    if (!actorData.creatorData?.items) return
    for (let i of actorData.creatorData.items) {
      if (i.type === "itemProgram" && (i.system.type === "common" || i.system.type === "hacking") && i.system.isActive) {
        if (Object.keys(i.system.customEffects).length) SR5_CharacterUtility.applyCustomEffects(i, actor)
      }
    }

  }

  static async updateProgramAgent(actor) {
    let actorObject = actor.toObject(false)
    if (game.actors) {
      for (let a of game.actors) {
        if (a.type === "actorAgent" && a.system.creatorId === actor.id && a.isOwner) {
          await a.update({
            "system.creatorData.items": actorObject.items
          })
        }
      }
    }

    if (canvas.scene) {
      for (let t of canvas.tokens.placeables) {
        //A linked token is the world actor, copied just above
        if (t.actor?.type === "actorAgent" && !t.document.actorLink && t.actor.system.creatorId === actor.id && t.actor.isOwner) {
          await t.actor.update({
            "system.creatorData.items": actorObject.items
          })
        }
      }
    }
  }

  static async updateMatrixEffect(actor){
    if (!actor.id) return
    let status, isStatusEffectOn, statusEffects = []
    isStatusEffectOn = actor.effects.find(e => e.statuses.has("matrixInit"))
    if (!actor.system.isDirectlyConnected) {
      if (!isStatusEffectOn) {
        status = await _getSRStatusEffect("matrixInit")
        statusEffects = statusEffects.concat(status)
      }
    } else {
      if (isStatusEffectOn) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", [isStatusEffectOn.id])
      }
    }
    if (statusEffects.length) await actor.createEmbeddedDocuments("ActiveEffect", statusEffects)

  }

  //////////////// MODIFS D'OBJETS ///////////////////

  // Modif dû à la possession d'un esprit
  static _actorModifPossession(item, actor) {
    let actorData = actor.system, actorAttribute = actorData.attributes
    let spiritForce = item.system.itemRating, spiritType = item.system.type, spiritAttributes = item.system.attributes

    // Attributes modifiers
    for (let key of Object.keys(SR5.characterPhysicalAttributes)) {
      if (actorAttribute[key].augmented.base < spiritForce) {
        SR5_EntityHelpers.updateModifier(actorAttribute[key].augmented, `${game.i18n.localize('SR5.Possession')} (${game.i18n.localize(SR5.spiritTypes[spiritType])})`, "possession", Math.floor(spiritForce / 2))
      }
    }
    for (let key of Object.keys(SR5.characterMentalAttributes)) {
      let mod = spiritAttributes[key] - actorAttribute[key].augmented.base
      SR5_EntityHelpers.updateModifier(actorAttribute[key].augmented, `${game.i18n.localize('SR5.Possession')} (${game.i18n.localize(SR5.spiritTypes[spiritType])})`, "possession", mod)
    }
    for (let key of Object.keys(SR5.characterSpecialAttributes)) {
      if (spiritAttributes[key]) {
        let mod = spiritAttributes[key] - actorData.specialAttributes[key].augmented.base
        SR5_EntityHelpers.updateModifier(actorData.specialAttributes[key].augmented, `${game.i18n.localize('SR5.Possession')} (${game.i18n.localize(SR5.spiritTypes[spiritType])})`, "possession", mod)
      }
    }

    // Skills modifiers
    for (let key of Object.keys(SR5.skillGroups)) {
      if (actorData.skillGroups[key]) {
        let mod = actorData.skillGroups[key].base
        SR5_EntityHelpers.updateModifier(actorData.skillGroups[key], `${game.i18n.localize('SR5.Possession')} (${game.i18n.localize(SR5.spiritTypes[spiritType])})`, "possession", -mod)
      }
    }
    for (let key of Object.keys(SR5.skills)) {
      if (actorData.skills[key]) {
        let spiritSkill = item.system.skill.find(skill => skill === key)
        if (spiritSkill === key) {
          let mod = spiritForce - actorData.skills[key].rating.value
          SR5_EntityHelpers.updateModifier(actorData.skills[key].rating, `${game.i18n.localize('SR5.Possession')} (${game.i18n.localize(SR5.spiritTypes[spiritType])})`, "possession", mod)
        } else {
          let mod = actorData.skills[key].rating.base
          SR5_EntityHelpers.updateModifier(actorData.skills[key].rating, `${game.i18n.localize('SR5.Possession')} (${game.i18n.localize(SR5.spiritTypes[spiritType])})`, "possession", -mod)
        }
      }
    }

    // Initiative "modifier"
    actorData.initiatives.physicalInit.dice.base = 2

    // Penalties modifiers (rules are so cryptic, I prefer to simplify and just put a "bonus" to penalty)
    SR5_EntityHelpers.updateModifier(actorData.penalties.condition.actual, `${game.i18n.localize('SR5.Possession')} (${game.i18n.localize(SR5.spiritTypes[spiritType])})`, "possession", spiritForce)

  }

  // SR5 p. 322-323: an active focus adds its Force to the tests of its category.
  // A focus that already carries a custom effect on the same target is left to that effect (older worlds).
  static applyFocusBonus(item, actor) {
    let focus = item.system, actorData = actor.system, force = parseInt(focus.itemRating) || 0
    if (force <= 0) return
    let targets = []
    switch (focus.type) {
      case "spellcasting":
      case "counterspelling":
      case "ritualSpellcasting":
        if (focus.subType && actorData.skills?.[focus.type]?.spellCategory?.[focus.subType]) targets.push({
          path: `system.skills.${focus.type}.spellCategory.${focus.subType}`, property: actorData.skills[focus.type].spellCategory[focus.subType]
        })
        // SR5 p. 323: a counterspelling focus also adds its Force to the spell defense pool shared with allies.
        // That pool has no spell category: only the most powerful focus counts, whatever its category,
        // and the gamemaster takes it off by hand when the category of the spell does not match (DjamZ's call)
        if (focus.type === "counterspelling" && actorData.magic?.counterSpellPool) {
          let pool = actorData.magic.counterSpellPool
          let current = pool.modifiers.find(m => m.type === "itemFocus")
          if (!current) SR5_EntityHelpers.updateModifier(pool, item.name, "itemFocus", force)
          else if (current.value < force) Object.assign(current, {
            source: item.name, value: force
          })
        }
        break
      case "summoning":
      case "binding":
      case "banishing":
        if (focus.subType && actorData.skills?.[focus.type]?.spiritType?.[focus.subType]) targets.push({
          path: `system.skills.${focus.type}.spiritType.${focus.subType}`, property: actorData.skills[focus.type].spiritType[focus.subType]
        })
        break
      case "alchemical":
        if (actorData.skills?.alchemy) targets.push({
          path: "system.skills.alchemy.test", property: actorData.skills.alchemy.test
        })
        break
      case "disenchanting":
        if (actorData.skills?.disenchanting) targets.push({
          path: "system.skills.disenchanting.test", property: actorData.skills.disenchanting.test
        })
        break
      case "power":
        // Natural and augmented Magic are the same rating for a focus: a custom effect on either replaces the automatic bonus.
        if (actorData.specialAttributes?.magic) targets.push({
          path: "system.specialAttributes.magic.augmented", property: actorData.specialAttributes.magic.augmented, aliases: ["system.specialAttributes.magic.natural"]
        })
        break
      case "centering":
        if (actorData.magic?.metamagics?.centeringValue) targets.push({
          path: "system.magic.metamagics.centeringValue", property: actorData.magic.metamagics.centeringValue
        })
        break
      case "spellShaping":
        if (actorData.magic?.metamagics?.spellShapingValue) targets.push({
          path: "system.magic.metamagics.spellShapingValue", property: actorData.magic.metamagics.spellShapingValue
        })
        break
      case "":
        // A focus whose type was never chosen has no automatic bonus, but its custom effects are compared below
        break
      default:
        // weapon, sustaining and qi foci have their own handling; masking and flexibleSignature have no pool in the system
        return
    }

    let customTargets = Object.values(item.system.customEffects || {
    }).map(e => e.target)
    // SR5 p. 321: only one focus adds its Force to a given test, the strongest one is kept.
    // Two power foci fall under the same rule (DjamZ, 2026-10-02): the exception of p. 322 only lets a power focus stack with a spell focus.
    actor._sr5FocusTargets ??= new Set()
    // An older focus without a category carries its bonus only as a custom effect: its tests are compared too.
    for (let path of customTargets) {
      let property = SR5_EntityHelpers.resolveObjectPath(path, actor)
      if (Array.isArray(property?.modifiers)) actor._sr5FocusTargets.add(property)
    }
    for (let target of targets) {
      actor._sr5FocusTargets.add(target.property)
      if ([target.path, ...(target.aliases || [])].some(path => customTargets.includes(path))) continue
      let modifiers = target.property.modifiers
      if (!Array.isArray(modifiers)) continue
      let index = modifiers.findIndex(m => m.type === "itemFocus" && m.value > 0 && !m.isMultiplier)
      if (index === -1) SR5_EntityHelpers.updateModifier(target.property, item.name, "itemFocus", force)
      else if (modifiers[index].value < force) modifiers[index] = {
        source: item.name, type: "itemFocus", value: force, isMultiplier: false
      }
    }
  }

  // A focus carrying its bonus as a custom effect is read after the automatic bonus of
  // the foci before it: once all items are read, keep only the strongest focus per test.
  // Natural Magic feeds augmented Magic: a focus on each would both count, so they are compared together.
  static keepStrongestFocus(actor) {
    let targets = actor._sr5FocusTargets || new Set(), magic = actor.system.specialAttributes?.magic
    let magicRatings = magic ? [magic.natural, magic.augmented].filter(p => Array.isArray(p?.modifiers)) : []
    for (let property of targets) if (!magicRatings.includes(property)) this.keepStrongestFocusOn(property)
    if (magicRatings.some(p => targets.has(p))) this.keepStrongestFocusOn(...magicRatings)
    delete actor._sr5FocusTargets
  }

  // SR5 p. 321: among the foci adding their Force to the same test, only the strongest is kept.
  static keepStrongestFocusOn(...properties) {
    let foci = properties.flatMap(property => property.modifiers.filter(m => m.type === "itemFocus" && m.value > 0 && !m.isMultiplier).map(modifier => ({
      property, modifier
    })))
    if (foci.length < 2) return
    let strongest = foci.reduce((a, b) => (b.modifier.value > a.modifier.value ? b : a))
    for (let focus of foci) if (focus !== strongest) focus.property.modifiers.splice(focus.property.modifiers.indexOf(focus.modifier), 1)
  }

  // SR5 p. 246-248: the rules of a program are known by its name. An active program named like one of the
  // system's programs (in the current language or in English) switches the matching flag on, so the coded
  // programs work even when the item carries no custom effect.
  static switchProgramFlagByName(item, actor) {
    let programs = actor.system.matrix?.programs
    if (!programs) return
    let name = item.name.trim().toLowerCase()
    let key = Object.keys(SR5.programs).find(k => {
      let label = SR5.programs[k]
      return game.i18n.localize(label).trim().toLowerCase() === name || SR5_CharacterUtility._englishLabel(label) === name
    })
    if (key && programs[key]) programs[key].isActive = true
  }

  // English fallback label of a translation key ("SR5.ProgramHammer" -> "hammer"), for worlds played in another language
  static _englishLabel(label) {
    let english = game.i18n._fallback?.SR5?.[label.slice(4)]
    return typeof english === "string" ? english.trim().toLowerCase() : ""
  }

  // A situational effect leaves a zero-valued marker on its target, which the roll reading that target
  // turns into a box of the roll dialog (roll-helpers/situational.js); an effect on "tests linked to an
  // attribute" or on "any roll" has no target on the sheet and is matched at roll time
  static registerSituationalEffect(item, actor, customEffect) {
    let value = situationalValue(customEffect, item.system)
    if (value === null) return
    if (!actor.situationalEffects) actor.situationalEffects = []
    let effect = {
      source: item.name, value, when: customEffect.when || "", situational: !!customEffect.situational
    }
    if (typeof customEffect.type === "string" && customEffect.type.endsWith("Replace")) effect.replace = true
    //Condition on the target's metatype (The Complete Trog p. 179), read when the roll is prepared
    if (customEffect.situational && customEffect.targetMetatype) Object.assign(effect, {
      targetMetatype: customEffect.targetMetatype, targetMetatypeMode: customEffect.targetMetatypeMode === "isNot" ? "isNot" : "is"
    })
    if (isRollTestsTarget(customEffect.target)) {
      effect.scope = customEffect.target.slice(ROLL_TESTS_PREFIX.length)
      actor.situationalEffects.push(effect)
      return
    }
    // No roll reads an attribute's modifiers: a situational effect on one goes to the tests linked to it
    let attribute = attributeRedirect(customEffect.target)
    if (attribute) {
      effect.scope = attribute
      actor.situationalEffects.push(effect)
      return
    }
    // A target no roll dialog reads: the item sheet warns about it, nothing is applied
    if (!situationalReadable(customEffect.target)) {
      SR5_SystemHelpers.srLog(2, `Situational effect of '${item.name}' on '${customEffect.target}', which no roll reads`)
      return
    }
    let targetObject = SR5_EntityHelpers.resolveObjectPath(customEffect.target, actor)
    if (!targetObject?.modifiers) return
    let index = actor.situationalEffects.push(effect) - 1
    SR5_EntityHelpers.updateModifier(targetObject, item.name, `${SITUATIONAL_PREFIX}${index}`, 0)
  }

  // An effect on the rolls of whoever targets the bearer, or of whoever is within its aura: kept on the
  // bearer, read by the other actors' rolls when they are prepared (roll-helpers/indirect.js)
  static registerIndirectEffect(item, actor, customEffect) {
    let value = situationalValue(customEffect, item.system)
    if (value === null) return
    let effect = indirectEffectOf(customEffect, item.name, value)
    if (!effect) return
    if (!actor.indirectEffects) actor.indirectEffects = []
    actor.indirectEffects.push(effect)
  }

  // Mentor spirit (SR5 p. 76, 323-324): only the first one counts; its effects follow the actor's block,
  // the Adept block gives Power Points, and the Mask (Forbidden Arcana p. 176) is an optional rule
  static applyMentorSpirit(item, actor) {
    if (!actor.system.magic) return
    if (!isFollowedMentor(item, actor.items)) {
      SR5_SystemHelpers.srLog(2, `Mentor spirit '${item.name}' ignored: '${actor.name}' already follows a mentor`)
      return
    }
    const magic = mentorMagic(actor.system.specialAttributes?.magic, actor.system.essence, SR5ShopGrades.greywareMagicPenalty(actor.items), essenceAdjustment(actor))
    const path = mentorPathFor(actor.system.magic?.magicType, item.system.mysticPath)
    const maskRule = game.settings.get("sr5", "mentorMask")
    if (Object.keys(item.system.customEffects).length) SR5_CharacterUtility.applyCustomEffects(item, actor)
    if (mentorMaskOn(path, item.system, maskRule, magic, actor.system.magic?.magicType)) actor.system.magic.mentorMask = true
    const powerPoints = mentorPowerPoints(path, item.system, maskRule, magic)
    if (powerPoints) SR5_EntityHelpers.updateModifier(actor.system.magic.powerPoints.maximum, item.name, item.type, powerPoints)
  }

  static applyCustomEffects(item, actor) {
    let itemData = item.system
    // Mentor spirit: the effects of the actor's own block only, nothing with a Magic of 0 (SR5 p. 324)
    const mentorPath = item.type === "itemMentorSpirit" ? mentorPathFor(actor.system.magic?.magicType, itemData.mysticPath) : null
    const mentorMagicValue = item.type === "itemMentorSpirit" ? mentorMagic(actor.system.specialAttributes?.magic, actor.system.essence, SR5ShopGrades.greywareMagicPenalty(actor.items), essenceAdjustment(actor)) : 0

    for (let [effectKey, customEffect] of Object.entries(itemData.customEffects)) {
      let skipCustomEffect = false,
        cumulative = customEffect.cumulative,
        isMultiplier = false

      if (!customEffect.target || !customEffect.type) {
        SR5_SystemHelpers.srLog(3, `Empty custom effect target or type in applyCustomEffects()`, customEffect)
        skipCustomEffect = true
      }

      // A Strength or Agility enhancement plugged into a cyberlimb raises that limb only (SR5 p. 460, cyberlimb.js);
      // a situational one stays a box, for the tests made with that limb that no weapon carries
      if (item.type === "itemAugmentation" && !customEffect.situational && isLimbAttributeTarget(customEffect.target) && hostLimb(item.id, actor.items)) skipCustomEffect = true
      // For effect depending on wifi
      if (customEffect.wifi && !itemData.wirelessTurnedOn) skipCustomEffect = true
      // For transferable effect
      if (customEffect.transfer) skipCustomEffect = true
      // A factory mod: its effect on the printed profile is already there (Rigger 5.0 p. 156)
      if (item.type === "itemVehicleMod" && factorySkipsEffect(itemData.isFactory, customEffect)) skipCustomEffect = true
      // An Autopilot or Sensor replacement is in the base of the attribute already (applyVehicleReplacements)
      if (item.type === "itemVehicleMod" && actor.type === "actorDrone" && replacedVehicleAttributeOf(customEffect)) skipCustomEffect = true
      // Drugs
      // Drugs: an effect applies in its own phase, the rise or the crash (entities/items/drug-phase.js)
      if (item.type === "itemDrug") {
        skipCustomEffect = !customEffect.target || !customEffect.type || !!customEffect.transfer ||
          !drugEffectApplies(customEffect, phaseFromFlags(itemData.isActive, itemData.wirelessTurnedOn), item.flags?.sr5)
      }
      // Quality : if an effect has "wifi on" check box to true, effect is always turned on, even if quality is not "equiped"
      if (item.type === "itemQuality") {
        if (itemData.isActive && customEffect.wifi) skipCustomEffect = false
        else if (!itemData.isActive && customEffect.wifi) skipCustomEffect = false
        else if (!itemData.isActive) skipCustomEffect = true
      }
      if (item.type === "itemMentorSpirit" && !mentorEffectApplies(customEffect.mentorPath, mentorPath, mentorMagicValue)) continue

      // Effects on other actors' rolls (whoever targets me, an aura) are never applied to the bearer
      if (isIndirect(customEffect)) {
        if (!skipCustomEffect) SR5_CharacterUtility.registerIndirectEffect(item, actor, customEffect)
        continue
      }

      // A situational effect on a movement rate (Dark Terrors p. 180): a box of the movement block, applied while ticked
      if (!skipCustomEffect && customEffect.situational && situationalMovement(customEffect.target)) {
        let key = movementEffectKey(item.id, effectKey)
        let on = movementEffectOn(actor.system.movementSituationalOn, key)
        if (!actor.movementSituational) actor.movementSituational = []
        actor.movementSituational.push({
          key, source: item.name, when: customEffect.when || "", on
        })
        if (!on) continue
      }
      // Situational effects and effects on tests linked to an attribute are offered at roll time
      else if (!skipCustomEffect && (customEffect.situational || isRollTestsTarget(customEffect.target))) {
        SR5_CharacterUtility.registerSituationalEffect(item, actor, customEffect)
        continue
      }

      let targetObject = SR5_EntityHelpers.resolveObjectPath(customEffect.target, actor)
      if (targetObject == null) skipCustomEffect = true

      if (!skipCustomEffect) {
        SR5_SystemHelpers.srLog(3, `Applying Custom Effect for ${item.name}`)
        if (!customEffect.multiplier) customEffect.multiplier = 1

        //Special case for items'effects which modify all weapons weared by the actor
        if (customEffect.category === "weaponEffectTargets") {
          if (customEffect.target === "system.itemsProperties.weapon.accuracy") {
            customEffect.value = (customEffect.value || 0)
            SR5_EntityHelpers.updateModifier(targetObject, `${item.name}`, item.type, customEffect.value * customEffect.multiplier, isMultiplier, cumulative, customEffect.type)
            continue
          }
          //Reach of the melee weapons of a type (or of the kicks), as their Damage Value: read by utilityItem.js
          if (customEffect.target === "system.itemsProperties.weapon.reach") {
            customEffect.value = (customEffect.value || 0)
            SR5_EntityHelpers.updateModifier(targetObject, `${item.name}`, item.type, customEffect.value * customEffect.multiplier, isMultiplier, cumulative, customEffect.type)
            continue
          }
          if (customEffect.target === "system.itemsProperties.weapon.damageValue") {
            //A bonus read from the item's rating with an offset: bone density adds its rating − 1 (SR5 p. 463 ; arbitrage de DjamZ : table VF)
            //(worked out apart: the effect itself is left untouched, it is read again at each preparation)
            const rated = typeof customEffect.ratingOffset === "number"
            if (!rated) customEffect.value = (customEffect.value || 0)
            const value = rated ? Math.max(0, (Number(item.system.itemRating) || 0) + customEffect.ratingOffset) : customEffect.value
            //Damage that turns physical: (STR + n)P of the bone augmentations (SR5 p. 458 and 463). Kept apart,
            //never merged with another item's bonus: the weapon keeps the highest of them (utilityItem.js)
            if (customEffect.damageType === "physical") {
              targetObject.modifiers.push({
                source: item.name, type: item.type, value: value * customEffect.multiplier, isMultiplier, details: customEffect.type, damageType: "physical"
              })
              continue
            }
            SR5_EntityHelpers.updateModifier(targetObject, `${item.name}`, item.type, value * customEffect.multiplier, isMultiplier, cumulative, customEffect.type)
            continue
          }
        }

        //A called shot eased for some attacks only (effect field "skills"): the modifier keeps them, handleMartialArtsCalledShot
        //leaves it out of the attacks made with another skill. Without the field, the effect goes the usual way
        const calledShotSkills = calledShotSkillsOf(customEffect)
        if (calledShotSkills && isMartialArtsModifierTarget(customEffect.target)) {
          targetObject.modifiers.push({
            source: item.name, type: item.type, value: calledShotEffectValue(customEffect, itemData) * customEffect.multiplier, isMultiplier, skills: calledShotSkills
          })
          continue
        }

        //Special case for Hardened Armor : value based on actor attributes are not yet calculated, so we need a trick
        if (customEffect.category === "hardenedArmors") {
          if (customEffect.type !== "rating") {
            SR5_EntityHelpers.updateModifier(targetObject, item.name, item.type, 0, isMultiplier, cumulative, customEffect)
            continue
          }
        }

        //Special case for Energetic Aura
        if (customEffect.target === "system.specialProperties.energyAura") {
          foundry.utils.setProperty(actor, customEffect.target, customEffect.type)
          continue
        }

        //Aura of [element] (Street Grimoire p. 114): the element is named by the effect's type, as the energy aura's
        if (customEffect.target === "system.specialProperties.spellAuraElement") {
          foundry.utils.setProperty(actor, customEffect.target, customEffect.type)
          continue
        }

        //Special case for full Defense
        if (customEffect.target === "system.specialProperties.fullDefenseAttribute") {
          foundry.utils.setProperty(actor, customEffect.target, customEffect.type)
          SR5_CharacterUtility.updateDefenses(actor)
          continue
        }

        SR5_SystemHelpers.srLog(3, `Apply effect from '${item.name}'. Target: ${customEffect.target} / Value: ${customEffect.value}`)

        //Determine modifier type
        let modifierType = item.type
        if (item.type === "itemEffect") modifierType = item.system.type

        switch (customEffect.type) {
          case "rating":
            customEffect.value = (itemData.itemRating || 0)
            //A drone's own autosoft runs at most at its autopilot's rating; the console's keeps its own (Rigger 5.0 p. 131)
            if (SR5_CharacterUtility.isLocalDroneAutosoft(item, actor)) customEffect.value = localAutosoftRating(customEffect.value, droneAutopilot(actor.system, actor.items))
            SR5_EntityHelpers.updateModifier(targetObject, item.name, modifierType, customEffect.value * customEffect.multiplier, isMultiplier, cumulative)
            break
          case "hits":
            customEffect.value = (itemData.hits || 0)
            SR5_EntityHelpers.updateModifier(targetObject, item.name, modifierType, customEffect.value * customEffect.multiplier, isMultiplier, cumulative)
            break
          case "value":
            customEffect.value = (customEffect.value || 0)
            //Attribute Boost (SR5 p. 312) only adds to dice pools: its modifier is marked, and limitAttributeValue() leaves it out
            if (customEffect.poolOnly) {
              SR5_EntityHelpers.updateModifier(targetObject, item.name, modifierType, customEffect.value * customEffect.multiplier, isMultiplier, true)
              targetObject.modifiers[targetObject.modifiers.length - 1].poolOnly = true
              break
            }
            SR5_EntityHelpers.updateModifier(targetObject, item.name, modifierType, customEffect.value * customEffect.multiplier, isMultiplier, cumulative)
            break
          case "valueReplace":
          case "ratingReplace":
          case "hitsReplace": {
            //The target takes this value. A skill Limit, whose base is the key of its linked Limit, reads it back through
            //skillLimitValue(): the value stands in for the linked Limit, and the other effects on the skill Limit still
            //add to it (No Future p. 152: an instrument gives the Limit, a Synthlink raises it)
            //A crash only lowers: Little Smoke brings Perception and Willpower "réduits à 1" (Chrome Flesh p. 192), never up
            //to 1. The base of an attribute is set after the effects: the total is capped when it is worked out (helpers.js)
            if (item.type === "itemDrug" && effectPhase(customEffect) === "crash") {
              targetObject.modifiers.push({
                source: item.name, type: modifierType, value: 0, isMultiplier: false, ceiling: Number(customEffect.value) || 0
              })
              break
            }
            if (typeof targetObject.base === "number") targetObject.modifiers = []
            if (customEffect.type === "ratingReplace") customEffect.value = (itemData.itemRating || 0)
            if (customEffect.type === "hitsReplace") customEffect.value = (itemData.hits || 0)
            if (typeof targetObject.base === "number" && targetObject.base < 1) targetObject.base = 0
            let modValue = replaceModifierValue(targetObject.base, (customEffect.value || 0)) * customEffect.multiplier
            //Pushed as it is, marked from the start: updateModifier() may merge it into another modifier of the same
            //type, and the last one of the list is not always the one just made
            if (!isNaN(modValue)) targetObject.modifiers.push({
              source: item.name, type: modifierType, value: modValue, isMultiplier, replace: true
            })
            break
          }
          case "boolean": {
            let booleanValue
            if (customEffect.value === "true") booleanValue = true
            else booleanValue = false
            foundry.utils.setProperty(actor, customEffect.target, booleanValue)
            break
          }
          case "divide": {
            let divide = 1 / customEffect.multiplier
            SR5_EntityHelpers.updateModifier(targetObject, item.name, modifierType, divide, true, cumulative)
            break
          }
          default:
            SR5_SystemHelpers.srLog(1, `Unknown '${customEffect.type}' custom effect type in applyCustomEffects()`, customEffect)
        }

      }
    }
  }

}

// Each family of methods lives in its own file (utilityActor-*.js) and is copied here as statics of
// SR5_CharacterUtility: callers, wrappers and spies keep a single class, and internal calls go through it.
const FAMILIES = [SR5_CharacterVisionUtility, SR5_CharacterInitiativeUtility, SR5_CharacterHealthUtility, SR5_CharacterRiggingUtility, SR5_CharacterSkillsUtility, SR5_CharacterSpiritsUtility]
for (const family of FAMILIES) {
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(family))) {
    if (!["length", "name", "prototype"].includes(key)) Object.defineProperty(SR5_CharacterUtility, key, descriptor)
  }
}
linkHealthUtility(SR5_CharacterUtility)
linkRiggingUtility(SR5_CharacterUtility)
