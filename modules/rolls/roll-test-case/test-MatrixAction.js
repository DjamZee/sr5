import {
  SR5 
} from "../../config.js"
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
  SR5_ActorHelper
} from "../../entities/actors/entityActor-helpers.js"
import {
  SR5_SocketHandler
} from "../../socket.js"

export default async function matrixActionInfo(cardData, actorId){
  let actor = SR5_EntityHelpers.getRealActorFromID(actorId)
  let actorData = actor.system
  cardData.previousMessage.actorId = cardData.speakerId

  //Matrix search special case
  if (cardData.test.typeSub === "matrixSearch"){
    let netHits = cardData.roll.hits - cardData.threshold.value
    cardData.matrix.searchDuration = await SR5_MatrixHelpers.getMatrixSearchDuration(cardData, netHits)
    if (netHits <=0) {
      netHits = 1
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.MatrixSearchFailed"))
    } else {
      cardData.chatCard.buttons.matrixSearchSuccess = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "matrixSearchSuccess", `${game.i18n.localize("SR5.MatrixSearchSuccess")} [${cardData.matrix.searchDuration}]`)
    }
    //The search title is rebuilt at every refresh of the card, so Emulate is named again each time
    cardData.test.title = `${game.i18n.localize("SR5.MatrixActionTest")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.matrixRolledActions[cardData.test.typeSub])} (${cardData.threshold.value})`
    if (cardData.matrix.emulateRating > 0) cardData.test.title += emulateTitle(cardData)
  }

  //AI Depth actions (Data Trails p. 159-161)
  //Emulate: the emulated rating is added to the Overwatch Score at once; when Edge pushes the limit, the test's hits
  //count instead of the rating (Data Trails p. 159), so pushing after the roll swaps the rating already added for the hits.
  //emulateRaised keeps what this roll added: Second Chance refreshes the same roll and adds nothing (SR5 p. 57)
  if (cardData.matrix.emulateRating > 0) {
    let raised = cardData.roll.emulateRaised
    if (raised === undefined && cardData.test.typeSub !== "matrixSearch") cardData.test.title += emulateTitle(cardData)
    //Emulating for a legal action raises nothing (Data Trails p. 157): the player ticks it in the dialog
    let cost = cardData.matrix.emulateLegal ? 0 : cardData.edge?.hasUsedPushTheLimit ? cardData.roll.hits : cardData.matrix.emulateRating
    if (raised === undefined || (cardData.edge.hasUsedPushTheLimit && cost !== raised)) {
      cardData.roll.emulateRaised = cost
      if (cost !== (raised || 0)) await raiseOverwatchScore(cost - (raised || 0), actor)
    }
  }
  if (cardData.test.typeSub === "matrixSearch") return
  if (cardData.test.typeSub === "redefineOwnership") {
    let depth = cardData.matrix.depth || 0, threshold = Number(cardData.threshold.value) || 0
    cardData.test.title = `${game.i18n.localize("SR5.MatrixActionTest")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.matrixRolledActions.redefineOwnership)} (${threshold})`
    //A glitch adds Depth to the Overwatch Score, a critical glitch triggers convergence
    if (cardData.roll.criticalGlitchRoll) ui.notifications.warn(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.INFO_RedefineOwnershipConvergence")}`)
    //Raised once per roll: Second Chance and Push the limit refresh the same roll (SR5 p. 58)
    else if (cardData.roll.glitchRoll && !cardData.roll.overwatchRaised) {
      cardData.roll.overwatchRaised = true
      await raiseOverwatchScore(depth, actor)
    }
    if (threshold > 0 && cardData.roll.hits >= threshold) {
      cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.format("SR5.MatrixActionRedefineOwnershipSuccess", {
        depth: depth
      }))
    }
    return
  }

  //The defense only applies under a link lock (SR5 p. 244): free, nothing opposes the jack out and it succeeds,
  //whatever the hits (DjamZ's ruling of 2026-10-03)
  if (cardData.test.typeSub === "jackOut" && !actorData.matrix.isLinkLocked) {
    cardData.chatCard.buttons.jackOutSuccess = SR5_RollMessage.generateChatButton("nonOpposedTest", "jackOutSuccess", game.i18n.localize("SR5.MatrixActionJackOutSuccess"))
    return
  }

  //Rigger 5 p. 34: Detect Target Lock is a simple test (2), nobody defends against it
  if (cardData.test.typeSub === "detectTargetLock") {
    let success = cardData.roll.hits >= (Number(cardData.threshold.value) || 0)
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize(success ? "SR5.SuccessfulTest" : "SR5.ActionFailure"))
    return
  }

  if (cardData.roll.hits > 0) {
    if (cardData.test.typeSub === "jackOut" && actorData.matrix.isLinkLocked) cardData.chatCard.buttons.jackOut = SR5_RollMessage.generateChatButton("nonOpposedTest", "jackOut", game.i18n.localize("SR5.MatrixActionJackOutResistance"), true)
    else if (cardData.test.typeSub === "eraseMark") cardData.chatCard.buttons.eraseMark = SR5_RollMessage.generateChatButton("opposedTest", "eraseMark", game.i18n.localize("SR5.ChooseMarkToErase"))
    else if (cardData.test.typeSub === "checkOverwatchScore") cardData.chatCard.buttons.checkOverwatchScore = SR5_RollMessage.generateChatButton("nonOpposedTest", "checkOverwatchScore", game.i18n.localize("SR5.OverwatchResistance"), true)
    else if (cardData.test.typeSub === "jamSignals") cardData.chatCard.buttons.matrixJamSignals = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixJamSignals", game.i18n.localize("SR5.MatrixActionJamSignals"))
    else if (cardData.test.typeSub === "iAmTheFirewall") cardData.chatCard.buttons.iAmTheFirewall = SR5_RollMessage.generateChatButton("opposedTest", "iAmTheFirewall", game.i18n.localize("SR5.ApplyEffect"))
    else if (cardData.test.typeSub === "intervene") cardData.chatCard.buttons.intervene = SR5_RollMessage.generateChatButton("opposedTest", "intervene", `${game.i18n.format("SR5.MatrixActionInterveneEffect", {
      hits: cardData.roll.hits
    })}`)
    else cardData.chatCard.buttons.matrixAction = SR5_RollMessage.generateChatButton("opposedTest", "matrixDefense", game.i18n.localize("SR5.Defend"))
  } else {
    cardData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.ActionFailure"))
  }
}

function emulateTitle(cardData){
  return ` (${game.i18n.localize("SR5.MatrixActionEmulate")} ${cardData.matrix.emulateRating})`
}

//Raise the Overwatch Score of the acting AI (owner or GM)
//An unlinked token has its own actor: its token id reaches it, the actor id would reach the base actor
async function raiseOverwatchScore(value, actor){
  let actorId = actor.isToken ? actor.token.id : actor.id
  if (game.user.isGM || actor.isOwner) await SR5_ActorHelper.overwatchIncrease(value, actorId)
  else SR5_SocketHandler.emitForGM("overwatchIncrease", {
    defenseHits: value,
    actorId: actorId,
  })
}
