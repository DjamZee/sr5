import {
  SR5 
} from "../../config.js"
import {
  SR5_RollMessage 
} from "../roll-message.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_MatrixHelpers
} from "../roll-helpers/matrix.js"
import {
  SHARED_VISION_ACTOR_TYPES
} from "../../system/shared-vision.js"
import {
  activeHeadcase
} from "../../system/monad-matrix.js"

export default async function matrixDefenseInfo(cardData, actorId){
  let actor = SR5_EntityHelpers.getRealActorFromID(actorId),
    actorData = actor.system,
    attacker = SR5_EntityHelpers.getRealActorFromID(cardData.previousMessage.actorId, cardData.actorUuids),
    attackerData = attacker?.system,
    netHits = cardData.previousMessage.hits - cardData.roll.hits,
    targetItem = cardData.target.itemUuid ? await fromUuid(cardData.target.itemUuid) : null,
    //An AI outside any device has no targeted item, it is the persona itself (Data Trails p. 157)
    targetName = targetItem?.name || actor.name

  //Overwatch button if illegal action
  if (cardData.matrix.overwatchScore && cardData.roll.hits > 0) cardData.chatCard.buttons.overwatch = await SR5_RollMessage.generateChatButton("nonOpposedTest", "overwatch", `${game.i18n.format('SR5.IncreaseOverwatch', {
    name: attacker.name, score: cardData.roll.hits
  })}`)

  //if defender wins
  if (netHits <= 0) {
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.SuccessfulDefense"))

    if (cardData.matrix.actionType === "attack" && netHits < 0) {
      cardData.damage.matrix.value = netHits * -1
      cardData.chatCard.buttons.defenderDoMatrixDamage = SR5_RollMessage.generateChatButton("nonOpposedTest", "defenderDoMatrixDamage", `${game.i18n.format('SR5.DoMatrixDamage', {
        key: cardData.damage.matrix.value, name: attacker.name
      })}`)
      //If Biofeedback, add damage and button
      if ((actorData.matrix.programs.biofeedback.isActive || actorData.matrix.programs.blackout.isActive) &&
          attackerData.matrix.userMode !== "ar" &&
          (attacker.type === "actorPc" || attacker.type === "actorGrunt")) {
        cardData.damage.base = netHits * -1
        cardData.damage.value = netHits * -1
        cardData.damage.resistanceType = "biofeedback"
        cardData.damage.type = "stun"
        if ((actorData.matrix.programs.biofeedback.isActive && attackerData.matrix.userMode === "hotsim")) cardData.damage.type = "physical"
        cardData.chatCard.buttons.defenderDoBiofeedbackDamage = SR5_RollMessage.generateChatButton("nonOpposedTest", "defenderDoBiofeedbackDamage", `${game.i18n.format('SR5.DoBiofeedBackDamage', {
          damage: cardData.damage.matrix.value, damageType: (game.i18n.localize(SR5.damageTypesShort[cardData.damage.type])), name: attacker.name
        })}`)
      }
    } else if (cardData.matrix.actionType === "sleaze") {
      cardData.chatCard.buttons.defenderPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "defenderPlaceMark", `${game.i18n.format('SR5.DefenderPlaceMarkTo', {
        key: cardData.matrix.mark, item: targetName, name: attacker.name
      })}`)
    }
  }

  //if attacker wins
  else {
    // A matrix attack is an attack: the damage it leads to can knock a persona's owner down (SR5 p. 195)
    cardData.damage.isAttack = true
    switch (cardData.test.typeSub) {
      // Kill Code p. 45: on a success the hacker puts one mark on the target. Watchdog has no mark
      // selector in its roll dialog, unlike Hack on the Fly, so nothing else sets the number.
      case "watchdog":
        cardData.matrix.mark = 1
        cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
          key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
        })}`)
        break
      case "hackOnTheFly":
        cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
          key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
        })}`)
        break
      case "bruteForce":
        cardData.damage.matrix.value = Math.ceil(netHits / 2)
        cardData.chatCard.buttons.attackerPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "attackerPlaceMark", `${game.i18n.format('SR5.AttackerPlaceMarkTo', {
          key: cardData.matrix.mark, item: targetName, name: cardData.owner.speakerActor
        })}`)
        if (actorData.matrix.deviceType !== "host") cardData.chatCard.buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize('SR5.TakeOnDamageMatrix')} (${cardData.damage.matrix.value})`)
        break
      case "dataSpike":
      case "iceBlueGoo":
        cardData.damage.matrix.base = attacker.system.matrix.attributes.attack.value
        cardData = await SR5_MatrixHelpers.updateMatrixDamage(cardData, netHits, actor)
        cardData.chatCard.buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize('SR5.TakeOnDamageMatrix')} (${cardData.damage.matrix.value})`)
        break
      case "popupCybercombat":
        cardData.damage.matrix.base = 0
        cardData = await SR5_MatrixHelpers.updateMatrixDamage(cardData, netHits, actor)
        cardData.chatCard.buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize('SR5.TakeOnDamageMatrix')} (${cardData.damage.matrix.value})`)
        cardData.chatCard.buttons.popup = SR5_RollMessage.generateChatButton("nonOpposedTest", "popup", game.i18n.localize("SR5.ApplyEffect"))
        break
      case "popupHacking":
        cardData.chatCard.buttons.popup = SR5_RollMessage.generateChatButton("nonOpposedTest", "popup", game.i18n.localize("SR5.ApplyEffect"))
        break
      case "denialOfService":
        cardData.chatCard.buttons.denialOfService = SR5_RollMessage.generateChatButton("nonOpposedTest", "denialOfService", game.i18n.localize("SR5.ApplyEffect"))
        break
      case "haywire":
        cardData.chatCard.buttons.haywire = SR5_RollMessage.generateChatButton("nonOpposedTest", "haywire", game.i18n.localize("SR5.ApplyEffect"))
        break
      //SR5 p. 241: the hacker views the traffic of the target, as long as he keeps a mark on it.
      //The button is the hacker's: the card belongs to the defender, its other buttons to whoever owns it
      case "snoop":
        if (SHARED_VISION_ACTOR_TYPES.includes(actor.type)) cardData.chatCard.buttons.snoopVision = SR5_RollMessage.generateChatButton("attackerTest", "snoopVision", game.i18n.format("SR5.SharedVisionSeeThrough", {
          name: actor.name
        }))
        else cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.DefenseFailure"))
        break
      //A formatted Monad repairs its boot sector with as many Complex Actions as the hacker's net hits; rebooting
      //before that destroys it as an overflow on its Core would (Dark Terrors p. 88). Said on the card, the GM plays it
      case "formatDevice":
        if (activeHeadcase(actor)) {
          cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.format("SR5.MONAD_Formatted", {
            actions: netHits
          }))
          break
        }
        cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.DefenseFailure"))
        break
      default:
        cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.DefenseFailure"))
    }
  }

  //Remove chat button from previous chat message
  if (cardData.previousMessage.messageId){
    let originalMessage = game.messages.get(cardData.previousMessage.messageId)
    if (originalMessage.flags?.sr5data?.chatCard.buttons?.matrixAction) {
      SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "matrixAction")
    }
  }
}