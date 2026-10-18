import {
  SR5_EntityHelpers
} from "../helpers.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"
import {
  spriteTypeDefinition, spriteSkills
} from "./sprite-types.js"
import {
  insectRaceOf
} from "../items/insect-races.js"
import {
  skillsFromPowers
} from "../items/spirit-skill-power.js"
import {
  replacedValue
} from "./effect-replace.js"
import {
  SR5 
} from "../../config.js"
import {
  hasResonantDissonance
} from "./technomancer-streams.js"

// Skills: active, knowledge and language skills, and those of spirits and sprites.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
export class SR5_CharacterSkillsUtility {

  // Spirit Skills Calculations
  static generateSpiritSkills(actor) {
    let actorData = actor.system, skills = actorData.skills

    skills.astralCombat.rating.base = actorData.force.value
    skills.assensing.rating.base = actorData.force.value
    skills.perception.rating.base = actorData.force.value
    actorData.magic.tradition = actor.system.magic.tradition
    const customType = SR5_SpiritTypes.get(actorData.type)

    switch (SR5_SpiritTypes.baseType(actorData.type)) {
      case "watcher":
        skills.astralCombat.rating.base = Math.ceil(actorData.force.value / 2)
        skills.assensing.rating.base = Math.ceil(actorData.force.value / 2)
        skills.perception.rating.base = Math.ceil(actorData.force.value / 2)
        break
      case "homunculus":
        skills.astralCombat.rating.base = Math.ceil(actorData.force.value / 2)
        skills.assensing.rating.base = Math.ceil(actorData.force.value / 2)
        skills.perception.rating.base = Math.ceil(actorData.force.value / 2)
        skills.unarmedCombat.rating.base = Math.ceil(actorData.force.value / 2)
        break
      case "air":
      case "noxious":
        skills.exoticRangedWeapon.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.running.rating.base = actorData.force.value
        skills.flight.rating.base = actorData.force.value
        break
      case "water":
        skills.exoticRangedWeapon.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.swimming.rating.base = actorData.force.value
        break
      case "man":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.running.rating.base = actorData.force.value
        skills.spellcasting.rating.base = actorData.force.value
        skills.swimming.rating.base = actorData.force.value
        break
      case "earth":
      case "sludge":
      case "barren":
        skills.exoticRangedWeapon.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        break
      case "fire":
      case "nuclear":
        skills.exoticRangedWeapon.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.flight.rating.base = actorData.force.value
        break
      case "beasts":
      case "blood":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.running.rating.base = actorData.force.value
        break
      case "abomination":
        skills.exoticRangedWeapon.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.running.rating.base = actorData.force.value
        skills.gymnastics.rating.base = actorData.force.value
        break
      case "plague":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.spellcasting.rating.base = actorData.force.value
        break
      case "shadowMuse":
      case "shadowNightmare":
      case "shadowShade":
      case "shadowSuccubus":
      case "shadowWraith":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.con.rating.base = actorData.force.value
        skills.gymnastics.rating.base = actorData.force.value
        skills.intimidation.rating.base = actorData.force.value
        break
      case "shedim":
        skills.unarmedCombat.rating.base = actorData.force.value
        break
      case "shedimMaster":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.counterspelling.rating.base = actorData.force.value
        skills.gymnastics.rating.base = actorData.force.value
        skills.spellcasting.rating.base = actorData.force.value
        break
      case "insectScout":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.sneaking.rating.base = actorData.force.value
        skills.gymnastics.rating.base = actorData.force.value
        break
      case "insectCaretaker":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.spellcasting.rating.base = actorData.force.value
        skills.leadership.rating.base = actorData.force.value
        break
      case "insectNymph":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.gymnastics.rating.base = actorData.force.value
        skills.spellcasting.rating.base = actorData.force.value
        break
      case "insectWorker":
        skills.unarmedCombat.rating.base = actorData.force.value
        break
      case "insectSoldier":
        skills.exoticRangedWeapon.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.counterspelling.rating.base = actorData.force.value
        skills.gymnastics.rating.base = actorData.force.value
        break
      case "insectQueen":
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.counterspelling.rating.base = actorData.force.value
        skills.con.rating.base = actorData.force.value
        skills.gymnastics.rating.base = actorData.force.value
        skills.spellcasting.rating.base = actorData.force.value
        skills.leadership.rating.base = actorData.force.value
        skills.negotiation.rating.base = actorData.force.value
        break
      case "guardian":
        skills.exoticRangedWeapon.rating.base = actorData.force.value
        skills.clubs.rating.base = actorData.force.value
        skills.blades.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        break
      case "guidance":
        skills.arcana.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.counterspelling.rating.base = actorData.force.value
        break
      case "plant":
        skills.exoticRangedWeapon.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        skills.counterspelling.rating.base = actorData.force.value
        break
      case "task":
        skills.artisan.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        break
      case "anarch":
        // No Astral Combat in its block (Howling Shadows p. 130)
        skills.astralCombat.rating.base = 0
        skills.assensing.rating.base = actorData.force.value
        skills.automatics.rating.base = actorData.force.value
        skills.blades.rating.base = actorData.force.value
        skills.clubs.rating.base = actorData.force.value
        skills.con.rating.base = actorData.force.value
        skills.demolitions.rating.base = actorData.force.value
        skills.disguise.rating.base = actorData.force.value
        skills.forgery.rating.base = actorData.force.value
        skills.gymnastics.rating.base = actorData.force.value
        skills.impersonation.rating.base = actorData.force.value
        skills.locksmith.rating.base = actorData.force.value
        skills.palming.rating.base = actorData.force.value
        skills.perception.rating.base = actorData.force.value
        skills.pistols.rating.base = actorData.force.value
        skills.sneaking.rating.base = actorData.force.value
        skills.throwingWeapons.rating.base = actorData.force.value
        skills.unarmedCombat.rating.base = actorData.force.value
        break
    }

    if (customType) {
      const ratio = SR5_SpiritTypes.baseSkillsRatio(customType)
      if (ratio) {
        const rating = ratio === "half" ? Math.ceil(actorData.force.value / 2) : actorData.force.value
        skills.astralCombat.rating.base = rating
        skills.assensing.rating.base = rating
        skills.perception.rating.base = rating
      }
      for (const key of SR5_SpiritTypes.noBaseSkills(customType)) skills[key].rating.base = 0
      SR5_SpiritTypes.applySkills(customType, skills, actorData.force.value)
    }
    //Skills an insect race always has, at Force like the caste's (Dark Terrors p. 25-33)
    const insectRace = insectRaceOf(SR5_SpiritTypes.baseType(actorData.type) || actorData.type, actorData.insectRace)
    for (const key of insectRace?.skills || []) if (skills[key]) skills[key].rating.base = actorData.force.value
    //Skill power (Aetherology p. 39): an active skill in place of a power, at Force like the type's own
    for (const key of skillsFromPowers(actor.items)) if (skills[key]) skills[key].rating.base = actorData.force.value

    for (let key of Object.keys(SR5.skills)) {
      if (skills[key] && skills[key].rating.base) {
        SR5_EntityHelpers.updateValue(skills[key].rating, 0)
        if (skills[key].rating.value) {
          skills[key].test.base = skills[key].rating.value
          this.applyPenalty("condition", skills[key].test, actor)
          this.applyPenalty("matrix", skills[key].test, actor)
          this.applyPenalty("magic", skills[key].test, actor)
          this.applyPenalty("special", skills[key].test, actor)
          SR5_EntityHelpers.updateDicePool(skills[key].test, 0)
        }
      }
    }
  }

