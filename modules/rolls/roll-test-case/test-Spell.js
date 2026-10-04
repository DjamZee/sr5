import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_RollMessage
} from "../roll-message.js"
import {
  SR5_CombatHelpers
} from "../roll-helpers/combat.js"

export default async function spellInfo(cardData){
  let actionType, label, item
  let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId)
  let actorData = actor.system
  if (cardData.owner.itemUuid) item = await fromUuid(cardData.owner.itemUuid)

  //Add Resist Drain chat button
  if (cardData.test.type === "spell" || (cardData.test.type === "adeptPower" && cardData.magic.drain > 0)) {
    cardData.chatCard.buttons.drain = SR5_RollMessage.generateChatButton("nonOpposedTest", "drain", `${game.i18n.localize("SR5.ResistDrain")} (${cardData.magic.drain.value})`)
  }

  //Roll Succeed
  if (cardData.roll.hits > 0) {
    //Handle Attack spell type
    if (cardData.magic.spell.category === "combat") {
      if (cardData.test.typeSub === "indirect") {
        actionType = "defenseRangedWeapon"
        label = game.i18n.localize("SR5.Defend")
        // Defense computes DV from damage.base + net hits (like ranged weapons): DV = Force + net hits, AP = -Force
        cardData.damage.base = cardData.magic.force
        cardData.damage.value = cardData.magic.force
        cardData.combat.armorPenetration = -cardData.magic.force
        cardData.damage.resistanceType = "physicalDamage"
        // SR5 p. 285: an area is cast with a threshold of 3, like a grenade (p. 182)
        if (cardData.magic.spell.range === "area" && cardData.roll.hits >= 3) cardData.magic.spell.areaThreshold = 3
        else if (cardData.magic.spell.range === "area") {
          // Threshold missed: the spell still explodes, 2D6 m away minus 1 m per hit, at DV = Force. As for a
          // grenade that scatters, the targets get no defense test (ruled by DjamZ, the book does not say).
          const scatterRoll = new Roll("2d6")
          await scatterRoll.evaluate()
          cardData.magic.spell.scatter = SR5_CombatHelpers.indirectAreaSpellScatter(scatterRoll.total, cardData.roll.hits)
          cardData.chatCard.buttons.spellScatter = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.format("SR5.INFO_ScatterDistance", {
            distance: cardData.magic.spell.scatter
          }))
          actionType = "resistanceCard"
          label = game.i18n.localize("SR5.TakeOnDamageShort")
        }
      } else if (cardData.test.typeSub === "direct") {
        actionType = "resistanceCard"
        label = game.i18n.localize("SR5.ResistDirectSpell")
        cardData.damage.value = cardData.roll.hits
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
    if (cardData.magic.spell.range === "area"){
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