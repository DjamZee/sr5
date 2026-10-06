import {
  replacedValue
} from "../../entities/actors/effect-replace.js"
import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5 
} from "../../config.js"
import {
  SR5_MiscellaneousHelpers 
} from "../roll-helpers/miscellaneous.js"
import {
  spendableStock, bindingCost
} from "../../system/reagents.js"
import {
  prepareSkillAttribute, SKILL_ATTRIBUTE_FLAG, syncBackgroundCount, backgroundCountApplies, backgroundCountInModifiers
} from "../roll-helpers/skillAttribute.js"
import {
  isSituationalType
} from "../roll-helpers/situational.js"

//Add info for skill dicePool roll
export default async function skill(rollData, rollType, rollKey, actor, chatData){
  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.SkillTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize(SR5.skills[rollKey])}`
    
  if(rollType === "skill"){
    //Determine base dicepool
    rollData.dicePool.base = actor.system.skills[rollKey].rating.value

    //Determine dicepool composition
    rollData.dicePool.composition = actor.system.skills[rollKey].rating.modifiers

    //The situational effects on this skill's test (SR5 p. 462) leave their marker on the test, not on the
    //rating: carried over so that the dialog offers their boxes, as on the skill + attribute button
    rollData.dicePool.modifiers = actor.system.skills[rollKey].test.modifiers
      .filter(m => isSituationalType(m.type))
      .map(m => ({
        type: m.type, label: m.source, source: m.source, value: m.value
      }))

    //Add others informations
    rollData.dialogSwitch.attribute = true
    rollData.dialogSwitch.penalty = true
  } else {
    //Add details to title
    if (actor.type === "actorDrone") {
      if (actor.system.controlMode === "autopilot") rollData.test.title += `${" + " + game.i18n.localize(SR5.vehicleAttributes[actor.system.skills[rollKey].linkedAttribute])}`
    } else rollData.test.title += `${" + " + game.i18n.localize(SR5.allAttributes[actor.system.skills[rollKey].linkedAttribute])}`

    //Determine dicepool composition
    rollData.dicePool.composition = SR5_PrepareRollHelper.getDicepoolComposition(actor.system.skills[rollKey].test.modifiers)

    //Determine base dicepool
    rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
        
    //Determine dicepool modififiers
    rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.skills[rollKey].test.modifiers)

    //SR5 p. 130: the attribute can be changed in the dialog, except on an opposed test whose pair the book sets
    if (actor.type !== "actorDrone" && !chatData?.test?.isOpposed){
      rollData = prepareSkillAttribute(rollData, actor.system, actor.getFlag?.("sr5", SKILL_ATTRIBUTE_FLAG)?.[rollKey], {
        flagKey: rollKey,
        linked: actor.system.skills[rollKey].linkedAttribute,
        titleBase: `${game.i18n.localize("SR5.SkillTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize(SR5.skills[rollKey])}`,
        alwaysInTitle: true,
        labels: SR5.allAttributes,
        localize: k => game.i18n.localize(k),
      })
    }
  }

  //Determine base limit
  //A Limit an effect replaced (No Future instruments, Animal Sense) has the replacing value as its base, and the other
  //modifiers on top: the replacing modifier is neither taken off the base nor shown as a modifier
  const skillLimitModifiers = actor.system.skills[rollKey].limit.modifiers.filter(m => !m.replace)
  rollData.limit.base = SR5_PrepareRollHelper.getBaseLimit(actor.system.skills[rollKey].limit.value, skillLimitModifiers)

  //Determine limit modififiers
  rollData.limit.modifiers = SR5_PrepareRollHelper.getLimitModifiers(rollData, skillLimitModifiers)

  //The background count follows the attribute in use (Grimoire des Ombres p. 30)
  if (rollData.skillAttribute){
    rollData.skillAttribute.skillKey = rollKey
    rollData = syncBackgroundCount(rollData, actor.system.magic?.bgCount, backgroundCountApplies(rollKey, rollData.skillAttribute.selected))
  }

  //Handle Actions: resisting an opposed test is no action of the target's (SR5 p. 44-45), nor is a test the
  //gamemaster calls for outside the character's phase (SR5 p. 164)
  if (!chatData?.test?.isOpposed && !SR5_MiscellaneousHelpers.isOutOfPhase(actor)) rollData.combat.actions = SR5_MiscellaneousHelpers.addActions(rollData.combat.actions, {
    type: "complex", value: 1, source: "useSkill"
  })

  //Add others informations
  rollData.test.type = "skillDicePool"
  rollData.test.typeSub = rollKey
  rollData.limit.type = actor.system.skills[rollKey].limit.base
  //A Limit an effect replaced (No Future instruments, Animal Sense) is no longer the linked one: the card says so
  if (replacedValue(actor.system.skills[rollKey].limit.modifiers) !== undefined) rollData.limit.type = "replaced"
  rollData.dialogSwitch.extended = true
  rollData.dialogSwitch.specialization = true

  //Special case for magical skills
  if(rollKey === "banishing" || rollKey === "binding" || rollKey === "counterspelling" || rollKey === "disenchanting" || rollKey === "summoning"){
    rollData.dialogSwitch.extended = false
    //Binding spends reagents too (SR5 p. 304): (Force x 25) drachms, set once the spirit is known below
    if (spendableStock(actor.system.magic) > 0) rollData.dialogSwitch.reagents = true
    rollData.magic.elements = actor.system.magic.elements
    //Add background count limit modifiers if any, unless the skill already carries them (Grimoire des Ombres p. 87):
    //counted once, not twice
    if (actor.system.magic.bgCount.value > 0 && backgroundCountApplies(rollKey, rollData.skillAttribute?.selected ?? "magic") &&
      !backgroundCountInModifiers(actor.system.magic.bgCount, actor.system.skills[rollKey].limit.modifiers)){
      rollData = SR5_PrepareRollHelper.addBackgroundCountLimitModifiers(rollData, actor)
    }
    //Astral Reputation (Street Grimoire p. 207): a penalty equal to it on Summoning, Binding and Banishing tests
    const reputation = actor.system.magic.astralReputation || 0
    //Present by default, the gamemaster can untick it in the dialog (DjamZ's ruling, 2026-10-06: "peut subir")
    if (reputation > 0 && ["summoning", "binding", "banishing"].includes(rollKey)) {
      rollData.magic.astralReputationMod = -reputation
      //The gamemaster's to untick, not the player's
      rollData.magic.astralReputationLocked = !game.user?.isGM
      rollData.dicePool.modifiers.push({
        type: "astralReputation",
        label: game.i18n.localize("SR5.AstralReputation"),
        value: -reputation,
      })
    }
  }

  //Add force default
  if (rollKey === "summoning") rollData.magic.force = 1

  //Special case for Astral combat
  if (rollKey === "astralCombat"){
    if (!actor.system.visions.astral.isActive) {
      ui.notifications.info(`${game.i18n.format("SR5.INFO_ActorIsNotInAstral", {
        name:actor.name
      })}`)
      return
    }
    rollData.damage.base = actor.system.magic.astralDamage.value
    rollData.damage.value = actor.system.magic.astralDamage.value
    rollData.dialogSwitch.extended = false
    rollData.dialogSwitch.chooseDamageType = true
  }

  //If roll has target, add special info to roll
  if (rollData.target.hasTarget){
    rollData = await getTargetedData(rollData, rollKey, actor)
  }

  //If roll is opposed, add special info to roll
  if(chatData?.test?.isOpposed){
    rollData = await getOpposedData(rollData, chatData, rollKey, actor)
  }

  return rollData
}