  // Sprite Skills Calculations
  static generateSpriteSkills(actor) {
    let actorData = actor.system, skills = actorData.skills

    // The type's skills are rated at the Level (SR5 p. 261, Kill Code p. 110; module types: sprite-types.js)
    if (!spriteTypeDefinition(actorData.type)) {
      SR5_SystemHelpers.srLog(1, `Unknown '${actorData.type}' sprite type in '_generateSpriteSkills()'`)
      return
    }
    for (let key of spriteSkills(actorData.type)) {
      if (skills[key]) skills[key].rating.base = actorData.level
    }

    for (let key of Object.keys(SR5.skills)) {
      if (skills[key] && skills[key].rating.base) {
        SR5_EntityHelpers.updateValue(skills[key].rating, 0)
        if (skills[key].rating.value) {
          skills[key].test.base = skills[key].rating.value
          SR5_EntityHelpers.updateDicePool(skills[key].test, 0)
        }
      }
    }
  }

  // Skills and Skill Groups Calculations
  static updateSkills(actor) {
    let actorData = actor.system

    for (let skillGroup of Object.keys(SR5.skillGroups)) {
      if (actorData.skillGroups) SR5_EntityHelpers.updateValue(actorData.skillGroups[skillGroup], 0)
    }

    for (let key of Object.keys(SR5.skills)) {
      // Flight is optional for PCs: without the setting, the Athletics group must not grant it
      if (key === "flight" && actor.type === "actorPc" && !game.settings.get("sr5", "sr5FlightSkill")) continue
      if (actorData.skills[key]) {
        if (actorData.skills[key].skillGroup) {
          let linkedGroup = actorData.skills[key].skillGroup
          if (actorData.skillGroups[linkedGroup].value) {
            if (actorData.skills[key].base === 0) {
              SR5_EntityHelpers.updateModifier(actorData.skills[key].rating, `${game.i18n.localize(SR5.skillGroups[linkedGroup])}`, "skillGroup", actorData.skillGroups[linkedGroup].value)
            } else if (actorData.skillGroups[linkedGroup].value > actorData.skills[key].rating.base) {
              let mod = actorData.skillGroups[linkedGroup].value - actorData.skills[key].rating.base
              SR5_EntityHelpers.updateModifier(actorData.skills[key].rating, `${game.i18n.localize(SR5.skillGroups[linkedGroup])}`, "skillGroup", mod)
            }
          }
        }
        let linkedAttribute = actorData.skills[key].linkedAttribute
        if (SR5.characterSpecialAttributes[linkedAttribute]) {
          let label = `${game.i18n.localize(SR5.characterSpecialAttributes[linkedAttribute])}`
          SR5_EntityHelpers.updateModifier(actorData.skills[key].test, label, "linkedAttribute", actorData.specialAttributes[linkedAttribute].augmented.value)
        } else {
          let label = `${game.i18n.localize(SR5.characterAttributes[linkedAttribute])}`
          SR5_EntityHelpers.updateModifier(actorData.skills[key].test, label, "linkedAttribute", actorData.attributes[linkedAttribute].augmented.value)
        }
        SR5_EntityHelpers.updateValue(actorData.skills[key].rating, 0)
        if (actorData.skills[key].rating.value) {
          actorData.skills[key].test.base = 0
          if (actorData.skills[key].rating.base > 0) SR5_EntityHelpers.updateModifier(actorData.skills[key].test, `${game.i18n.localize(SR5.skills[key])}`, "skillRating", actorData.skills[key].rating.base)
          actorData.skills[key].test.modifiers = actorData.skills[key].test.modifiers.concat(SR5_EntityHelpers.ratingModifiersForTest(actorData.skills[key].rating))
          this.keepStrongestFocusOn(actorData.skills[key].test)
        } else {
          if (actorData.skills[key].canDefault) {
            actorData.skills[key].test.base = 0
            SR5_EntityHelpers.updateModifier(actorData.skills[key].test, game.i18n.localize('SR5.Defaulting'), "skillRating", -1)
          } else {
            actorData.skills[key].test.modifiers = []
          }
        }
        //BackgroundCount
        if ((linkedAttribute == 'magic' && actorData.magic.bgCount.value !== 0) ||
					key === "astralCombat" || key === "assensing") {
          if (actorData.magic.bgCount.value < 0) actorData.skills[key].test.modifiers = actorData.skills[key].test.modifiers.concat(actorData.magic.bgCount.modifiers)
          else actorData.skills[key].limit.modifiers = actorData.skills[key].limit.modifiers.concat(actorData.magic.bgCount.modifiers)
        }
        this.applyPenalty("condition", actorData.skills[key].test, actor)
        this.applyPenalty("matrix", actorData.skills[key].test, actor)
        this.applyPenalty("magic", actorData.skills[key].test, actor)
        this.applyPenalty("special", actorData.skills[key].test, actor)
        //Écho Dissonance résonante (Better Than Bad p. 145): in hot sim, +2 dice to Compiling and Decompiling
        if ((key === "compiling" || key === "decompiling") && actorData.matrix?.userMode === "hotsim" && hasResonantDissonance(actor)) {
          SR5_EntityHelpers.updateModifier(actorData.skills[key].test, game.i18n.localize('SR5.EchoResonantDissonance'), "echo", 2)
        }
        SR5_EntityHelpers.updateDicePool(actorData.skills[key].test, 0)

        // limit calculation
        let linkedLimit = actorData.skills[key].limit.base
        //An effect may give the skill its own Limit (No Future instruments, Animal Sense): it stands in for the linked
        //one, and the other modifiers still add to it (a Synthlink, No Future p. 152)
        const replacedLimit = replacedValue(actorData.skills[key].limit.modifiers)
        if (replacedLimit !== undefined) {
          actorData.skills[key].limit.value = replacedLimit + SR5_EntityHelpers.modifiersSum(actorData.skills[key].limit.modifiers.filter(m => !m.replace))
        } else if (actorData.limits[linkedLimit]) {
          actorData.skills[key].limit.value = actorData.limits[linkedLimit].value + SR5_EntityHelpers.modifiersSum(actorData.skills[key].limit.modifiers)
        }
      }
    }

    if (actor.type !== "actorSprite") {
      for (let key of Object.keys(SR5.spellCategories)) {
        if (actorData.skills.spellcasting.rating.value > 0) actorData.skills.spellcasting.spellCategory[key].modifiers = actorData.skills.spellcasting.spellCategory[key].modifiers.concat(actorData.skills.spellcasting.test.modifiers)
        if (actorData.skills.counterspelling.rating.value > 0) actorData.skills.counterspelling.spellCategory[key].modifiers = actorData.skills.counterspelling.spellCategory[key].modifiers.concat(actorData.skills.counterspelling.test.modifiers)
        if (actorData.skills.ritualSpellcasting.rating.value > 0) actorData.skills.ritualSpellcasting.spellCategory[key].modifiers = actorData.skills.ritualSpellcasting.spellCategory[key].modifiers.concat(actorData.skills.ritualSpellcasting.test.modifiers)
        if (actorData.skills.alchemy.rating.value > 0) actorData.skills.alchemy.spellCategory[key].modifiers = actorData.skills.alchemy.spellCategory[key].modifiers.concat(actorData.skills.alchemy.test.modifiers)
        // SR5 p. 321: a focus on the whole skill and a focus on this category add to the same test
        for (let skill of ["spellcasting", "counterspelling", "ritualSpellcasting", "alchemy"]) this.keepStrongestFocusOn(actorData.skills[skill].spellCategory[key])
        SR5_EntityHelpers.updateDicePool(actorData.skills.spellcasting.spellCategory[key], 0)
        SR5_EntityHelpers.updateDicePool(actorData.skills.counterspelling.spellCategory[key], 0)
        SR5_EntityHelpers.updateDicePool(actorData.skills.ritualSpellcasting.spellCategory[key], 0)
        SR5_EntityHelpers.updateDicePool(actorData.skills.alchemy.spellCategory[key], 0)
      }

      for (let key of Object.keys(SR5.spiritTypes)) {
        actorData.skills.summoning.spiritType[key].modifiers = actorData.skills.summoning.spiritType[key].modifiers.concat(actorData.skills.summoning.test.modifiers)
        actorData.skills.binding.spiritType[key].modifiers = actorData.skills.binding.spiritType[key].modifiers.concat(actorData.skills.binding.test.modifiers)
        actorData.skills.banishing.spiritType[key].modifiers = actorData.skills.banishing.spiritType[key].modifiers.concat(actorData.skills.banishing.test.modifiers)
        for (let skill of ["summoning", "binding", "banishing"]) this.keepStrongestFocusOn(actorData.skills[skill].spiritType[key])
        SR5_EntityHelpers.updateDicePool(actorData.skills.summoning.spiritType[key], 0)
        SR5_EntityHelpers.updateDicePool(actorData.skills.binding.spiritType[key], 0)
        SR5_EntityHelpers.updateDicePool(actorData.skills.banishing.spiritType[key], 0)
      }

      for (let key of Object.keys(SR5.perceptionTypes)) {
        SR5_EntityHelpers.updateValue(actorData.skills.perception.perceptionType[key].test)
        SR5_EntityHelpers.updateValue(actorData.skills.perception.perceptionType[key].limit)
      }
    }
  }

