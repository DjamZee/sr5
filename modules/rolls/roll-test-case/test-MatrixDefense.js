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
import {
  PERCEPTION_BUTTON, requestForgetIntel
} from "../../canvas/pan-crown/pan-perception-card.js"
import {
  confusePilotThreshold
} from "../roll-helpers/electronic-warfare.js"
import {
  fileDefenseButton
} from "../roll-helpers/file-actions.js"
import {
  isFile
} from "../../system/matrix-files.js"
import {
  announceMatrixAction
} from "../../system/matrix-api.js"

//The actions whose success gives the attacker its marks (SR5 p. 240, 242; Kill Code p. 45)
const MARKING_ACTIONS = ["hackOnTheFly", "bruteForce", "watchdog"]

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
    //An unlinked token carries its own name, and the score is written to it
    name: attacker.token?.name || attacker.name, score: cardData.roll.hits
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
      //SR5 p. 232: a failed Sleaze action gives the defender one mark, whatever the attacker chose (roll-message.js)
      cardData.chatCard.buttons.defenderPlaceMark = SR5_RollMessage.generateChatButton("nonOpposedTest", "defenderPlaceMark", `${game.i18n.format('SR5.DefenderPlaceMarkTo', {
        key: 1, item: targetName, name: attacker.name
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
        //Neither a host nor a file can be damaged (SR5 p. 230)
        if (actorData.matrix.deviceType !== "host" && !isFile(targetItem)) cardData.chatCard.buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize('SR5.TakeOnDamageMatrix')} (${cardData.damage.matrix.value})`)
        break
      case "dataSpike":
      case "iceBlueGoo":
        cardData.damage.matrix.base = attacker.system.matrix.attributes.attack.value
        cardData = await SR5_MatrixHelpers.updateMatrixDamage(cardData, netHits, actor)
        cardData.chatCard.buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize('SR5.TakeOnDamageMatrix')} (${cardData.damage.matrix.value})`)
        break
      case "popupCybercombat":
        // Kill Code p. 45: matrix damage equal to the hits, with no Attack base nor +2 per mark
        cardData.damage.matrix.base = 0
        cardData = await SR5_MatrixHelpers.updateMatrixDamage(cardData, netHits, actor, false)
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
      //Rigger 5.0 p. 34: the target is tracked for the rigger's slaved attackers until the end of the turn
      case "targetDevice":
        cardData.chatCard.buttons.targetDevice = SR5_RollMessage.generateChatButton("nonOpposedTest", "targetDevice", game.i18n.format("SR5.TargetDeviceApply", {
          hits: netHits
        }))
        break
      //Rigger 5.0 p. 34: the autopilot rolls its rating × 2 against half the net hits, rounded up
      case "confusePilot":
        cardData.chatCard.buttons.confusePilot = SR5_RollMessage.generateChatButton("nonOpposedTest", "confusePilot", game.i18n.format("SR5.ConfusePilotRoll", {
          threshold: confusePilotThreshold(netHits)
        }))
        break
      //Rigger 5.0 p. 35: the lock on the hacker goes down by the net hits. The lock is written on the hacker: his button
      case "breakTargetLock":
        cardData.chatCard.buttons.breakTargetLock = SR5_RollMessage.generateChatButton("attackerTest", "breakTargetLock", game.i18n.format("SR5.BreakTargetLockApply", {
          hits: netHits
        }))
        break
      //SR5 p. 241: the hacker views the traffic of the target, as long as he keeps a mark on it.
      //The button is the hacker's: the card belongs to the defender, its other buttons to whoever owns it
      case "snoop":
        if (SHARED_VISION_ACTOR_TYPES.includes(actor.type)) cardData.chatCard.buttons.snoopVision = SR5_RollMessage.generateChatButton("attackerTest", "snoopVision", game.i18n.format("SR5.SharedVisionSeeThrough", {
          name: actor.name
        }))
        //Lot 14: the messages and calls sent from or to the target, read in the hacker's commcode window
        cardData.chatCard.buttons.snoopComm = SR5_RollMessage.generateChatButton("attackerTest", "snoopComm", game.i18n.format("SR5.COMMCODE_SnoopButton", {
          name: actor.name
        }))
        break
      //SR5 p. 246: the physical location of the target is found, and stays known while a mark stays (lot 14). The
      //button is the hacker's, as Snoop's
      case "traceIcon":
        cardData.chatCard.buttons.traceLocate = SR5_RollMessage.generateChatButton("attackerTest", "traceLocate", game.i18n.format("SR5.COMMCODE_TraceButton", {
          name: actor.name
        }))
        break
      //SR5 p. 242: a silent icon found, the net hits go to information, the first one spotting it (couronne du PAN,
      //lot 5). The button is the observer's, as Snoop's
      case "matrixPerception":
        cardData.chatCard.buttons[PERCEPTION_BUTTON] = SR5_RollMessage.generateChatButton("attackerTest", PERCEPTION_BUTTON, `${game.i18n.localize("SR5.MatrixPerceptionInfoButton")} (${netHits})`)
        break
      //SR5 p. 236: Hide beat the defender, who loses sight of the hider's icons. The defender rolled this card, on
      //her own client
      case "hide":
        await requestForgetIntel({
          holder: attacker?.uuid, observer: actor.uuid
        })
        cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.MatrixPerceptionLostSight"))
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

  //Edit File on a file (SR5 p. 240): whatever the hits, the attacker applies it, as a bomb goes off at the try
  await fileDefenseButton(cardData)

  //A5: the modules hear of the action this defense resolves (matrix-api.js). The marks are those the card's button puts
  const marks = Number(cardData.matrix.mark) || 0
  announceMatrixAction({
    actor: attacker, card: cardData, target: actor, successes: cardData.previousMessage.hits, netHits,
    marksPlaced: netHits > 0 && MARKING_ACTIONS.includes(cardData.test.typeSub) ? marks : 0,
    defenderMarks: netHits <= 0 && cardData.matrix.actionType === "sleaze" ? marks : 0,
  })

  //Remove chat button from previous chat message
  if (cardData.previousMessage.messageId){
    let originalMessage = game.messages.get(cardData.previousMessage.messageId)
    if (originalMessage.flags?.sr5data?.chatCard.buttons?.matrixAction) {
      SR5_RollMessage.updateChatButtonHelper(cardData.previousMessage.messageId, "matrixAction")
    }
  }
}