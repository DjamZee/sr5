import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import {
  STRUCTURED_DRAIN_FLOOR
} from "../roll-helpers/arcana-metamagics.js"
import {
  SR5
} from "../../config.js"
import {
  combatSpellMasteryBonus
} from "../../entities/items/magic-masteries.js"

//Add info for skill dicePool roll
export default async function spell(rollData, actor, item){
  let itemData = item.system,
    spellCategory = itemData.category,
    actorData = actor.system

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.CastSpell")} ${item.name}`

  //Determine dicepool composition
  rollData.dicePool.composition = actorData.skills.spellcasting.spellCategory[spellCategory].modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actorData.skills.spellcasting.spellCategory[spellCategory].modifiers)

  //Limit
  rollData.limit.type = "force"
  rollData.limit.base = actorData.specialAttributes.magic.augmented.value

  //Handle Actions
  rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "castSpell"
  })

  //Add others informations
  rollData.test.type = "spell"
  rollData.test.typeSub = itemData.subCategory
  rollData.magic.drain.type = "stun"
  rollData.magic.drain.modifiers.spell = {
    value: itemData.drain.value,
    label: game.i18n.localize("SR5.DrainModifier"),
  }
  rollData.damage.type = itemData.damageType
  rollData.damage.element = itemData.damageElement
  rollData.damage.elementSecond = itemData.damageElementSecond
  rollData.damage.source = "magical"
  rollData.magic.spell.type = itemData.type
  rollData.magic.spell.category = itemData.category
  rollData.magic.spell.isResisted = itemData.resisted
  rollData.magic.spell.range = itemData.range
  rollData.magic.force = actorData.specialAttributes.magic.augmented.value
  rollData.dialogSwitch.reagents = true
  //Structured Spellcasting (Forbidden Arcana p. 43): Drain -1 (minimum 1), no reckless casting, and reagents
  //cannot stand in for the limit
  if (actorData.magic.metamagics?.structuredSpellcasting){
    rollData.magic.structured = true
    rollData.magic.drainFloor = STRUCTURED_DRAIN_FLOOR
    rollData.magic.drain.modifiers.structuredSpellcasting = {
      value: -1,
      label: game.i18n.localize(SR5.drainModTypes.structuredSpellcasting),
    }
    rollData.dialogSwitch.reagents = false
  }
  //Mage Hunter (Forbidden Arcana p. 34): Drain +1 per level ; Death Sower (p. 40): DV and Drain +1 per level, combat spells only
  const masteries = actorData.magic.masteries
  const masteryBonus = combatSpellMasteryBonus(spellCategory, masteries?.mageHunter?.value, masteries?.deathSower?.value)
  //Mage Hunter is a trade the player chooses at each casting (review M1): a box in the dialog, unticked
  if (masteryBonus.drainMageHunter){
    rollData.magic.mageHunter = {
      level: masteryBonus.drainMageHunter, used: false
    }
    rollData.dialogSwitch.mageHunter = true
  }
  if (masteryBonus.drainDeathSower) rollData.magic.drain.modifiers.deathSower = {
    value: masteryBonus.drainDeathSower,
    label: game.i18n.localize(SR5.drainModTypes.deathSower),
  }
  rollData.magic.spell.damageBonus = masteryBonus.damage
  rollData.dialogSwitch.specialization = true
  rollData.owner.itemUuid = item.uuid

  //Background count limit modifier
  if (actorData.magic.bgCount.value > 0){
    rollData = SR5_PrepareRollHelper.addBackgroundCountLimitModifiers(rollData, actor)
  }

  //Add special info for area spell
  if (itemData.range === "area" || itemData.spellAreaExtended){
    rollData.chatCard.templatePlace = true
    //Spell Shaping metamagic
    if (actorData.magic.metamagics.spellShaping) rollData.dialogSwitch.spellShaping = true
  }

  //If spell is resisted, check if an effect can be transfered
  if (!itemData.resisted){
    rollData = SR5_PrepareRollHelper.addTransferableEffect(rollData, item)
  }

  //Check if an object can resist to spell
  for (let e of Object.values(itemData.systemEffects)){
    if (e.value === "sre_ObjectResistance") rollData.magic.spell.objectCanResist = true
  }

  //Check if a spirit can aid sorcery
  SR5_PrepareRollHelper.handleSpiritAid(actor, item, rollData)

  return rollData
}