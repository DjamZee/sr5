import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_RollMessage 
} from "../roll-message.js"

// SR5 p. 198: a modified DV lower than or equal to the barrier Armor, modified by the AP, cannot pierce it
export function weaponBreakFails({
  damage, armor, armorPenetration = 0
}){
  return damage <= Math.max(0, armor + armorPenetration)
}

export default async function resistanceResultInfo(cardData, type){
  let key, label, labelEnd, applyEffect = true, actor, weapon, originalMessage, prevData
  cardData.roll.netHits = cardData.previousMessage.hits- cardData.roll.hits
    
  if (cardData.previousMessage.messageId){
    originalMessage = game.messages.get(cardData.previousMessage.messageId)
    prevData = originalMessage.flags?.sr5data
  }

  switch (type){
    case "complexFormResistance":
      label = `${game.i18n.localize("SR5.ReduceComplexFormSuccess")} (${cardData.roll.netHits})`
      labelEnd = game.i18n.localize("SR5.KillComplexFormFailed")
      key = "reduceComplexForm"
      break
    case "dispellResistance":
      label = `${game.i18n.localize("SR5.ReduceSpell")} (${cardData.roll.netHits})`
      labelEnd = game.i18n.localize("SR5.DispellingFailed")
      key = "reduceSpell"
      break
    case "enchantmentResistance":
      cardData.magic.drain.value = cardData.roll.hits
      label = game.i18n.localize("SR5.DesactivateFocus")
      labelEnd = game.i18n.localize("SR5.DisenchantFailed")
      key = "desactivateFocus"
      break
    case "disjointingResistance":
      if(cardData.test.typeSub !== "preparation") cardData.magic.drain.value = cardData.roll.hits
      label = `${game.i18n.localize("SR5.ReducePreparationPotency")} (${cardData.roll.netHits})`
      labelEnd = game.i18n.localize("SR5.DisjointingFailed")
      key = "reducePreparationPotency"
      break
    case "spellResistance":
      label = game.i18n.localize("SR5.ApplyEffect")
      labelEnd = game.i18n.localize("SR5.SpellResisted")
      key = "applyEffectAuto"
      if (!cardData.effects.canApplyEffect && !cardData.effects.canApplyEffectOnItem) applyEffect = false
      else cardData.owner.itemUuid = cardData.previousMessage.itemUuid
      if (prevData?.magic.spell.area < 1) SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "spellResistance")
      break
    case "powerDefense":
    case "martialArtDefense":
      if (cardData.effects.canApplyEffect){
        label = game.i18n.localize("SR5.ApplyEffect")
        key = "applyEffectAuto"
      } else {
        label = `${game.i18n.localize("SR5.DefenseFailure")}`
        applyEffect = false
      }
      labelEnd = game.i18n.localize("SR5.SuccessfulDefense")
      break
    case "etiquetteResistance":
      break
    case "weaponResistance":
      labelEnd = game.i18n.localize("SR5.ObjectResistanceSuccess")
      cardData.roll.netHits = cardData.damage.value - cardData.roll.hits
      if (weaponBreakFails({
        damage: cardData.damage.value, armor: cardData.combat.barrierArmor ?? 0, armorPenetration: cardData.combat.armorPenetration ?? 0
      })) {
        ui.notifications.info(`${game.i18n.format("SR5.INFO_BarrierArmorGreaterThanDV", {
          armor: Math.max(0, (cardData.combat.barrierArmor ?? 0) + (cardData.combat.armorPenetration ?? 0)), damage: cardData.damage.value
        })}`)
        // The weapon is not damaged: end the test instead of offering the decrease buttons
        cardData.roll.netHits = 0
      } else {
        weapon = cardData.target.itemUuid ? await fromUuid(cardData.target.itemUuid) : null
        if (!weapon || weapon.system.accuracy.value <= 3 && weapon.system.reach.value === 0){
          applyEffect = false
          label = `${game.i18n.localize("SR5.NoEffectApplicable")}`
          key = "noEffectApplicable"
        }
      }
      break
    default :
  }

  if (cardData.roll.netHits <= 0) {
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","", labelEnd)
    //if type is a spell with area effect, create an effect at 0 value on defender to avoir new resistance test inside the canvas template
    if (type === "spellResistance" && prevData?.magic.spell.area > 0){
      //add effect "applyEffectAuto"
      if (cardData.roll.netHits < 0) cardData.roll.netHits = 0
      actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId)
      actor.applyExternalEffect(cardData, "customEffects")
    }
  } else {
    if (applyEffect) {
      if (type === "weaponResistance"){
        if (weapon.system.accuracy.value > 3) cardData.chatCard.buttons.decreaseAccuracy = SR5_RollMessage.generateChatButton("nonOpposedTest", "decreaseAccuracy", game.i18n.localize("SR5.AccuracyDecrease"))
        if (weapon.system.reach.value > 0) cardData.chatCard.buttons.decreaseReach = SR5_RollMessage.generateChatButton("nonOpposedTest", "decreaseReach", game.i18n.localize("SR5.WeaponReachDecrease"))
      } else cardData.chatCard.buttons[key] = SR5_RollMessage.generateChatButton("nonOpposedTest", key, label)
    }
    else cardData.chatCard.buttons[key] = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", label)
  }

  if (cardData.magic.drain.value > 0) cardData.chatCard.buttons.drain = SR5_RollMessage.generateChatButton("nonOpposedTest", "drain", `${game.i18n.localize("SR5.ResistDrain")} (${cardData.magic.drain.value})`)
}