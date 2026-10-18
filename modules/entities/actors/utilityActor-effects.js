import {
  calledShotSkillsOf, calledShotEffectValue, isMartialArtsModifierTarget
} from "../../rolls/roll-helpers/calledShotSkills.js"
import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5ShopGrades
} from "../../interface/shop-grades.js"
import {
  essenceAdjustment
} from "../../system/implant-essence.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
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
  mentorPathFor, mentorEffectApplies, isFollowedMentor, mentorMagic, mentorPowerPoints, mentorMaskOn
} from "../items/mentor-spirits.js"
import {
  droneAutopilot, localAutosoftRating
} from "./rcc.js"
import {
  isLimbAttributeTarget, hostLimb
} from "../../system/cyberlimb.js"
import {
  factorySkipsEffect
} from "../../system/vehicle-factory.js"
import {
  replacedVehicleAttributeOf
} from "../../system/vehicle-mods.js"

// Custom effects: possession, situational and indirect effects, mentor spirits.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
// SR5_CharacterUtility itself, given by utilityActor.js (importing it here would make an import cycle)
let SR5_CharacterUtility
export function linkEffectsUtility(characterUtility) {
  SR5_CharacterUtility = characterUtility
}

export class SR5_CharacterEffectsUtility {

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
