import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_RollMessage 
} from "../roll-message.js"
import {
  SR5_MatrixHelpers 
} from "../roll-helpers/matrix.js"
import {
  SR5_MarkHelpers 
} from "../roll-helpers/mark.js"
import {
  SR5_SystemHelpers 
} from "../../system/utilitySystem.js"
import {
  SR5Combat 
} from "../../system/srcombat.js"
import {
  SR5 
} from "../../config.js"
import {
  DESIGNED_ICE, designActionOf, designedHit, iceDesignOf
} from "../../system/ice-design.js"

//The label of the button that calls the effect of a book's IC, as its own hit writes it below
const DESIGN_EFFECT_LABELS = {
  iceAcid: "SR5.EffectReduceFirewall",
  iceCatapult: "SR5.EffectReduceFirewall",
  iceBinder: "SR5.EffectReduceDataProcessing",
  iceJammer: "SR5.EffectReduceAttack",
  iceMarker: "SR5.EffectReduceSleaze",
  iceCrash: "SR5.MatrixActionCrashProgram",
  iceScramble: "SR5.DeviceReboot",
  iceTrack: "SR5.Geolocated",
}

//The hit of a designed IC: what each block's IC puts on the card, in its own words (the switch of iceDefenseInfo)
async function designedIceHit(cardData, design, {
  actor, actorData, netHits, devicelessAI, existingMark, targetName
}) {
  const attributes = Object.fromEntries(Object.entries(actorData.matrix.attributes ?? {
  }).map(([key, attribute]) => [key, attribute?.value]))
  const hit = designedHit({
    blocks: design.blocks, existingMark, isLinkLocked: !!actorData.matrix.isLinkLocked, devicelessAI, attributes
  })
  const buttons = cardData.chatCard.buttons
  if (hit.matrixDamage) {
    await SR5_MatrixHelpers.updateMatrixDamage(cardData, netHits, actor)
    buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize('SR5.TakeOnDamageMatrix')} (${(cardData.damage.matrix.value)})`)
  } else if (hit.takeMatrixDamage) {
    buttons.takeMatrixDamage = SR5_RollMessage.generateChatButton("nonOpposedTest", "takeMatrixDamage", `${game.i18n.localize("SR5.ApplyDamage")} (${cardData.damage.matrix.value})`)
  }
  if (hit.catapult) {
    cardData.damage.value = netHits + existingMark
    cardData.damage.type = "stun"
    cardData.damage.resistanceType = "physicalDamage"
    buttons.resistanceCard = SR5_RollMessage.generateChatButton("nonOpposedTest", "resistanceCard", `${game.i18n.localize("SR5.TakeOnDamageShort")} ${game.i18n.localize("SR5.DamageValueShort")}${game.i18n.localize("SR5.Colons")} ${cardData.damage.value}${game.i18n.localize(SR5.damageTypesShort[cardData.damage.type])}`)
  }
  //The existing action of the Lockdown program (roll-message.js, linkLock): the IC locks the link
  if (hit.linkLock) buttons.linkLock = SR5_RollMessage.generateChatButton("nonOpposedTest", "linkLock", game.i18n.localize("SR5.LinkLockConnection"))
  for (const source of hit.effects) {
    let label = DESIGN_EFFECT_LABELS[source]
    //Flicker (Kill Code p. 74): the link locked, then a disconnection at two marks
    if (source === "iceFlicker") label = existingMark >= 1 ? "SR5.DeviceReboot" : "SR5.LinkLockConnection"
    buttons[designActionOf(source)] = SR5_RollMessage.generateChatButton("nonOpposedTest", designActionOf(source), game.i18n.localize(label))
  }
  if (hit.marks > 0) {
    cardData.matrix.mark = hit.marks
    buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
      key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
    })}`)
  }
  if (hit.shocker) SR5Combat.changeInitInCombatHelper(SR5Combat.fighterIdOf(actor), -5)
}