//-----------------------------------//
//               Helpers             //
//-----------------------------------//

// A skill paired with another attribute than its own: the skill's share of
// the sheet's pool (rating, skill group, or the -1 for defaulting, SR5 p. 55)
// plus that attribute. Wounds and the other modifiers stay in
// rollData.dicePool.modifiers, as for any skill test.
function skillWithAttribute(actorData, skillKey, attributeKey, attributeLabel){
  let skillPart = SR5_PrepareRollHelper.getDicepoolComposition(actorData.skills[skillKey].test.modifiers)
    .filter(m => m.type !== "linkedAttribute")
  return [{
    source: game.i18n.localize(attributeLabel), type: "linkedAttribute", value: actorData.attributes[attributeKey].augmented.value
  }].concat(skillPart)
}

async function getTargetedData(rollData, rollKey, actor){
  let targetActor = SR5_EntityHelpers.getRealActorFromID(rollData.target.actorId, rollData.actorUuids)

  switch (rollKey){
    case "banishing":
      if (targetActor.type !== "actorSpirit") {
        ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NotASpirit")}`)
        return
      }
      break
    case "binding":
      if (targetActor.type !== "actorSpirit") {
        ui.notifications.warn(`${game.i18n.localize("SR5.WARN_NotASpirit")}`)
        return
      }
      else if (targetActor.system.isBounded) {
        ui.notifications.warn(`${game.i18n.localize("SR5.WARN_SpiritAlreadyBounded")}`)
        return
      }
      else {
        rollData.limit.base = targetActor.system.force.value
        //SR5 p. 304: (Force x 25) drachms spent on the attempt. They do not change the limit
        rollData.magic.bindingReagents = bindingCost(targetActor.system.force.value)
        if (spendableStock(actor.system.magic) < rollData.magic.bindingReagents) ui.notifications.warn(game.i18n.format("SR5.WARN_BindingReagents", {
          reagents: rollData.magic.bindingReagents
        }))
      }
      break
    case "counterspelling": {
      let spellList = targetActor.items.filter(i => i.type === "itemSpell" && i.system.isActive)
      for (let e of Object.values(targetActor.items.filter(i => i.type === "itemEffect" && i.system.type === "itemSpell"))){
        let parentItem = await fromUuid(e.system.ownerItem)
        if (spellList.length === 0) spellList.push(parentItem)
        else {
          let itemAlreadyIn = spellList.find((i) => i.id === parentItem.id)
          if (!itemAlreadyIn) spellList.push(parentItem)
        }
      }
      if (spellList.length !== 0) {
        for (let s of spellList) rollData.target.itemList[s.uuid] = s.name
      }
      break
    }
    case "disenchanting": {
      let focusList = targetActor.items.filter(i => (i.type === "itemFocus" && i.system.isActive) || i.type === "itemPreparation")
      if (focusList.length !== 0) {
        for (let s of focusList) rollData.target.itemList[s.uuid] = s.name
      }
      break
    }
    case "locksmith":
      if (targetActor.type === "actorDevice"){
        if (targetActor.system.maglock.type.cardReader || targetActor.system.maglock.type.keyPads){
          if (targetActor.system.maglock.hasAntiTamper && targetActor.system.maglock.caseRemoved){
            rollData.threshold.value = targetActor.system.maglock.antiTamperRating
          } else {
            rollData.test.isExtended = true
            rollData.threshold.value = targetActor.system.matrix.deviceRating * 2
            rollData.test.extended.interval = "combatTurn"
            rollData.test.extended.intervalValue = 1
            rollData.test.extended.multiplier = 1
          }
        }
      }
      break
  }

  return rollData
}

