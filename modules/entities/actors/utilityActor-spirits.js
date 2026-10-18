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
  insectRaceOf
} from "../items/insect-races.js"
import {
  homunculusMaterialRatings
} from "./homunculus.js"
import {
  SR5 
} from "../../config.js"
import {
  ELEMENTAL_MENTAL_ATTRIBUTES, ELEMENTAL_SPIRIT_TYPES, elementalReduction
} from "../items/spirit-bonds.js"
import {
  applySpiritLedger, freeSpiritEdge
} from "../../system/spirit-ledger.js"

// Spirits and sprites: their attributes and values.
// Statics of SR5_CharacterUtility, copied onto it by utilityActor.js: always call them through SR5_CharacterUtility.
export class SR5_CharacterSpiritsUtility {

  static updateSpiritAttributes(actor) {
    let actorData = actor.system, attributes = actorData.attributes, specialAttributes = actorData.specialAttributes, essence = actorData.essence
    //Traits and banishing total from the gamemaster's ledger (Forbidden Arcana p. 172-175)
    applySpiritLedger(actor, ELEMENTAL_SPIRIT_TYPES)

    //Valeur de base des attributs
    for (let key of Object.keys(SR5.characterAttributes)) {
      attributes[key].natural.base = actorData.force.value
    }
    actorData.activeSpecialAttribute = "magic"
    specialAttributes.magic.natural.base = actorData.force.value
    SR5_EntityHelpers.updateValue(specialAttributes.magic.natural)
    //Only a free spirit has Edge of its own (SR5 p. 306-307); a summoned or bound one has none, its summoner lends his (p. 306)
    //An extraplanar entity prints its own, CHC P/2 or P (Howling Shadows p. 128 and following)
    const customType = SR5_SpiritTypes.get(actorData.type)
    const typeEdge = SR5_SpiritTypes.edgeRating(customType, actorData.force.value)
    if (actorData.isFree && specialAttributes.edge) {
      specialAttributes.edge.natural.base = freeSpiritEdge(actorData.force.value, actorData.freeEdge)
      SR5_EntityHelpers.updateValue(specialAttributes.edge.natural)
    } else if (typeEdge !== null && specialAttributes.edge) {
      specialAttributes.edge.natural.base = typeEdge
      SR5_EntityHelpers.updateValue(specialAttributes.edge.natural)
    } else {
      delete specialAttributes.edge
      delete actorData.conditionMonitors?.edge
      delete actorData.statusBars?.edge
    }
    essence.base = actorData.force.value
    let label = `${game.i18n.localize('SR5.SpiritType')} (${SR5_SpiritTypes.label(actorData.type)})`
    const essenceModifier = SR5_SpiritTypes.essenceModifier(customType)
    if (essenceModifier) SR5_EntityHelpers.updateModifier(essence, label, "spiritType", essenceModifier)
    SR5_EntityHelpers.updateValue(essence)

    switch (SR5_SpiritTypes.baseType(actorData.type)) {
      case "watcher":
        attributes.body.natural.base = 0
        attributes.agility.natural.base = 0
        attributes.reaction.natural.base = 0
        attributes.strength.natural.base = 0
        SR5_EntityHelpers.updateModifier(attributes.willpower.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.logic.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.intuition.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.charisma.natural, label, 'spiritType', -2)
        break
      case "homunculus":
        // SR5 p. 301: the Body is the Structure of the material it is made of (table SR5 p. 198)
        attributes.body.natural.base = homunculusMaterialRatings(actorData.homunculusMaterial).structure
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', -2)
        // Stat block (SR5 p. 301, VO p. 298): WIL, LOG and INT 1; the VF prints CHA 3, the VO has no CHA column
        attributes.willpower.natural.base = 1
        attributes.logic.natural.base = 1
        attributes.intuition.natural.base = 1
        attributes.charisma.natural.base = 3
        break
      case "air":
      case "noxious":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +3)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +4)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', -3)
        break
      case "water":
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.charisma.natural, label, 'spiritType', +1)
        break
      case "sludge":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        break
      case "man":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.intuition.natural, label, 'spiritType', +1)
        break
      case "plague":
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.intuition.natural, label, 'spiritType', +1)
        break
      case "earth":
      case "barren":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +4)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', -1)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +4)
        SR5_EntityHelpers.updateModifier(attributes.logic.natural, label, 'spiritType', -1)
        break
      case "fire":
      case "nuclear":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +3)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', -2)
        SR5_EntityHelpers.updateModifier(attributes.intuition.natural, label, 'spiritType', +1)
        break
      case "beasts":
      case "abomination":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +2)
        break
      case "shadowMuse":
      case "shadowNightmare":
      case "shadowShade":
      case "shadowSuccubus":
      case "shadowWraith":
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +3)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.willpower.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.intuition.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.charisma.natural, label, 'spiritType', +2)
        break
      case "blood":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.logic.natural, label, 'spiritType', -1)
        break
      case "shedim":
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +1)
        break
      case "shedimMaster":
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.willpower.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.logic.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.intuition.natural, label, 'spiritType', +1)
        break
      case "insectCaretaker":
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +1)
        break
      case "insectNymph":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', -1)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +3)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', -1)
        break
      case "insectScout":
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        break
      case "insectSoldier":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +3)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +3)
        break
      case "insectWorker":
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +1)
        break
      case "insectQueen":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +5)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +3)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +4)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +5)
        SR5_EntityHelpers.updateModifier(attributes.willpower.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.logic.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.intuition.natural, label, 'spiritType', +1)
        break
      case "guardian":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +3)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +2)
        break
      case "guidance":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +3)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', -1)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +1)
        break
      case "plant":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', -1)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.logic.natural, label, 'spiritType', -1)
        break
      case "task":
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +2)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', +2)
        break
      case "anarch":
        SR5_EntityHelpers.updateModifier(attributes.body.natural, label, 'spiritType', -1)
        SR5_EntityHelpers.updateModifier(attributes.agility.natural, label, 'spiritType', -1)
        SR5_EntityHelpers.updateModifier(attributes.reaction.natural, label, 'spiritType', +1)
        SR5_EntityHelpers.updateModifier(attributes.strength.natural, label, 'spiritType', -1)
        break
      default:
        // A custom type with no base keeps the generic spirit values: every
        // attribute at Force, which the loop above has already set.
        if (!customType) {
          SR5_SystemHelpers.srLog(1, `Unknown ${actorData.type} spirit type in 'updateSpiritAttributes()'`)
          return false
        }
        break
    }

    if (customType) SR5_SpiritTypes.applyAttributes(customType, attributes, label)
    //Race of an insect spirit: Subterranean Termites +2, Goliath Beetles +4 to damage resistance (Dark Terrors p. 26-27)
    const insectRace = insectRaceOf(SR5_SpiritTypes.baseType(actorData.type) || actorData.type, actorData.insectRace)
    if (insectRace?.damageResistance) SR5_EntityHelpers.updateModifier(actorData.resistances.physicalDamage, game.i18n.localize(`SR5.InsectRace_${actorData.insectRace}`), "spiritType", insectRace.damageResistance)

    // Elemental trait (Forbidden Arcana p. 175): mental attributes lowered by half the Force, to a minimum of 1
    if (actorData.isElemental) {
      const traitLabel = game.i18n.localize('SR5.SpiritElemental')
      for (let key of ELEMENTAL_MENTAL_ATTRIBUTES) {
        const natural = attributes[key].natural
        const current = natural.base + (natural.modifiers ?? []).reduce((sum, m) => sum + (Number(m.value) || 0), 0)
        const reduction = elementalReduction(actorData.force.value, current)
        if (reduction) SR5_EntityHelpers.updateModifier(natural, traitLabel, 'spiritType', -reduction)
      }
    }
  }

  static updateSpriteValues(actor) {
    let actorData = actor.system, attributes = actorData.attributes, specialAttributes = actorData.specialAttributes, matrixAttributes = actorData.matrix.attributes

    //Base value of attributes. Hidden but needed for rolls.
    for (let key of Object.keys(SR5.characterAttributes)) {
      attributes[key].natural.base = actorData.level
    }
    specialAttributes.resonance.natural.base = actorData.level

    //Base Matrix Attributes
    for (let key of Object.keys(SR5.matrixAttributes)) {
      matrixAttributes[key].base = actorData.level
    }
    actorData.matrix.deviceRating = actorData.level
  }

  // Generate spirit values
  static setSpiritMagicType(actor) {
    if (actor.system.magic) actor.system.magic.magicType = "spirit"
  }

  static updateSpiritValues(actor) {
    SR5_EntityHelpers.updateValue(actor.system.force)
    //Hardened armor of a spirit type, "12R", "(P x 2) mystique (renforcée)" (Howling Shadows p. 128 and following):
    //a mystic one protects in the astral, the other against ordinary weapons; read by updateSpecialProperties
    const typeArmor = SR5_SpiritTypes.armor(SR5_SpiritTypes.get(actor.system.type), actor.system.force.value)
    const hardenedArmors = actor.system.specialProperties?.hardenedArmors
    if (typeArmor?.kind && hardenedArmors) {
      const key = typeArmor.kind === "mystic" ? "astral" : "normalWeapon"
      SR5_EntityHelpers.updateModifier(hardenedArmors[key], SR5_SpiritTypes.label(actor.system.type), "spiritType", typeArmor.value)
    }
    // A homunculus is always physical, custom types based on it included: physical initiative too, (P + 1) + 1D6
    // (SR5 p. 301), even when it was made astral first (a spirit created as another type, then changed)
    if (SR5_SpiritTypes.baseType(actor.system.type) === "homunculus") {
      actor.system.isMaterializing = true
      const initiatives = actor.system.initiatives
      if (initiatives?.astralInit?.isActive && initiatives.physicalInit) {
        initiatives.astralInit.isActive = false
        initiatives.physicalInit.isActive = true
      }
    }
  }
}
