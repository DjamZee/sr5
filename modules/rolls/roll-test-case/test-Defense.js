import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_ActorHelper
} from "../../entities/actors/entityActor-helpers.js"
import {
  SR5_RollMessage 
} from "../roll-message.js"
import {
  SR5 
} from "../../config.js"
import {
  SR5_ConverterHelpers
} from "../roll-helpers/converter.js"
import {
  SR5_CombatHelpers
} from "../roll-helpers/combat.js"
import {
  SR5_RollTest 
} from "../roll-test.js"
import {
  SR5_PrepareRollTest 
} from "../roll-prepare.js"
import {
  subdueTakesHold, strengthenedHold, grappleHoldOf, isHeldBy, holdAfterReversal
} from "../roll-helpers/grapple-rules.js"
import {
  WEAPON_MATRIX_DAMAGE, weaponMatrixResistance
} from "../roll-helpers/weapon-matrix-damage.js"

export default async function defenseInfo(cardData, actorId){
  let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
  let actorData = actor.system
  let immunity
  cardData.roll.netHits = cardData.previousMessage.hits - cardData.roll.hits

  // SR5 p. 181: anyone caught in a suppressive fire zone suffers a penalty equal to the shooter's hits, whatever the outcome of the defense
  if (cardData.combat.firingMode.selected === "SF") await SR5_ActorHelper.suppressiveFireEffect(actorId, cardData.previousMessage.hits)

  // Kill Code p. 44: the Intervene bonus applies to the current defense test only
  let interveneEffects = actor.items.filter(i => i.type === "itemEffect" && i.system.type === "intervene").map(i => i.id)
  if (interveneEffects.length) await actor.deleteEmbeddedDocuments("Item", interveneEffects)

  //Special case for injection ammo, need 3 net hits if armor is weared
  const injReq = cardData.combat.ammo.effects?.injectionNetHits || (cardData.combat.ammo.type === "injection" ? 3 : 0)
  if (injReq && actor.system.itemsProperties.armor.value > 0){
    if (cardData.roll.netHits < injReq) {
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.SuccessfulDefense"))
      return ui.notifications.info(game.i18n.localize("SR5.INFO_NeedAtLeastThreeNetHits"))
    }
  }

  //Handle Energetic Aura: only a successful attack burns the attacker (SR5 p. 397)
  if (actorData.specialProperties?.energyAura && cardData.test.typeSub === "meleeWeapon" && cardData.roll.netHits > 0) await handleEnergeticAura(cardData, actorData, actorId)

  //SR5 p. 196 (renforcer sa prise): no damage, the hold moves by the net hits, either way
  if (cardData.combat.calledShot.name === "strengthenHold") {
    cardData.damage.value = 0
    cardData.chatCard.calledShotButton = true
    //Only the hold of this attacker on this defender can be strengthened
    if (!isHeldBy(actor.effects, cardData.previousMessage.actorId)) {
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.WARN_GrappleNoHold"))
      return
    }
    const current = grappleHoldOf(actor.effects)
    const hold = current.hold ?? 0
    const newHold = strengthenedHold(hold, cardData.roll.netHits)
    cardData.combat.calledShot.effects = [{
      name: "strengthenHold", value: newHold, holdId: current.holdId
    }]
    cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect", game.i18n.format("SR5.GrappleApplyStrengthen", {
      hold, newHold
    }))
    return
  }

  //If Defenser win, return
  if (cardData.roll.netHits <= 0) {
    if (cardData.combat.calledShot.name === "throughAndInto") {
      let originalAttackMessage = foundry.utils.duplicate(game.messages.get(cardData.previousMessage.messageId))
      originalAttackMessage.flags.sr5data.combat.calledShot.name = ''
      cardData.originalAttackMessage = originalAttackMessage.flags.sr5data
      cardData.chatCard.buttons.defenseRangedWeapon = SR5_RollMessage.generateChatButton("opposedTest","defenseThroughAndInto",game.i18n.localize("SR5.DefendSecondTarget"))
    }
    return cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.SuccessfulDefense"))
  }

  //Special case for ramming
  if (cardData.test.type === "rammingDefense") {
    let damages = SR5_ConverterHelpers.rammingDefenseDamages(cardData.combat.ramming || {
    }, {
      defenderIsVehicle: actor.type === "actorDrone", defenderBody: actor.system.attributes.body.augmented.value, damageBase: cardData.damage.base, netHits: cardData.roll.netHits
    })
    //No relative speed, no damage (a few scratches at most)
    if (damages.target <= 0) return cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.RammingNoImpact"))
    await handleRamming(cardData, damages.initiator, actor.type === "actorDrone", actorId)
  }

  //Handle astral combat damage
  if (cardData.test.typeSub === "astralCombat") cardData.damage.resistanceType = "astralDamage"
  else cardData.damage.resistanceType = "physicalDamage"
  cardData.damage.isAttack = true

  //Damage value calculation
  if (cardData.combat.firingMode.selected === "SF") cardData.damage.value = cardData.damage.base
  else if (cardData.magic.spell.areaThreshold) cardData.damage.value = SR5_CombatHelpers.indirectAreaSpellDamage(cardData.damage.base, cardData.roll.netHits, cardData.magic.spell.areaThreshold)
  else cardData.damage.value = cardData.damage.base + cardData.roll.netHits

  //A DSP weapon (Street Lethal p. 57): matrix damage, resisted with Device Rating + Firewall; no armor, no Body
  if (cardData.damage.type === WEAPON_MATRIX_DAMAGE) return weaponMatrixResistance(cardData, actor, SR5_RollMessage.generateChatButton)

  //If Hardened Armor, check if damage do something: SR5 p. 397 compares the modified DV, net hits already in it
  if ((actorData.specialProperties?.hardenedArmors.normalWeapon.value > 0) && (cardData.damage.source !== "magical")) {
    immunity = actorData.specialProperties.hardenedArmors.normalWeapon.value + cardData.combat.armorPenetration
    if (SR5_CombatHelpers.isStoppedByHardenedArmor(cardData.damage.value, actorData.specialProperties.hardenedArmors.normalWeapon.value, cardData.combat.armorPenetration)) {
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.NormalWeaponsImmunity"))
      return ui.notifications.info(`${game.i18n.format("SR5.INFO_ImmunityToNormalWeapons", {
        hardenedArmor: immunity, pa: cardData.combat.armorPenetration, damage: cardData.damage.value
      })}`)
    }
  }

  //Handle Called Shot specifics
  if (cardData.combat.calledShot.name) cardData = await handleCalledShotDefenseInfo(cardData, actorData)

  //Add fire threshold
  if (cardData.damage.element === "fire") {
    cardData.threshold.value = cardData.roll.netHits
    //If Hardened Armor, check if damage do something
    if (actorData.specialProperties?.hardenedArmors.fire.value > 0) {
      immunity = actorData.specialProperties.hardenedArmors.fire.value + cardData.combat.armorPenetration
      if (SR5_CombatHelpers.isStoppedByHardenedArmor(cardData.damage.value, actorData.specialProperties.hardenedArmors.fire.value, cardData.combat.armorPenetration)) {
        cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.FireImmunity"))
        return ui.notifications.info(`${game.i18n.format("SR5.INFO_ImmunityToNormalWeapons", {
          hardenedArmor: immunity, pa: cardData.combat.armorPenetration, damage: cardData.damage.value
        })}`)
      }
    }
  }

  //Special case for Drone and vehicle (both are actorDrone, told apart by system.type)
  if (actor.type === "actorDrone") {
    if (cardData.damage.type === "stun" && cardData.damage.element === "electricity") {
      cardData.damage.type = "physical"
      ui.notifications.info(`${game.i18n.localize("SR5.INFO_ElectricityChangeDamage")}`)
    }
    if (cardData.damage.type === "stun") {
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.VehicleArmorResistance"))
      return ui.notifications.info(`${game.i18n.localize("SR5.INFO_ImmunityToStunDamage")}`)
    }
    if (actorData.attributes.armor.augmented.value >= cardData.damage.value && cardData.test.type !== "rammingDefense") {
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.VehicleArmorResistance"))
      return ui.notifications.info(`${game.i18n.format("SR5.INFO_ArmorGreaterThanDV", {
        armor: actorData.attributes.armor.augmented.value, damage:cardData.damage.value
      })}`) //
    }
  }

  //Special case for called shots
  if (cardData.combat.calledShot.name === "breakWeapon") return cardData.chatCard.buttons.weaponResistance = SR5_RollMessage.generateChatButton("nonOpposedTest","weaponResistance",game.i18n.localize("SR5.WeaponResistance"))
  if (cardData.combat.calledShot.name === "feint") return

  //Generate Resistance chat button if not already done by called shot
  if (!cardData.chatCard.calledShotButton) {
    let label
    if (cardData.damage.element === "toxin"){
      label = `${game.i18n.localize("SR5.ResistToxin")}`
      cardData.chatCard.buttons.resistanceToxin = SR5_RollMessage.generateChatButton("nonOpposedTest","resistanceToxin",label)
      if (cardData.combat.ammo.effects?.showToxinButton || cardData.combat.ammo.type === "capsule"){
        label = `${game.i18n.localize("SR5.TakeOnDamageShort")} ${game.i18n.localize("SR5.DamageValueShort")}${game.i18n.localize("SR5.Colons")} ${cardData.damage.value}${game.i18n.localize(SR5.damageTypesShort[cardData.damage.type])}`
        if (cardData.combat.armorPenetration) label += ` / ${game.i18n.localize("SR5.ArmorPenetrationShort")}${game.i18n.localize("SR5.Colons")} ${cardData.combat.armorPenetration}`
        cardData.chatCard.buttons.resistanceCard = SR5_RollMessage.generateChatButton("nonOpposedTest","resistanceCard",label)
      }
    } else {
      label = `${game.i18n.localize("SR5.TakeOnDamageShort")} ${game.i18n.localize("SR5.DamageValueShort")}${game.i18n.localize("SR5.Colons")} ${cardData.damage.value}${game.i18n.localize(SR5.damageTypesShort[cardData.damage.type])}`
      if (cardData.combat.armorPenetration) label += ` / ${game.i18n.localize("SR5.ArmorPenetrationShort")}${game.i18n.localize("SR5.Colons")} ${cardData.combat.armorPenetration}`
      cardData.chatCard.buttons.resistanceCard = SR5_RollMessage.generateChatButton("nonOpposedTest","resistanceCard",label)
    }
  }
}