  // Knowledge Dice Pools Calculations
  static _generateKnowledgeSkills(item, actor) {
    let itemData = item.system
    let actorData = actor.system, attributes = actorData.attributes
    SR5_EntityHelpers.updateValue(itemData.rating)

    switch (itemData.type) {
      case "academic":
      case "professional":
        itemData.linkedAttribute = "logic"
        break
      case "interests":
      case "street":
      case "tactics":
        itemData.linkedAttribute = "intuition"
        break
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${itemData.type}' knowledge type in '_generateKnowledgeSkills()'`)
        return
    }

    let label = `${game.i18n.localize(SR5.characterAttributes[itemData.linkedAttribute])}`
    SR5_EntityHelpers.updateModifier(itemData.test, item.name, "skillRating", itemData.rating.value)
    SR5_EntityHelpers.updateModifier(itemData.test, label, "linkedAttribute", attributes[itemData.linkedAttribute].augmented.value)
    if (actor.system.knowledgeSkills.modifiers) {
      itemData.test.modifiers = itemData.test.modifiers.concat(actor.system.knowledgeSkills.modifiers)
    }
    this.applyPenalty("condition", itemData.test, actor)
    this.applyPenalty("matrix", itemData.test, actor)
    this.applyPenalty("magic", itemData.test, actor)
    this.applyPenalty("special", itemData.test, actor)
    SR5_EntityHelpers.updateDicePool(itemData.test)
  }

  // Language Skills Calculations
  static _generateLanguageSkills(item, actor) {
    let itemData = item.system
    let attributes = actor.system.attributes
    SR5_EntityHelpers.updateValue(itemData.rating)

    if (!itemData.isNative) {
      SR5_EntityHelpers.updateModifier(itemData.test, item.name, "skillRating", itemData.rating.value)
      SR5_EntityHelpers.updateModifier(itemData.test, game.i18n.localize('SR5.Intuition'), "linkedAttribute", attributes.intuition.augmented.value)
      if (actor.system.languageSkills.modifiers) itemData.test.modifiers = itemData.test.modifiers.concat(actor.system.languageSkills.modifiers)
      this.applyPenalty("condition", itemData.test, actor)
      this.applyPenalty("matrix", itemData.test, actor)
      this.applyPenalty("magic", itemData.test, actor)
      this.applyPenalty("special", itemData.test, actor)
      SR5_EntityHelpers.updateDicePool(itemData.test, 0)
    }
  }
}
