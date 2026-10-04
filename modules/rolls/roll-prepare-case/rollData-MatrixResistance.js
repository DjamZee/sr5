import {
  SR5_PrepareRollHelper 
} from "../roll-prepare-helpers.js"

export default async function matrixResistance(rollData, actor, chatData){
  //Determine title
  rollData.test.title = `${game.i18n.localize("SR5.TakeOnDamageMatrix")} (${chatData.damage.matrix.value})`

  //Determine dicepool composition
  // The attribute standing for the device rating belongs to the base pool, as on every other roll: Resonance for a
  // living persona (SR5 p. 103 and 230), Nanite Volume for a head case (Lockdown p. 206), and the attribute an AI
  // outside any device resists with (Data Trails p. 157). getDicepoolModifiers leaves it out of the modifiers.
  rollData.dicePool.composition = actor.system.matrix.resistances.matrixDamage.modifiers.filter(mod => (mod.type === "matrixAttribute" || mod.type === "deviceRating" || mod.type === "linkedAttribute"))
 
  //Determine base dicepool
  rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)

  //Determine dicepool modififiers
  rollData.dicePool.modifiers = SR5_PrepareRollHelper.getDicepoolModifiers(rollData, actor.system.matrix.resistances.matrixDamage.modifiers.filter(mod => (mod.type !== "matrixAttribute" && mod.type !== "deviceRating")))

  if (chatData.target.itemUuid){
    let matrixTargetItem = await fromUuid(chatData.target.itemUuid)
    //The device may have been deleted since the attack card was posted: warn and abort, the caller opens no dialog
    if (!matrixTargetItem?.system){
      ui.notifications.warn(game.i18n.localize("SR5.WARN_MatrixResistanceDeviceMissing"))
      return
    }
    if (matrixTargetItem.system.type !== "baseDevice" && matrixTargetItem.system.type !== "livingPersona" && matrixTargetItem.system.type !== "headcase" && matrixTargetItem.system.type !== "cyberdeck" && matrixTargetItem.system.type !== "commlink"){ 
      rollData.test.title = `${matrixTargetItem.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize("SR5.TakeOnDamageShort")} (${chatData.damage.matrix.value})`
      rollData.dicePool.composition = ([
        {
          source: game.i18n.localize("SR5.DeviceRating"), type: "linkedAttribute", value: matrixTargetItem.system.deviceRating
        },
        {
          source: game.i18n.localize("SR5.DeviceRating"), type: "linkedAttribute", value: matrixTargetItem.system.deviceRating
        },
      ])
      rollData.dicePool.base = SR5_PrepareRollHelper.getBaseDicepool(rollData)
    }
    rollData.target.itemUuid = chatData.target.itemUuid
  }

  //Add others informations
  rollData.test.type = "matrixResistance"
  rollData.matrix.actionType = chatData.matrix.actionType
  rollData.previousMessage.actorId = chatData.previousMessage.actorId
  rollData.previousMessage.messageId = chatData.owner.messageId
  rollData.damage.matrix.base = chatData.damage.matrix.value
  rollData.damage.type = chatData.damage.type
  rollData.damage.isAttack = !!chatData.damage.isAttack

  return rollData
}
