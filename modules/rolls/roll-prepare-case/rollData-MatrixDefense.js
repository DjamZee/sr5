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
  trustedMatrixAction, tellMatrixCard
} from "../roll-helpers/matrix-card.js"
import {
  defendsWithMaster, directConnectionVerdict, wanMasterOf
} from "../roll-helpers/direct-connection.js"

//The master's defense for this action, put in place of the slave's own (SR5 p. 234)
function useMasterDefense(rollData, master, rollKey){
  rollData.dicePool.composition = master.system.matrix.actions[rollKey].defense.modifiers.filter(mod => (mod.type === "skillRating" || mod.type === "linkedAttribute" || mod.type === "skillGroup" || mod.type === "matrixAttribute"))
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, master.system.matrix.actions[rollKey].defense.modifiers)
}

export default async function matrixDefense(rollData, rollKey, actor, chatData){
  if (actor.type === "actorSpirit") return
  //The hacker's card read again: its hits counted on its dice within his pool, its action type on his sheet (matrix-card.js)
  const attack = await trustedMatrixAction(chatData)
  if (!attack) return void ui.notifications.warn(game.i18n.localize("SR5.MatrixCardRefused"))
  await tellMatrixCard(attack, chatData.roll?.hits)
  chatData = {
    ...chatData, roll: {
      ...chatData.roll, hits: attack.hits
    }, matrix: {
      ...chatData.matrix, actionType: attack.actionType
    }
  }
  let matrixAction = actor.system.matrix.actions[rollKey]
  //The attacker, for the direct connection to a slave (SR5 p. 234, A3 of the API pour Matrice v1): read for a slave only
  const attacker = () => SR5_EntityHelpers.getRealActorFromID(chatData.owner?.speakerId ?? chatData.owner?.actorId, chatData.actorUuids) ?? null
  let slavedToPan = false

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
        slavedToPan = true
        let panMaster = SR5_EntityHelpers.getRealActorFromID(targetItem.system.panMaster)
        //Attacked through a direct connection, the slave has its own ratings alone (SR5 p. 234); a module may rule it
        //attacker by attacker (sr5.matrixDirectConnection)
        const direct = directConnectionVerdict(attacker(), targetItem, false)
        if (direct || targetItem.system.deviceRating * 2 > panMaster.system.matrix.actions[rollKey].defense.dicePool){
          rollData.dicePool.composition = ([
            {
              source: game.i18n.localize("SR5.DeviceRating"), type: "linkedAttribute", value: targetItem.system.deviceRating
            },
            {
              source: game.i18n.localize("SR5.DeviceRating"), type: "linkedAttribute", value: targetItem.system.deviceRating
            },
          ])
        } else useMasterDefense(rollData, panMaster, rollKey)
      }
      rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
    } 
  } else {
    let deck = actor.items.find(d => d.type === "itemDevice" && d.system.isActive)
    //An AI outside any device defends with its persona alone, no device is targeted (Data Trails p. 157)
    if (deck) rollData.target.itemUuid = deck.uuid
  }

  //SR5 p. 234: a device of the scenery slaved to a host or to a master (panMaster, lot 7 of the crown) defends with
  //its master when the master's pool is at least as large, unless the attacker is directly connected to it: by
  //default its isDirectlyConnected switch, which a module may rule attacker by attacker (A3). Before, the master
  //protected none of them: a defect of the alpha, mended
  const wanMaster = slavedToPan ? null : wanMasterOf(actor)
  if (wanMaster && wanMaster.system.matrix.actions[rollKey]?.defense) {
    const device = actor.items.find(d => d.type === "itemDevice" && d.system.isActive) ?? actor
    const direct = directConnectionVerdict(attacker(), device, actor.system.isDirectlyConnected === true)
    const ownPool = matrixAction.defense.dicePool
    if (defendsWithMaster({
      direct, ownPool, masterPool: wanMaster.system.matrix.actions[rollKey].defense.dicePool
    })) {
      useMasterDefense(rollData, wanMaster, rollKey)
      rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
    }
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