function getOpposedData(rollData, chatData, rollKey, actor){
  let actorData = actor.system
  rollData.dialogSwitch.extended = false
  rollData.test.isOpposed = true
  rollData.test.isOpposedResistance = true
  rollData.threshold.value = chatData.roll.hits
  // SR5 p. 141-143: the target keeps the limit of the skill it rolls
  // (Con, Leadership, Negotiation [Social]; Perception [Mental] against
  // Impersonation). Etiquette, Intimidation and Performance are set below.

  // SR5 p. 143, table Tests de compétences sociales: Etiquette is resisted
  // with Perception + Charisma [Social]
  if (chatData.test.typeSub === "etiquette"){
    rollData.test.title = `${game.i18n.localize("SR5.OpposedTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize(SR5.skills[rollKey]) + " + " + game.i18n.localize("SR5.Charisma") + " (" + chatData.roll.hits + ")"}`
    rollData.limit.base = actorData.limits.socialLimit.value
    rollData.limit.type = "socialLimit"
    rollData.dicePool.composition = skillWithAttribute(actorData, rollKey, "charisma", "SR5.Charisma")
    rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
  }

  // SR5 p. 141 and 144: Leadership is resisted with Leadership + Willpower
  if (chatData.test.typeSub === "leadership"){
    rollData.test.title = `${game.i18n.localize("SR5.OpposedTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize(SR5.skills[rollKey]) + " + " + game.i18n.localize("SR5.Willpower") + " (" + chatData.roll.hits + ")"}`
    rollData.dicePool.composition = skillWithAttribute(actorData, rollKey, "willpower", "SR5.Willpower")
    rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
  }

  // SR5 p. 141, 143 and 144: Intimidation and Performance are resisted with
  // Charisma + Willpower, two attributes and no skill. (The example p. 142
  // gives a ganger Intimidation + Willpower; the rule and the table do not.)
  if (chatData.test.typeSub === "intimidation" || chatData.test.typeSub === "performance"){
    // No limit at all: the defender's own Intimidation or Performance limit
    // bonuses belong to whoever uses the skill, not to whoever resists it.
    rollData.limit.base = 0
    rollData.limit.modifiers = {
    }
    // Same for the dice: no skill is rolled, so no skill bonus applies. Only
    // the general penalties (wounds, sustaining, special) stay.
    rollData.dicePool.modifiers = rollData.dicePool.modifiers.filter(m => m.type?.startsWith("penalty"))
    rollData.test.title = `${game.i18n.localize("SR5.OpposedTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize("SR5.Charisma") + " + " + game.i18n.localize("SR5.Willpower") + " (" + chatData.roll.hits + ")"}`
    rollData.dicePool.base = actorData.attributes.charisma.augmented.value + actorData.attributes.willpower.augmented.value
    rollData.dicePool.composition = ([
      {
        source: game.i18n.localize("SR5.Willpower"), type: "linkedAttribute", value: actorData.attributes.willpower.augmented.value
      },
      {
        source: game.i18n.localize("SR5.Charisma"), type: "linkedAttribute", value: actorData.attributes.charisma.augmented.value
      },
    ])
  }

  if (chatData.test.typeSub === "impersonation") rollData.test.title = `${game.i18n.localize("SR5.OpposedTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize(SR5.skills[rollKey]) + " + " + game.i18n.localize(SR5.allAttributes[actorData.skills[rollKey].linkedAttribute])  + " (" + chatData.roll.hits + ")"}`
  // SR5 p. 143: Con is resisted with Con + Charisma [Social]
  if (chatData.test.typeSub === "negotiation" || chatData.test.typeSub === "con") rollData.test.title = `${game.i18n.localize("SR5.OpposedTest") + game.i18n.localize("SR5.Colons") + " " + game.i18n.localize(SR5.skills[rollKey]) + " + " + game.i18n.localize(SR5.allAttributes[actorData.skills[rollKey].linkedAttribute])  + " (" + chatData.roll.hits + ")"}`

  return rollData
}