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
  transhumanGift, currentEssenceHole
} from "../../system/implant-essence.js"
import {
  gruntProfileEssence
} from "../../system/grunt-profile-essence.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"
import {
  augmentationCapExcess, uncappedRating, limitBase, limitCapNote, CAP_NOTE_LIMITS
} from "./augmentationCap.js"
import {
  limitAttributeValue
} from "./poolOnlyAttribute.js"
import {
  SR5 
} from "../../config.js"
import {
  ELEMENTAL_SPIRIT_TYPES, astralReputation, wildReputation
} from "../items/spirit-bonds.js"
import {
  applyCharacterLedger
} from "../../system/spirit-ledger.js"
import {
  streamOf, resonanceRestoredByStream, machineMindRating
} from "./technomancer-streams.js"
import {
  strengthRecoil
} from "../../system/cyberlimb.js"
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
import {
  SR5_CharacterMagicUtility
} from "./utilityActor-magic.js"
import {
  SR5_CharacterDrugsUtility
} from "./utilityActor-drugs.js"
import {
  SR5_CharacterMatrixUtility, linkMatrixUtility
} from "./utilityActor-matrix.js"
import {
  SR5_CharacterEffectsUtility, linkEffectsUtility
} from "./utilityActor-effects.js"


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
    // A grunt's profile Essence (SR5 p. 381) between 0 and 6, whatever wrote it: an import, an older sheet (grunt-profile-essence.js)
    if (actor.type === "actorGrunt") essence.base = gruntProfileEssence(essence.base)
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

}

// Each family of methods lives in its own file (utilityActor-*.js) and is copied here as statics of
// SR5_CharacterUtility: callers, wrappers and spies keep a single class, and internal calls go through it.
const FAMILIES = [SR5_CharacterVisionUtility, SR5_CharacterInitiativeUtility, SR5_CharacterHealthUtility, SR5_CharacterRiggingUtility, SR5_CharacterSkillsUtility, SR5_CharacterSpiritsUtility, SR5_CharacterMagicUtility, SR5_CharacterDrugsUtility, SR5_CharacterMatrixUtility, SR5_CharacterEffectsUtility]
for (const family of FAMILIES) {
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(family))) {
    if (!["length", "name", "prototype"].includes(key)) Object.defineProperty(SR5_CharacterUtility, key, descriptor)
  }
}
linkHealthUtility(SR5_CharacterUtility)
linkRiggingUtility(SR5_CharacterUtility)
linkMatrixUtility(SR5_CharacterUtility)
linkEffectsUtility(SR5_CharacterUtility)
