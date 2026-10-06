import {
  SR5 
} from "../../config.js"
import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  trustedMatrixAction
} from "../roll-helpers/matrix-card.js"

//The GM is told what a player's card announced beyond its dice
async function whisperMismatch(attack, chatData){
  const {
    SR5_ActorHelper
  } = await import("../../entities/actors/entityActor-helpers.js")
  const text = game.i18n.format("SR5.MatrixCardHits", {
    user: attack.card.author?.name ?? "?", actor: attack.card.roller?.name ?? "?", value: attack.hits, claimed: chatData.roll?.hits ?? 0,
  })
  if (game.user?.isGM) ui.notifications.warn(text, {
    permanent: true
  })
  await SR5_ActorHelper.whisperGM(text)
}

export default async function matrixDefense(rollData, rollKey, actor, chatData){
  if (actor.type === "actorSpirit") return
  //The hacker's card read again: its hits counted on its dice within his pool, its action type on his sheet (matrix-card.js)
  const attack = await trustedMatrixAction(chatData)
  if (!attack) return void ui.notifications.warn(game.i18n.localize("SR5.MatrixCardRefused"))
  if (attack.hits !== (Number(chatData.roll?.hits) || 0)) await whisperMismatch(attack, chatData)
  chatData = {
    ...chatData, roll: {
      ...chatData.roll, hits: attack.hits
    }, matrix: {
      ...chatData.matrix, actionType: attack.actionType
    }
  }
  let matrixAction = actor.system.matrix.actions[rollKey]

  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.MatrixDefenseTest")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.matrixRolledActions[rollKey])} (${chatData.roll.hits})`

  //Determine dicepool composition
  rollData.dicePool.composition = matrixAction.defense.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup" || mod.type === "matrixAttribute"))

  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, matrixAction.defense.modifiers)

  //Handle item targeted
  if (chatData.target.itemUuid){
    let targetItem = await fromUuid(chatData.target.itemUuid)
    //The device may have been deleted since the attack card was posted: warn and abort, the caller opens no dialog
    if (!targetItem?.system){
      ui.notifications.warn(game.i18n.localize("SR5.WARN_MatrixTargetDeviceMissing"))
      return
    }
    rollData.target.itemUuid = chatData.target.itemUuid
    if (targetItem.system.type !== "device"){
      //The defending device is named, slaved to a PAN or not
      rollData.test.title = `${targetItem.name} - ${game.i18n.localize("SR5.MatrixDefenseTest")}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.matrixRolledActions[rollKey])} (${chatData.roll.hits})`
      if (!targetItem.system.isSlavedToPan){
        rollData.dicePool.composition = ([
          {
            source: game.i18n.localize("SR5.DeviceRating"), type: "linkedAttribute", value: targetItem.system.deviceRating
          },
          {
            source: game.i18n.localize("SR5.DeviceRating"), type: "linkedAttribute", value: targetItem.system.deviceRating
          },
        ])
      } else {
        let panMaster = SR5_EntityHelpers.getRealActorFromID(targetItem.system.panMaster)
        if (targetItem.system.deviceRating * 2 > panMaster.system.matrix.actions[rollKey].defense.dicePool){
          rollData.dicePool.composition = ([
            {
              source: game.i18n.localize("SR5.DeviceRating"), type: "linkedAttribute", value: targetItem.system.deviceRating
            },
            {
              source: game.i18n.localize("SR5.DeviceRating"), type: "linkedAttribute", value: targetItem.system.deviceRating
            },
          ])
        } else {
          rollData.dicePool.composition = panMaster.system.matrix.actions[rollKey].defense.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup" || mod.type === "matrixAttribute"))
          rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, panMaster.system.matrix.actions[rollKey].defense.modifiers)
        }
      }
      rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
    } 
  } else {
    let deck = actor.items.find(d => d.type === "itemDevice" && d.system.isActive)
    //An AI outside any device defends with its persona alone, no device is targeted (Data Trails p. 157)
    if (deck) rollData.target.itemUuid = deck.uuid
  }
    
  //Add others informations
  rollData.test.type = "matrixDefense"
  rollData.test.typeSub = rollKey
  rollData.combat.activeDefenses.full = actor.system.specialProperties?.fullDefenseValue || 0
  rollData.matrix.mark = chatData.matrix.mark
  rollData.matrix.overwatchScore = matrixAction.increaseOverwatchScore
  rollData.matrix.actionType = chatData.matrix.actionType
  rollData.previousMessage.actorId = chatData.owner.actorId
  rollData.previousMessage.hits = chatData.roll.hits
  rollData.previousMessage.messageId = chatData.owner.messageId
  //The hacker's user, who alone sees the buttons left to him on the defense card (Snoop, SR5 p. 241)
  rollData.previousMessage.userId = chatData.owner.userId

  //Special case for erase Mark
  if (rollKey === "eraseMark" && chatData.previousMessage.actorId){
    rollData.test.type = "eraseMark"
    rollData.previousMessage.actorId = chatData.previousMessage.actorId
    rollData.previousMessage.itemUuid = chatData.previousMessage.itemUuid
    rollData.previousMessage.messageId = chatData.owner.messageId
  }

  return rollData
}