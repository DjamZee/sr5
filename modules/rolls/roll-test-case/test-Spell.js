import {
  drainShown
} from "../roll-helpers/mentorMaskDrain.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_RollMessage
} from "../roll-message.js"

export default async function spellInfo(cardData){
  let actionType, label, item
  let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId)
  let actorData = actor.system
  if (cardData.owner.itemUuid) item = await fromUuid(cardData.owner.itemUuid)

  //Add Resist Drain chat button
  if (cardData.test.type === "spell" || (cardData.test.type === "adeptPower" && cardData.magic.drain > 0)) {
    cardData.chatCard.buttons.drain = SR5_RollMessage.generateChatButton("nonOpposedTest", "drain", `${game.i18n.localize("SR5.ResistDrain")} (${drainShown(cardData, cardData.owner.actorId)})`)
  }

  //Mage Hunter (Forbidden Arcana p. 34): the counterspelling against this spell loses 2 dice per level, for the GM
  if (cardData.magic.mageHunter?.used) cardData.chatCard.buttons.mageHunter = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "",
    game.i18n.format("SR5.MageHunterCounterspell", {
      value: 2 * (cardData.magic.mageHunter.level || 0)
    }))

  //Roll Succeed
  if (cardData.roll.hits > 0) {
    //Handle Attack spell type
    if (cardData.magic.spell.category === "combat") {
      if (cardData.test.typeSub === "indirect") {
        actionType = "defenseRangedWeapon"
        label = game.i18n.localize("SR5.Defend")
        // Defense computes DV from damage.base + net hits (like ranged weapons): DV = Force + net hits, AP = -Force
        // Death Sower (Forbidden Arcana p. 40): DV +1 per level
        cardData.damage.base = cardData.magic.force + (cardData.magic.spell.damageBonus || 0)
        cardData.damage.value = cardData.damage.base
        cardData.combat.armorPenetration = -cardData.magic.force
        cardData.damage.resistanceType = "physicalDamage"
        // SR5 p. 285: an area is cast with a threshold of 3, like a grenade (p. 182)
        if (cardData.magic.spell.range === "area" && cardData.roll.hits >= 3) cardData.magic.spell.areaThreshold = 3
        else if (cardData.magic.spell.range === "area") {
          // Threshold missed: the spell still explodes, at DV = Force, scattered as a grenade (2D6 m minus 1 m per
          // hit, direction rolled, SR5 p. 182-183) by the card's Scatter button, which moves its template. As for a
          // grenade that scatters, the targets get no defense test (ruled by DjamZ, the book does not say).
          cardData.magic.spell.missedThreshold = true
          cardData.chatCard.buttons.scatter = SR5_RollMessage.generateChatButton("nonOpposedTest", "scatter", game.i18n.localize("SR5.Scatter"))
          actionType = "resistanceCard"
          label = game.i18n.localize("SR5.TakeOnDamageShort")
        }
      } else if (cardData.test.typeSub === "direct") {
        actionType = "resistanceCard"
        label = game.i18n.localize("SR5.ResistDirectSpell")
        // Death Sower (Forbidden Arcana p. 40): DV +1 per level
        cardData.damage.value = cardData.roll.hits + (cardData.magic.spell.damageBonus || 0)
        if (cardData.magic.spell.type === "mana") cardData.damage.resistanceType = "directSpellMana"
        else cardData.damage.resistanceType = "directSpellPhysical"
        cardData.damage.isAttack = true
      }
      //Generate Resist spell chat button
      cardData.chatCard.buttons[actionType] = SR5_RollMessage.generateChatButton("opposedTest", actionType, label)
    } else if (cardData.magic.spell.isResisted) {
      actionType = "spellResistance"
      label = game.i18n.localize("SR5.ResistSpell")
      cardData.chatCard.buttons[actionType] = SR5_RollMessage.generateChatButton("opposedTest", actionType, label)
    } 
			
    //Handle object resistance 
    if (cardData.magic.spell.objectCanResist){
      actionType = "objectResistance"
      label = game.i18n.localize("SR5.ObjectResistanceTest")
      cardData.chatCard.buttons[actionType] = SR5_RollMessage.generateChatButton("nonOpposedTest", actionType, label, {
        gmAction: true
      })
    }
			
    //Handle spell Area
    // A preparation's area is read from the item, where its Potency and Force take the place of the caster's (SR5 p. 309)
    if (cardData.magic.spell.range === "area" && cardData.test.type === "preparation") cardData.magic.spell.area += item.system.spellAreaOfEffect.value
    else if (cardData.magic.spell.range === "area"){
      cardData.magic.spell.area += cardData.magic.force
      if (item.system.category === "detection") {
        if (item.system.spellAreaExtended === true) cardData.magic.spell.area = cardData.magic.spell.area * actorData.specialAttributes.magic.augmented.value * 10
        else cardData.magic.spell.area = cardData.magic.spell.area * actorData.specialAttributes.magic.augmented.value
      }
    }

    //Generate apply effect on Actor chat button
    if (cardData.effects.canApplyEffect) cardData.chatCard.buttons.applyEffect = SR5_RollMessage.generateChatButton("opposedTest", "applyEffect", game.i18n.localize("SR5.ApplyEffect"))
    //Generate apply effect on Item chat button
    if (cardData.effects.canApplyEffectOnItem) cardData.chatCard.buttons.applyEffectOnItem = SR5_RollMessage.generateChatButton("opposedTest", "applyEffectOnItem", game.i18n.localize("SR5.ApplyEffect"))
  } 

  //Roll failed
  else {
    if (cardData.test.type === "spell") label = game.i18n.localize("SR5.SpellCastingFailed")
    else if (cardData.test.type === "adeptPower" || cardData.test.type === "power") label = game.i18n.localize("SR5.PowerFailure")
    else label = game.i18n.localize("SR5.PreparationCreateFailed")
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", label)
  }
}