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
  MYSTIC_APTITUDE_ATTRIBUTES, mysticAptitudeKey, mysticAptitudeChoice, mysticAptitudeValue
} from "../items/adept-powers-btb.js"
import {
  SR5 
} from "../../config.js"
import {
  harmoniousDefensePool
} from "../../rolls/roll-helpers/arcana-metamagics.js"
import {
  effectiveSceneBackgroundCount, backgroundCountFor
} from "../../system/background-count.js"
import {
  updateGreyMana
} from "../../system/grey-mana.js"

// Magic: power points, tradition, astral values, counterspelling, masteries, mana, foci.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
export class SR5_CharacterMagicUtility {

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
}