async function handleCalledShotDefenseInfo(cardData, actorData){
  cardData.chatCard.calledShotButton = true
  let attacker = SR5_EntityHelpers.getRealActorFromID(cardData.previousMessage.actorId, cardData.actorUuids)
  if (typeof cardData.combat.calledShot.effects === "object") cardData.combat.calledShot.effects = Object.values(cardData.combat.calledShot.effects)

  switch (cardData.combat.calledShot.name){
    case "dirtyTrick":
      if (cardData.combat.calledShot.limitDV === 0) cardData.damage.value = 0
      else cardData.chatCard.calledShotButton = false
      cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect",`${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.calledShotsEffects[cardData.combat.calledShot.name])}`)
      break
    case "disarm":
      if ((cardData.roll.netHits + attacker.system.attributes.strength.augmented.value) > actorData.limits.physicalLimit.value) cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.Disarm"))
      else {
        // Run & Gun p. 126: the weapon stays in hand, but its user takes a penalty equal to the net hits on their next action phase
        cardData.combat.calledShot.effects = {
          "0": {
            "name": "disarm", "value": -cardData.roll.netHits
          }
        }
        cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect",`${game.i18n.localize("SR5.NoDisarm")} : ${game.i18n.format("SR5.DisarmWeaponPenalty", {
          value: cardData.roll.netHits
        })}`)
      }
      break
    case "knockdown":
      if ((cardData.roll.netHits + attacker.system.attributes.strength.augmented.value) > actorData.limits.physicalLimit.value) {
        cardData.combat.calledShot.effects = {
          "0": {
            "name": "prone"
          }
        }
        cardData.damage.value = 0				
        cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect",`${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.calledShotsEffects[cardData.combat.calledShot.name])}`)
      } else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.SuccessfulDefense"))
      break
    case "blastOutOfHand": {
      if (cardData.combat.calledShot.limitDV === 0) cardData.damage.value = 0
      else cardData.chatCard.calledShotButton = false
      let mod = cardData.combat.calledShot.effects.find(e => e.name === "blastOutOfHand")
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",`${game.i18n.format('SR5.BlastOutOfHand', {
        range: cardData.roll.netHits + mod.modFingerPopper
      })}`)
      break
    }
    case "feint":
      cardData.chatCard.calledShotButton = false
      cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect",`${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.calledShotsEffects[cardData.combat.calledShot.name])}`)
      break
    case "subdue":
      //SR5 p. 195: no damage; Strength + net hits above the defender's Physical limit, and the defender is held
      cardData.damage.value = 0
      if (subdueTakesHold(cardData.roll.netHits, attacker.system.attributes.strength.augmented.value, actorData.limits.physicalLimit.value)) {
        cardData.combat.calledShot.effects = [{
          name: "subdue", value: cardData.roll.netHits
        }]
        cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect", game.i18n.format("SR5.GrappleApplyHold", {
          hold: cardData.roll.netHits
        }))
      } else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize("SR5.GrappleNoHold"))
      break
    case "reversal":
      //Grappling rules: the fighter held by the defender swaps the roles with them (Run & Gun p. 126)
      if (game.settings.get("sr5", "sr5GrapplingRules") && isHeldBy(attacker.effects, cardData.owner.speakerId)) {
        const hold = holdAfterReversal(cardData.roll.netHits)
        cardData.combat.calledShot.effects = [{
          name: "reversal", value: hold, holdId: grappleHoldOf(attacker.effects)?.holdId
        }]
        cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect", game.i18n.format("SR5.GrappleApplyReversal", {
          hold
        }))
      }
      else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize('SR5.ReversedSituation'))
      break
    case "onPinsAndNeedles":
      cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect",`${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.calledShotsEffects[cardData.combat.calledShot.name])}`)
      break
    case "tag":
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest","",game.i18n.localize('SR5.CS_AS_Tag'))
      break
    case "throughAndInto": {
      let originalAttackMessage = foundry.utils.duplicate(game.messages.get(cardData.previousMessage.messageId))
      originalAttackMessage.flags.sr5data.combat.calledShot.name = ''
      originalAttackMessage.flags.sr5data.damage.value -= 1
      originalAttackMessage.flags.sr5data.damage.base -= 1
      cardData.originalAttackMessage = originalAttackMessage.flags.sr5data
      cardData.chatCard.buttons.defenseRangedWeapon = SR5_RollMessage.generateChatButton("opposedTest","defenseThroughAndInto",game.i18n.localize("SR5.DefendSecondTarget"))
      cardData.chatCard.calledShotButton = false
      break
    }
    case "entanglement":
      cardData.combat.calledShot.effects = {
        "0": {
          "name": "entanglement",
          "netHits": cardData.roll.netHits,
        }
      }
      cardData.chatCard.buttons.calledShotEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "calledShotEffect", `${game.i18n.localize("SR5.ApplyEffect")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.calledShotsEffects[cardData.combat.calledShot.name])}`)
      break
    default:
      cardData.chatCard.calledShotButton = false
  }

  //Handle Called Shots specifics
  if (!cardData.combat.calledShot.hitsSpent && cardData.combat.calledShot.limitDV !== 0 && (cardData.combat.calledShot.name === "specificTarget" || cardData.combat.calledShot.name === "upTheAnte") && cardData.target.actorType !== "actorDrone") {
    if (cardData.roll.netHits > 1) {
      cardData.chatCard.buttons.spendNetHits = SR5_RollMessage.generateChatButton("attackerTest", "spendNetHits", `${game.i18n.localize("SR5.SpendHits")} (${cardData.roll.netHits - 1})`)
      cardData.chatCard.calledShotButton = true
    } else {
      cardData.chatCard.calledShotButton = false
    }
  }

  // Handle Fatigued
  if (cardData.combat.calledShot.effects.length){
    if (cardData.combat.calledShot.effects.find(e => e.name === "fatigued")){
      cardData.damage.valueFatiguedBase = Math.floor(cardData.damage.value/2)
      cardData.chatCard.buttons.fatiguedCard = SR5_RollMessage.generateChatButton("nonOpposedTest","fatiguedCard", `${game.i18n.localize("SR5.TakeOnDamageShort")} (${game.i18n.localize("SR5.STATUSES_Fatigued")}) ${game.i18n.localize("SR5.DamageValueShort")}${game.i18n.localize("SR5.Colons")} ${cardData.damage.valueFatiguedBase}${game.i18n.localize("SR5.DamageTypeStunShort")}`)
      cardData.chatCard.calledShotButton = false
    }
  }

  if (cardData.combat.hitsSpent) cardData.chatCard.calledShotButton = false
  return cardData
}

async function handleRamming(cardData, initiatorDamage, defenderIsVehicle, defenderId) {
  //Get the attacker actor
  let attacker = SR5_EntityHelpers.getRealActorFromID(cardData.previousMessage.actorId, cardData.actorUuids)

  //build roll data
  let rollData = SR5_PrepareRollTest.getBaseRollData(null, attacker)
  rollData.test.type = "falseTest"
  rollData.test.typeSub = "accident"
  rollData.test.title = game.i18n.localize("SR5.CrashDamageResistance")
  //The attack and the defender this card stems from: the GM rebuilds it from them (attack-card.js, rebuildCrossCard)
  rollData.previousMessage = {
    ...rollData.previousMessage, messageId: cardData.previousMessage?.messageId, actorId: defenderId
  }
  //Rigger 5 p. 179 between two vehicles; SR5 p. 204 when the target is not a vehicle (its Body instead of the initiator's Structure)
  rollData.damage.base = initiatorDamage
  rollData.damage.value = rollData.damage.base
  rollData.damage.type = "physical"
  rollData.damage.resistanceType = "physicalDamage"
  rollData.target.actorId = null
  rollData.chatCard.buttons.resistanceCard = SR5_RollMessage.generateChatButton("nonOpposedTest", "resistanceCard", `${game.i18n.localize("SR5.ResistAccident")} (${rollData.damage.value})`)
  rollData.chatCard.buttons.vehicleTest = SR5_RollMessage.generateChatButton("nonOpposedTest", "vehicleTest", `${game.i18n.localize("SR5.VehicleTest")} (2)`)
    
  // roll a fake test and render chat message
  rollData.roll = await SR5_RollTest.rollDice({
    dicePool: 0 
  })
  SR5_RollTest.renderRollCard(rollData)

  //Add vehicle test to defender chat Message: a pedestrian has nothing to pilot
  if (defenderIsVehicle) cardData.chatCard.buttons.vehicleTest = SR5_RollMessage.generateChatButton("nonOpposedTest", "vehicleTest", `${game.i18n.localize("SR5.VehicleTest")} (3)`)
}

async function handleEnergeticAura(cardData, actorData, defenderId){
  //Get the attacker actor
  let attacker = SR5_EntityHelpers.getRealActorFromID(cardData.previousMessage.actorId, cardData.actorUuids)
    
  //build roll data
  let rollData = SR5_PrepareRollTest.getBaseRollData(null, attacker)
  rollData.test.type = "falseTest"
  rollData.test.typeSub = "energeticAura"
  rollData.test.title = game.i18n.localize("SR5.SpiritPowerEnergyAura")
  //The attack and the defender this card stems from: the GM rebuilds it from them (attack-card.js, rebuildCrossCard)
  rollData.previousMessage = {
    ...rollData.previousMessage, messageId: cardData.previousMessage?.messageId, actorId: defenderId
  }
  rollData.damage.base = actorData.specialAttributes.magic.augmented.value * 2
  rollData.damage.value = rollData.damage.base
  rollData.damage.type = "physical"
  rollData.damage.resistanceType = "physicalDamage"
  rollData.damage.source = "magical"
  rollData.combat.armorPenetration = -actorData.specialAttributes.magic.augmented.value
  rollData.chatCard.buttons.resistanceCard = SR5_RollMessage.generateChatButton("nonOpposedTest","resistanceCard", `${game.i18n.localize("SR5.TakeOnDamageShort")} ${game.i18n.localize("SR5.DamageValueShort")}${game.i18n.localize("SR5.Colons")} ${rollData.damage.value}${game.i18n.localize(SR5.damageTypesShort[rollData.damage.type])}  / ${game.i18n.localize("SR5.ArmorPenetrationShort")}${game.i18n.localize("SR5.Colons")} ${rollData.combat.armorPenetration}`)

  // roll a fake test and render chat message
  rollData.roll = await SR5_RollTest.rollDice({
    dicePool: 0 
  })
  SR5_RollTest.renderRollCard(rollData)
}