export default async function iceDefenseInfo(cardData, actorId){
  let actor = SR5_EntityHelpers.getRealActorFromID(actorId),
    actorData = actor.system,
    netHits = cardData.previousMessage.hits - cardData.roll.hits,
    originalActor = await SR5_EntityHelpers.getRealActorFromID(cardData.previousMessage.actorId, cardData.actorUuids),
    targetItem = cardData.target.itemUuid ? await fromUuid(cardData.target.itemUuid) : null,
    //An AI outside any device is marked on its persona, cannot be link-locked
    //and has no device to reboot (Data Trails p. 157)
    devicelessAI = !targetItem && actorData.activeSpecialAttribute === "depth",
    //The IC counts the marks of its host and of the host's other ICs as its own (SR5 p. 249, D2 of 16/10)
    existingMark = SR5_MarkHelpers.iceMarkValue(targetItem?.system ?? actorData.matrix, originalActor),
    targetName = targetItem?.name ?? actor.name

  cardData.attackerName = originalActor.name

  if (netHits <= 0) {
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.SuccessfulDefense"))
    if (netHits < 0) {
      cardData.damage.matrix.value = netHits * -1
      cardData.chatCard.buttons.defenderDoMatrixDamage = SR5_RollMessage.generateChatButton("nonOpposedTest", "defenderDoMatrixDamage", `${game.i18n.format('SR5.DoMatrixDamage', {
        key: cardData.damage.matrix.value, name: cardData.attackerName
      })}`)
      //Kill Code p. 74: hurt by the avatar, Blue Goo explodes. The IC's to roll: a button for the GM alone
      if (cardData.test.typeSub === "iceBlueGoo" && !cardData.various?.blueGooExplosion) {
        cardData.chatCard.buttons.blueGooExplosion = SR5_RollMessage.generateChatButton("nonOpposedTest", "blueGooExplosion", game.i18n.localize("SR5.IceBlueGooExplosion"), true)
      }
    }
  } else {
    cardData.damage.matrix.value = netHits
    // An IC attack is a matrix attack (SR5 p. 195)
    cardData.damage.isAttack = true
    //A designed IC: its blocks, each with the buttons of the book's IC it comes from (system/ice-design.js)
    const design = cardData.test.typeSub === DESIGNED_ICE ? iceDesignOf(originalActor.system.matrix) : null
    if (design) return designedIceHit(cardData, design, {
      actor, actorData, netHits, devicelessAI, existingMark, targetName
    })
    switch(cardData.test.typeSub){
      case "iceAcid":
        if (actorData.matrix.attributes.firewall.value > 0) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.EffectReduceFirewall"))
        else cardData.chatCard.buttons.takeMatrixDamage = SR5_RollMessage.generateChatButton("nonOpposedTest", "takeMatrixDamage", `${game.i18n.localize("SR5.ApplyDamage")} (${cardData.damage.matrix.value})`)
        break
      case "iceCatapult":
        cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.EffectReduceFirewall"))
        cardData.damage.value = netHits + existingMark                
        cardData.damage.type = "stun"
        cardData.damage.resistanceType = "physicalDamage"
        // The Catapult IC attack: its resistance starts on this defense card (SR5 p. 195)
        cardData.damage.isAttack = true
        cardData.chatCard.buttons.resistanceCard = SR5_RollMessage.generateChatButton("nonOpposedTest", "resistanceCard", `${game.i18n.localize("SR5.TakeOnDamageShort")} ${game.i18n.localize("SR5.DamageValueShort")}${game.i18n.localize("SR5.Colons")} ${cardData.damage.value}${game.i18n.localize(SR5.damageTypesShort[cardData.damage.type])}`)
        break
      case "iceBinder":
        if (actorData.matrix.attributes.dataProcessing.value > 0) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.EffectReduceDataProcessing"))
        else cardData.chatCard.buttons.takeMatrixDamage = SR5_RollMessage.generateChatButton("nonOpposedTest", "takeMatrixDamage", `${game.i18n.localize("SR5.ApplyDamage")} (${cardData.damage.matrix.value})`)
        break
      case "iceJammer":
        if (actorData.matrix.attributes.attack.value > 0) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.EffectReduceAttack"))
        else cardData.chatCard.buttons.takeMatrixDamage = SR5_RollMessage.generateChatButton("nonOpposedTest", "takeMatrixDamage", `${game.i18n.localize("SR5.ApplyDamage")} (${cardData.damage.matrix.value})`)
        break
      case "iceMarker":
        if (actorData.matrix.attributes.dataProcessing.value > 0) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.EffectReduceSleaze"))
        else cardData.chatCard.buttons.takeMatrixDamage = SR5_RollMessage.generateChatButton("nonOpposedTest", "takeMatrixDamage", `${game.i18n.localize("SR5.ApplyDamage")} (${cardData.damage.matrix.value})`)
        break
      case "iceKiller":
      case "iceBlaster":
      case "iceBlack":
      case "iceSparky":
      case "iceBlueGoo":          
        if (cardData.test.typeSub === "iceBlueGoo") cardData.damage.matrix.base = originalActor.system.matrix.attributes.attack.value  
        //Kill Code p. 74: the explosion deals "une VD de (Attaque)", where the IC of SR5 p. 250 add their net hits and
        //marks in so many words. Blue Goo's ordinary attack is left as it was: the book gives it no effect of its own
        if (cardData.various?.blueGooExplosion) {
          cardData.damage.matrix.value = cardData.damage.matrix.base
          cardData.damage.matrix.modifiers = {
          }
        } else cardData = await SR5_MatrixHelpers.updateMatrixDamage(cardData, netHits, actor)
        if (!devicelessAI && ((cardData.test.typeSub === "iceBlaster" || cardData.test.typeSub === "iceBlack") && (!actorData.matrix.isLinkLocked) || cardData.test.typeSub === "iceBlueGoo")) {
          cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.LinkLockConnection"))
        }  
        cardData.chatCard.buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize('SR5.TakeOnDamageMatrix')} (${(cardData.damage.matrix.value)})`)
        //Kill Code p. 74: the server also marks the avatar Blue Goo's explosion hits
        if (cardData.test.typeSub === "iceBlueGoo") {
          cardData.matrix.mark = 1
          cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
            key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
          })}`)
        }
        break
      case "iceFlicker":
        cardData.matrix.mark = 1
        if (!devicelessAI && !actorData.matrix.isLinkLocked) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.LinkLockConnection"))
        cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
          key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
        })}`)
        if (!devicelessAI && existingMark >= 1) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.DeviceReboot"))
        break
      case "iceCrash":
        if (existingMark >= 1) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.MatrixActionCrashProgram"))
        break
      case "icePatrol":
        break
      case "iceBloodhound":
        cardData.matrix.mark = 2
        cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
          key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
        })}`)
        break
      case "iceProbe":
        cardData.matrix.mark = 1
        cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
          key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
        })}`)
        break
      case "iceScramble":
        if (!devicelessAI && existingMark >= 3) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.DeviceReboot"))
        break
      case "iceSleuther":
        cardData.matrix.mark = 1
        cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
          key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
        })}`)
        break
      case "iceTarBaby":
        if (actorData.matrix.isLinkLocked) {
          cardData.matrix.mark = 1
          cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
            key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
          })}`)
        } else if (!devicelessAI) {
          cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.LinkLockConnection"))
        }
        break
      case "iceTrack":
        if (existingMark >= 2) cardData.chatCard.buttons.iceEffect = SR5_RollMessage.generateChatButton("nonOpposedTest", "iceEffect", game.i18n.localize("SR5.Geolocated"))
        break
      case "iceShocker":           
        SR5Combat.changeInitInCombatHelper(SR5Combat.fighterIdOf(actor), -5)
        break               
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${cardData.test.typeSub}' type in iceDefenseInfo`)
    }
  }
}