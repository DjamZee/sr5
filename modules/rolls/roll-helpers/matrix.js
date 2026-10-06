import {
  SR5 
} from "../../config.js"
import {
  SR5_SocketHandler 
} from "../../socket.js"
import {
  SR5_RollTest 
} from "../roll-test.js"
import {
  SR5_ConverterHelpers 
} from "./converter.js"
import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_MarkHelpers 
} from "./mark.js"
import {
  SR5_PrepareRollTest 
} from "../roll-prepare.js"
import {
  _getSRStatusEffect 
} from "../../system/effectsList.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  SR5_ActorHelper
} from "../../entities/actors/entityActor-helpers.js"
import {
  SR5_MiscellaneousHelpers
} from "./miscellaneous.js"
import {
  recountHits, consumedKey
} from "./socket-guard.js"
import {
  originalStrainDevice
} from "../../system/monad-matrix.js"
import {
  SR5_CharacterUtility
} from "../../entities/actors/utilityActor.js"

//A warning, and false: nothing was written, the card's button stays
function warned(key) {
  ui.notifications.warn(game.i18n.localize(key))
  return false
}

export class SR5_MatrixHelpers {
  //Get time spent on a matrix search
  static async getMatrixSearchDuration(cardData, netHits){
    let timeSpent, duration = ""
    cardData.matrix.searchUnit = SR5_ConverterHelpers.matrixSearchTypeToUnitTime(cardData.threshold.type)
    cardData.matrix.searchTime = SR5_ConverterHelpers.matrixSearchTypeToTime(cardData.threshold.type)

    if (cardData.matrix.searchUnit === "minute") timeSpent = (cardData.matrix.searchTime * 60)/netHits
    if (cardData.matrix.searchUnit === "hour") timeSpent = (cardData.matrix.searchTime * 60 * 60)/netHits
        
    let time = new Date(null)
    time.setSeconds(timeSpent)
    let seconds = time.getSeconds()
    let minutes = time.getMinutes()
    let hours = time.getHours()-1
        
    if (hours) duration = `${hours}${game.i18n.localize("SR5.HoursUnit")} `
    if (minutes) duration += `${minutes}${game.i18n.localize("SR5.MinuteUnit")} `
    if (seconds) duration += `${seconds}${game.i18n.localize("SR5.SecondUnit")} `
        
    return duration
  }

  /** Apply Matrix Damage to a Deck
    * @param {Object} targetActor - The Target Actor who owns the deck/item
    * @param {Object} cardData - Message data
    * @param {Object} attacker - Actor who do the damage
    * @returns {Promise<boolean>} true once the damage is written, relayed to the active GM, or told to him to write by hand;
    *   false when nothing could be done, so that the card's button stays (Joachim's finding: no GM connected)
    */
  static async applyDamageToDecK(targetActor, cardData, defender, defenderWin) {
    let damageValue = cardData.damage.matrix.value
    let targetItem
    if (cardData.target.itemUuid && !defenderWin) {
      targetItem = await fromUuid(cardData.target.itemUuid)
      //The aimed device was deleted since the attack: the damage must not fall on another device
      if (!targetItem) return warned("SR5.WARN_MatrixDamageDeviceMissing")
    }
    if (!targetItem) targetItem = targetActor.items.find((item) => item.type === "itemDevice" && item.system.isActive)
    //An AI outside any device only has its core condition monitor, which takes all its damage (Data Trails p. 161)
    if (!targetItem) {
      if (targetActor.system.activeSpecialAttribute === "depth") {
        await targetActor.takeDamage(cardData)
        return true
      }
      //No active device nor living persona item: the damage is written nowhere, the GM is told so (Anatole's matrix trial).
      //A technomancer takes it as Stun (SR5 p. 230), to be written by hand
      const content = game.i18n.format("SR5.WARN_MatrixDamageNowhere", {
        name: targetActor.name, value: damageValue,
      })
      ui.notifications.warn(content)
      await ChatMessage.create({
        content: `<p>${foundry.utils.escapeHTML(content)}</p>`, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      })
      return true
    }
    let newItem = foundry.utils.duplicate(targetItem)

    //targetActor.takeDamage(cardData);
    //A Monad of the original strain takes matrix damage on its nanite swarm, as an AI on its device (Dark Terrors p. 88)
    let swarm = !!targetItem.id && originalStrainDevice(targetActor)?.id === targetItem.id
    if (!swarm && (targetItem.system.type === "livingPersona" || targetItem.system.type === "headcase")){
      await targetActor.takeDamage(cardData)
      return true
    }
    //A player's browser only asks the active GM, who reads the card again and may refuse it (socket-guard.js): with no
    //GM connected, nothing is written and the button stays
    const relayed = !game.user?.isGM
    if (relayed && !(game.users?.activeGM ?? game.users?.find?.(u => u.isGM && u.active))) return warned("SR5.WARN_NoActiveGM")

    if (targetActor.system.matrix.programs.virtualMachine.isActive) damageValue += 1

    //The size of the monitor is prepared (SR5 p. 228): the copy above holds the source, where it is 0,
    //and every first box used to brick the device. No box is kept beyond the monitor
    let monitorSize = targetItem.system.conditionMonitors.matrix.value
    //Boxes beyond the monitor: the overflow an AI on this device resists when dissipated (Data Trails p. 161)
    let surplus = Math.max(0, newItem.system.conditionMonitors.matrix.actual.base + damageValue - monitorSize)
    newItem.system.conditionMonitors.matrix.actual.base = Math.min(newItem.system.conditionMonitors.matrix.actual.base + damageValue, monitorSize)
    SR5_EntityHelpers.updateValue(newItem.system.conditionMonitors.matrix.actual, 0, monitorSize)
    //An AI shares the matrix monitor of the device it is loaded on, and is dissipated when it fills (Data Trails p. 161)
    let aiDissipated = false
    //A full swarm is no bricked deck: the Monad is not disconnected, the device stays as it is (Dark Terrors p. 88)
    if (!swarm && newItem.system.conditionMonitors.matrix.actual.value >= monitorSize){
      //No dumpshock for an AI: it is dissipated instead (decided by DjamZ, 04/10)
      if (targetActor.system.activeSpecialAttribute === "depth") aiDissipated = true
      //A bricked device throws a character in VR out of the Matrix, with dumpshock resisted by Willpower alone (SR5 p. 229, 231)
      else if (targetItem.type === "itemDevice" && SR5_ActorHelper.dumpshockIfInVR(targetActor, {
        bricked: true
      })){
        ui.notifications.info(`${targetActor.name} ${game.i18n.localize("SR5.INFO_IsDisconnected")}.`)
      }
      newItem.system.isActive = false
      newItem.system.wirelessTurnedOn = false
    }
    if (game.user?.isGM) targetItem.update({
      system: newItem.system
    })
    else SR5_SocketHandler.emitForGM("updateItem", {
      item: targetItem.uuid,
      info: newItem.system,
      //The GM reads this card again and bounds the boxes by it (socket-guard.js)
      use: "matrixDamage", messageId: cardData.owner?.messageId,
    })
    if (aiDissipated) {
      //A player who deals the damage cannot write on the AI: the GM lays the status, as for the device above
      let actorId = targetActor.isToken ? targetActor.token.id : targetActor.id
      if (game.user?.isGM) await SR5_ActorHelper.createDeadEffect(actorId, {
        surplus, itemUuid: targetItem.uuid
      })
      else SR5_SocketHandler.emitForGM("createDeadEffect", {
        actorId: actorId,
        itemUuid: targetItem.uuid,
        surplus,
      })
    }

    //Relayed, the damage is only asked for: the GM's browser may still refuse it
    if (relayed) ui.notifications.info(game.i18n.format("SR5.INFO_MatrixDamageRelayed", {
      name: targetActor.name, item: targetItem.name, value: damageValue
    }))
    else if (defender) ui.notifications.info(`${defender.name} ${game.i18n.format("SR5.INFO_ActorDoMatrixDamage", {
      damageValue: damageValue
    })} ${targetActor.name}.`)
    else ui.notifications.info(`${targetActor.name} (${targetItem.name})${game.i18n.localize("SR5.Colons")} ${damageValue} ${game.i18n.localize("SR5.AppliedMatrixDamage")}.`)
    return true
  }



  // Update Matrix Damage to a Deck
  //withMarks false: an action whose damage the book sets without the +2 per mark (Popup, Kill Code p. 45)
  static async updateMatrixDamage(cardData, netHits, defender, withMarks = true){
    let attacker = SR5_EntityHelpers.getRealActorFromID(cardData.previousMessage.actorId, cardData.actorUuids),
      attackerData = attacker?.system,
      damage = cardData.damage.matrix.base,
      item = cardData.target.itemUuid ? await fromUuid(cardData.target.itemUuid) : null,
      //An AI outside any device has no targeted item: the marks are read on its persona (Data Trails p. 157)
      markHolder = item?.system ?? defender.system.matrix,
      mark = withMarks ? await SR5_MarkHelpers.findMarkValue(markHolder, attacker.id) : 0

    if (withMarks && attacker.type === "actorDevice"){
      if (attacker.system.matrix.deviceType === "ice"){
        mark = await SR5_MarkHelpers.findMarkValue(markHolder, attacker.id)
      }
    }
    cardData.damage.matrix.modifiers = {
    }
    cardData.damage.matrix.modifiers.netHits = netHits
    cardData.damage.matrix.modifiers.markQty = mark
        
    //Mugger program
    if (mark > 0 && attackerData.matrix.programs.mugger.isActive) {
      mark = mark * 2
      cardData.damage.matrix.modifiers.muggerIsActive = true
    }

    //Guard program
    if (defender.system.matrix.programs.guard.isActive) {
      damage = cardData.damage.matrix.base + netHits + mark
      cardData.damage.matrix.modifiers.guardIsActive = true
      cardData.damage.matrix.modifiers.markDamage = mark
    } else {
      damage = cardData.damage.matrix.base + netHits + (mark * 2)
      cardData.damage.matrix.modifiers.markDamage = mark*2
    }

    //Hammer program
    if (attackerData.matrix.programs.hammer.isActive) {
      damage += 2
      cardData.damage.matrix.modifiers.hammerDamage = 2
    }

    cardData.damage.matrix.value = damage
    return cardData
  }

  static async chooseMatrixDefender(cardData, actor){
    let list = {
    }
    for (let key of Object.keys(actor.system.matrix.connectedObject)){
      if (Object.keys(actor.system.matrix.connectedObject[key]).length) {
        list[key] = SR5_EntityHelpers.sortObjectValue(actor.system.matrix.connectedObject[key])
      }
    }
    let dialogData = {
      //An AI outside any device has no device name: the choice names its persona (Data Trails p. 157)
      device: actor.system.matrix.deviceName || actor.name,
      list: list,
    }
    const dlg = await foundry.applications.handlebars.renderTemplate("systems/sr5/templates/interface/itemMatrixTarget.hbs", dialogData)
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('SR5.ChooseMatrixTarget') 
      },
      content: dlg,
      buttons: [
        {
          action: "ok",
          label: "Ok",
          default: true,
          callback: (event, button, dialog) => ({
            action: "ok", element: dialog.element 
          }),
        },
        {
          action: "cancel",
          label: "Cancel",
          callback: () => ({
            action: "cancel" 
          }),
        },
      ],
      rejectClose: false,
    })
    if (!result || result.action !== "ok") return
    let targetItem = result.element.querySelector("[name=target]").value
    if (targetItem !== "device") cardData.target.itemUuid = targetItem
    actor.rollTest("matrixDefense", cardData.test.typeSub, cardData)
  }

  static async rollOverwatchDefense(cardData){
    let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId, cardData.actorUuids)
    let rollData = SR5_PrepareRollTest.getBaseRollData(null, actor)

    rollData.test.type = "overwatchResistance"
    rollData.test.title = `${game.i18n.localize("SR5.OverwatchResistance")} (${cardData.roll.hits})`
    rollData.dicePool.value = 6
    rollData.dicePool.base = 6
    rollData.previousMessage.actorId = cardData.owner.actorId
    rollData.previousMessage.hits = cardData.roll.hits

    rollData.roll = await SR5_RollTest.rollDice({
      dicePool: 6 
    })

    await SR5_RollTest.addInfoToCard(rollData, cardData.owner.actorId)
    SR5_RollTest.renderRollCard(rollData)
  }

  //The hits of a Jack Out card the GM stands by: a GM's as written; a player's counted again on its dice. `capped`: within
  //the Jack Out pool of the sheet and its Firewall limit; `pushed`: within the pool plus the Edge rating, no limit (SR5
  //p. 56), only if the GM grants the push (rollJackOut). null when the card cannot be believed
  static jackOutHits(cardData){
    const card = SR5_MiscellaneousHelpers.cardOf(cardData.owner?.messageId)
    if (!card || card.data.test?.typeSub !== "jackOut") return null
    if (card.byGM) {
      const hits = Math.max(0, Number(card.data.roll?.hits) || 0)
      return {
        card, capped: hits, pushed: hits, claimsPush: false
      }
    }
    const action = card.roller?.system?.matrix?.actions?.jackOut
    const pool = Math.max(0, Number(action?.test?.dicePool) || 0)
    const withEdge = SR5_MiscellaneousHelpers.poolCap(card.roller, "matrix.actions.jackOut.test.dicePool")
    const counted = recountHits(card.data.roll?.r, pool), countedWithEdge = recountHits(card.data.roll?.r, withEdge)
    if (counted === null || countedWithEdge === null) return null
    const limit = Number(action?.limit?.value) || 0
    return {
      card, capped: limit > 0 ? Math.min(counted, limit) : counted, pushed: countedWithEdge,
      claimsPush: !!card.data.edge?.hasUsedPushTheLimit,
    }
  }

  //A player's card that says it pushed the limit: the roll spent the Edge on the player's own sheet, which she can write
  //back. The push counts only if the sheet shows some Edge spent, and if the GM grants it (Anke's review)
  static async grantJackOutPush(jackOut){
    const actor = jackOut.card.roller
    const spent = Number(actor?.system?.conditionMonitors?.edge?.actual?.value) || 0
    const rating = Number(actor?.system?.specialAttributes?.edge?.augmented?.value) || 0
    if (spent <= 0) {
      ui.notifications.warn(game.i18n.format("SR5.WARN_JackOutPushNoEdge", {
        hits: jackOut.capped
      }))
      return false
    }
    return foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("SR5.JackOutPushTitle")
      },
      content: `<p>${game.i18n.format("SR5.JackOutPushConfirm", {
        actor: foundry.utils.escapeHTML?.(actor.name) ?? actor.name, pushed: jackOut.pushed, capped: jackOut.capped, spent, rating
      })}</p>`,
      rejectClose: false,
    }).catch(() => false)
  }

  static async rollJackOut(cardData){
    //The GM rolls the locks against the card read again from the chat log, never against the hits it claims
    const jackOut = SR5_MatrixHelpers.jackOutHits(cardData)
    if (!jackOut) return ui.notifications.warn(game.i18n.localize("SR5.WARN_JackOutCardRefused"))
    //A card serves once: its button, written back in its content, rolled the locks again at every click (Anke's
    //review). The spent cards are the active GM's ledger
    if (!game.users?.activeGM?.isSelf) return ui.notifications.warn(game.i18n.localize("SR5.WARN_JackOutActiveGMOnly"))
    if (!(await SR5_MiscellaneousHelpers.consume(consumedKey(jackOut.card.id, "jackOut")))) return ui.notifications.warn(game.i18n.localize("SR5.WARN_JackOutCardSpent"))
    let actor = jackOut.card.roller, hits = jackOut.capped
    if (jackOut.claimsPush && await SR5_MatrixHelpers.grantJackOutPush(jackOut)) hits = jackOut.pushed

    //One jack out roll, whose hits are compared to each link lock in turn (SR5 p. 246): one resistance card per lock
    for (let lock of SR5_MatrixHelpers.getLinkLocks(actor)){
      let dicePool = lock.system.value
      let rollData = SR5_PrepareRollTest.getBaseRollData(null, actor)
      rollData.test.type = "jackOutDefense"
      rollData.test.title = `${game.i18n.localize("SR5.MatrixActionJackOutResistance")} (${hits})`
      rollData.dicePool.base = dicePool
      rollData.dicePool.value = dicePool
      rollData.previousMessage.hits = hits
      rollData.previousMessage.itemUuid = lock.id
      rollData.roll = await SR5_RollTest.rollDice({
        dicePool: dicePool
      })

      await SR5_RollTest.addInfoToCard(rollData, actor.isToken ? actor.token.id : actor.id)
      await SR5_RollTest.renderRollCard(rollData)
    }
  }

  //The link lock effects of an actor, one per icon that locked it
  static getLinkLocks(actor){
    return actor.items.filter(i => i.type === "itemEffect" && Object.values(i.system.customEffects ?? {
    }).some(e => e.target === "system.matrix.isLinkLocked"))
  }

  //Jack out (SR5 p. 244): free of the link lock, the character reboots the device used
  static async jackOut(cardData){
    let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId, cardData.actorUuids)
    //Only the lock this card beat goes: each lock is beaten on its own (SR5 p. 246)
    let beaten = cardData.previousMessage.itemUuid
    if (beaten && actor.items.find(i => i.id === beaten)) await actor.deleteEmbeddedDocuments("Item", [beaten])
    //While another lock holds, the character is not free and the device does not reboot
    if (SR5_MatrixHelpers.getLinkLocks(actor).length) return
    await SR5_EntityHelpers.deleteEffectOnActor(actor, "linkLock")

    //rebootDeck spends no action: the jack out has already paid for its own. It deals the dumpshock
    //in VR, cold or hot sim, link lock or not (SR5 p. 231 and 244)
    await actor.rebootDeck()
  }

  //Jam Signals adds the hits to the Noise rating (SR5 p. 239). system.matrix.noise holds that rating as a
  //positive number, turned into a dice pool malus when a matrix test reads it (rollData-MatrixAction.js),
  //like the scene's own noise : a negative value here gave the jammer, and every jammed device, bonus dice.
  static async jamSignals(cardData){
    let actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId, cardData.actorUuids)
    let noise = cardData.roll.hits
    let effect = {
      name: game.i18n.localize("SR5.EffectSignalJam"),
      type: "itemEffect",
      "system.type": "signalJam",
      "system.ownerID": actor.id,
      "system.ownerName": actor.name,
      "system.duration": 0,
      "system.durationType": "permanent",
      "system.target": game.i18n.localize("SR5.MatrixNoise"),
      "system.value": noise,
      "system.customEffects": {
        "0": {
          "category": "matrixAttributes",
          "target": "system.matrix.noise",
          "type": "value",
          "value": noise,
          "forceAdd": true,
        }
      },
    }
    await actor.createEmbeddedDocuments("Item", [effect])
    let statusEffect = await _getSRStatusEffect("signalJam", noise)
    await actor.createEmbeddedDocuments('ActiveEffect', [statusEffect])
  }

  static async applyDerezzEffect(cardData, sourceActor, target){
    let itemEffect = {
      name: game.i18n.localize("SR5.EffectReduceFirewall"),
      type: "itemEffect",
      "system.target": game.i18n.localize("SR5.Firewall"),
      "system.value": -cardData.damage.matrix.value,
      "system.type": "derezz",
      "system.ownerID": sourceActor.id,
      "system.ownerName": sourceActor.name,
      "system.duration": 0,
      "system.durationType": "reboot",
      "system.customEffects": {
        "0": {
          "category": "matrixAttributes",
          "target": "system.matrix.attributes.firewall",
          "type": "value",
          "value": -cardData.damage.matrix.value,
          "forceAdd": true,
        }
      },
    }
    if (!target.items.find(i => i.system.type === "derezz")) await target.createEmbeddedDocuments("Item", [itemEffect])
  }

  //create link lock effet
  static async applylinkLockEffect(attacker, target){
    //An AI outside any device is immune to link-locking (Data Trails p. 157): the program and every IC come through here
    if (SR5_CharacterUtility.isDevicelessAI(target)) return
    let effect = {
      type: "itemEffect",
      "system.type": "linkLock",
      "system.ownerID": attacker.id,
      "system.ownerName": attacker.name,
      "system.durationType": "permanent",
      name: game.i18n.localize("SR5.EffectLinkLockedConnection"),
      "system.target": game.i18n.localize("SR5.EffectLinkLockedConnection"),
      "system.value": attacker.system.matrix.actions.jackOut.defense.dicePool,
      "system.customEffects": {
        "0": {
          "category": "special",
          "target": "system.matrix.isLinkLocked",
          "type": "boolean",
          "value": "true",
        }
      },
    }
    target.createEmbeddedDocuments("Item", [effect])
    let statusEffect = await _getSRStatusEffect("linkLock")
    await target.createEmbeddedDocuments('ActiveEffect', [statusEffect])
    ui.notifications.info(`${target.name}${game.i18n.format('SR5.Colons')} ${game.i18n.localize('SR5.INFO_IsLinkLocked')} ${attacker.name}`)
  }

  //Name of the device the card aimed at, or of the target when there is none
  static async targetDeviceName(cardData, target){
    let device = cardData.target?.itemUuid ? await fromUuid(cardData.target.itemUuid) : null
    return device?.name ?? target.name
  }

  //create denial of service Effect
  static async applyDenialOfServiceEffect(cardData, sourceActor, target){
        
    let netHits = cardData.previousMessage.hits - cardData.roll.hits
    //No device behind the card (a persona targeted, a device deleted since): the effect names the target
    let deviceName = await SR5_MatrixHelpers.targetDeviceName(cardData, target)
    let effect = {
      name: `${game.i18n.localize('SR5.MatrixActionDenialOfService')} (${deviceName})`,
      type: "itemEffect",
      "system.type": "matrixAction",
      "system.ownerID": sourceActor.id,
      "system.ownerName": sourceActor.name,
      "system.duration": 1,
      "system.durationType": "round",
      "system.target": deviceName,
      "system.value": (netHits * 2),
      "system.customEffects": {
        "0": {
          "category": "penaltyTypes",
          "target": "system.penalties.special.actual",
          "type": "value",
          "value": -(netHits * 2),
          "forceAdd": true,
        }
      },
      "system.gameEffect": game.i18n.localize("SR5.MatrixActionDenialOfService_GE"),
    }
    await target.createEmbeddedDocuments("Item", [effect])
    ui.notifications.info(`${target.name}${game.i18n.format('SR5.Colons')} ${game.i18n.localize('SR5.MatrixActionDenialOfService')} (${deviceName})`)
  }

  //Allies receiving a matrix support effect: the tokens targeted by the user, or the selected token as a fallback
  static _getSupportedAllies(speaker){
    let allies = Array.from(game.user.targets).map(t => t.actor).filter(a => a)
    if (!allies.length) {
      let selected = SR5_EntityHelpers.getRealActorFromID(speaker.token)
      if (selected) allies = [selected]
    }
    if (!allies.length) ui.notifications.warn(game.i18n.localize("SR5.WARN_MatrixSupportNoTarget"))
    return allies
  }
  // Kill Code p. 43: Haywire disables every PAN function of the target persona until it succeeds an extended
  // Computer + Logic [Data Processing] test against the hacker's hits, or reboots (one combat turn)
  static async applyHaywireEffect(cardData, sourceActor, target){
    let hackerHits = cardData.previousMessage.hits
    let effect = {
      name: game.i18n.localize('SR5.MatrixActionHaywire'),
      type: "itemEffect",
      "system.type": "matrixAction",
      "system.ownerID": sourceActor.id,
      "system.ownerName": sourceActor.name,
      "system.duration": "",
      "system.durationType": "special",
      "system.target": game.i18n.localize('SR5.PAN'),
      "system.value": hackerHits,
      "system.gameEffect": game.i18n.localize("SR5.MatrixActionHaywire_GE"),
    }
    await target.createEmbeddedDocuments("Item", [effect])
    ui.notifications.info(`${target.name}${game.i18n.format('SR5.Colons')} ${game.i18n.localize('SR5.MatrixActionHaywire')} (${hackerHits})`)
  }


  //Create an effect on an ally, through the GM when the user does not own the ally.
  //A previous effect of the same kind from the same hacker is replaced, not stacked.
  static async _createEffectOnAlly(ally, effect, messageId){
    let previous = ally.items.filter(i => i.type === "itemEffect" && i.system.type === effect["system.type"] && i.system.ownerID === effect["system.ownerID"]).map(i => i.id)
    if (ally.isOwner) {
      if (previous.length) await ally.deleteEmbeddedDocuments("Item", previous)
      await ally.createEmbeddedDocuments("Item", [effect])
    } else await SR5_SocketHandler.emitForGM("createItemEffect", {
      actorId: ally.uuid, effect: effect, replace: previous, messageId,
    })
  }

  //Defense bonus effect shared by the Kill Code support actions (I Am the Firewall, Intervene)
  static _defenseBonusEffect(name, type, sourceActor, hits, duration, durationType, gameEffect){
    return {
      name: `${game.i18n.localize(name)} (${sourceActor.name})`,
      type: "itemEffect",
      "system.target": game.i18n.localize("SR5.Defense"),
      "system.type": type,
      "system.value": hits,
      "system.ownerID": sourceActor.id,
      "system.ownerName": sourceActor.name,
      "system.duration": duration,
      "system.durationType": durationType,
      "system.customEffects": {
        "0": {
          "category": "defenses",
          "target": "system.defenses.defend",
          "type": "value",
          "value": hits,
          "forceAdd": true,
        }
      },
      "system.gameEffect": game.i18n.localize(gameEffect),
    }
  }

  //create I Am the Firewall Effect (Kill Code p. 43): every ally on the hacker's AR feed, at most Data Processing users,
  //gets the hits as Defense dice until the hacker's next Initiative Pass
  static async applyIAmTheFirewallEffect(cardData, speaker, sourceActor){
    let hits = cardData.roll.hits
    let allies = SR5_MatrixHelpers._getSupportedAllies(speaker)
    if (!allies.length) return
    let maxUsers = sourceActor.system.matrix?.attributes?.dataProcessing?.value || 0
    if (allies.length > maxUsers) return ui.notifications.warn(game.i18n.format("SR5.WARN_IAmTheFirewallTooManyTargets", {
      actor: sourceActor.name, max: maxUsers, count: allies.length,
    }))

    let effect = SR5_MatrixHelpers._defenseBonusEffect("SR5.MatrixActionIAmTheFirewall", "iAmTheFirewall", sourceActor, hits, 1, "initiativePass", "SR5.MatrixActionIAmTheFirewall_GE")
    for (let ally of allies){
      await SR5_MatrixHelpers._createEffectOnAlly(ally, effect, cardData.owner?.messageId)
      ui.notifications.info(`${ally.name}${game.i18n.format('SR5.Colons')} ${game.i18n.format('SR5.MatrixActionIAmTheFirewall')} (+${hits})`)
    }
  }

  //create Intervene Effect (Kill Code p. 43-44): the hits are added to the ally's current Defense test only
  static async applyInterveneEffect(cardData, speaker, sourceActor){
    let hits = cardData.roll.hits
    let allies = SR5_MatrixHelpers._getSupportedAllies(speaker)
    if (!allies.length) return false
    if (allies.length > 1) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_InterveneSingleTarget"))
      return false
    }

    let effect = SR5_MatrixHelpers._defenseBonusEffect("SR5.MatrixActionIntervene", "intervene", sourceActor, hits, 1, "action", "SR5.MatrixActionIntervene_GE")
    await SR5_MatrixHelpers._createEffectOnAlly(allies[0], effect, cardData.owner?.messageId)
    ui.notifications.info(`${allies[0].name}${game.i18n.format('SR5.Colons')} ${game.i18n.format('SR5.MatrixActionInterveneEffectNotification', {
      hits: hits
    })}`)
    return true
  }
  //create popup Effect
  static async applyPopupEffect(cardData, sourceActor, target){
    let netHits = cardData.previousMessage.hits - cardData.roll.hits
    //No device behind the card (a persona targeted, a device deleted since): the effect names the target
    let deviceName = await SR5_MatrixHelpers.targetDeviceName(cardData, target)
    let action = cardData.test.typeSub
    let effect = {
      name: `${game.i18n.localize(SR5.matrixKillCodeActions[action])} (${deviceName})`,
      type: "itemEffect",
      "system.type": "matrixAction",
      "system.ownerID": sourceActor.id,
      "system.ownerName": sourceActor.name,
      "system.duration": 1,
      "system.durationType": "round",
      "system.target": deviceName,
      "system.value": netHits,
      "system.customEffects": {
        "0": {
          "category": "penaltyTypes",
          "target": "system.penalties.special.actual",
          "type": "value",
          "value": -netHits,
          "forceAdd": true,
        }
      },
      "system.gameEffect": game.i18n.localize(SR5.matrixKillCodeActions[action] + "_GE"),
    }
    await target.createEmbeddedDocuments("Item", [effect])
    ui.notifications.info(`${target.name}${game.i18n.format('SR5.Colons')} ${game.i18n.localize(SR5.matrixKillCodeActions[action])}`)
  }
    

  /** Handle ICE specific attack effect
    * @param {Object} cardData - The chat message data
    * @param {Object} ice - The ICE actor
    * @param {Object} target - Actor who is the target of the ICE attack
    */
  static async applyIceEffect(cardData, ice, target){
    let effect = {
      type: "itemEffect",
      "system.type": "iceAttack",
      "system.ownerID": ice.id,
      "system.ownerName": ice.name,
      "system.durationType": "reboot",
    }

    switch(cardData.test.typeSub){
      case "iceAcid":
        effect = foundry.utils.mergeObject(effect, {
          name: game.i18n.localize("SR5.EffectReduceFirewall"),
          "system.target": game.i18n.localize("SR5.Firewall"),
          "system.value": -1,
          "system.customEffects": {
            "0": {
              "category": "matrixAttributes",
              "target": "system.matrix.attributes.firewall",
              "type": "value",
              "value": -1,
              "forceAdd": true,
            }
          },
        })
        target.createEmbeddedDocuments("Item", [effect])
        break
      case "iceBinder":
        effect = foundry.utils.mergeObject(effect, {
          name: game.i18n.localize("SR5.EffectReduceDataProcessing"),
          "system.target": game.i18n.localize("SR5.DataProcessing"),
          "system.value": -1,
          "system.customEffects": {
            "0": {
              "category": "matrixAttributes",
              "target": "system.matrix.attributes.dataProcessing",
              "type": "value",
              "value": -1,
              "forceAdd": true,
            }
          },
        })
        target.createEmbeddedDocuments("Item", [effect])
        break
      case "iceCatapult":
        effect = foundry.utils.mergeObject(effect, {
          name: game.i18n.localize("SR5.EffectReduceFirewall"),
          "system.target": game.i18n.localize("SR5.Firewall"),
          "system.value": -1,
          "system.customEffects": {
            "0": {
              "category": "matrixAttributes",
              "target": "system.matrix.attributes.firewall",
              "type": "value",
              "value": -1,
              "forceAdd": true,
            }
          },
        })
        target.createEmbeddedDocuments("Item", [effect])
        break
      case "iceCrash": {
        let programs = []
        for (let i of target.items){
          if (i.type === "itemProgram" && (i.system.type === "hacking" || i.system.type === "common") && i.system.isActive){
            programs.push(i)
          }
        }
        let randomProgram = programs[Math.floor(Math.random()*programs.length)]
        randomProgram.update({
          "system.isActive": false
        })
        ui.notifications.info(`${randomProgram.name} ${game.i18n.localize("SR5.INFO_CrashProgram")}`)
        break
      }
      case "iceJammer":
        effect = foundry.utils.mergeObject(effect, {
          name: game.i18n.localize("SR5.EffectReduceAttack"),
          "system.target": game.i18n.localize("SR5.MatrixAttack"),
          "system.value": -1,
          "system.customEffects": {
            "0": {
              "category": "matrixAttributes",
              "target": "system.matrix.attributes.attack",
              "type": "value",
              "value": -1,
              "forceAdd": true,
            }
          },
        })
        target.createEmbeddedDocuments("Item", [effect])
        break
      case "iceMarker":
        effect = foundry.utils.mergeObject(effect, {
          name: game.i18n.localize("SR5.EffectReduceSleaze"),
          "system.target": game.i18n.localize("SR5.Sleaze"),
          "system.value": -1,
          "system.customEffects": {
            "0": {
              "category": "matrixAttributes",
              "target": "system.matrix.attributes.sleaze",
              "type": "value",
              "value": -1,
              "forceAdd": true,
            }
          },
        })
        target.createEmbeddedDocuments("Item", [effect])
        break
      //The forced reboot deals the dumpshock in VR (rebootDeck, SR5 p. 244)
      case "iceScramble": {
        let deck = target.items.find((item) => item.type === "itemDevice" && item.system.isActive)
        target.rebootDeck(deck)
        break
      }
      case "iceBlaster":
      case "iceBlack":
      case "iceTarBaby":
      case "iceBlueGoo":
        await SR5_MatrixHelpers.applylinkLockEffect(ice, target)
        break
      case "iceShocker":
      case "iceSparky":
      case "iceKiller":
      case "iceTrack":
      case "icePatrol":
      case "iceProbe":
      case "iceBloodhound":
        break
      case "iceFlicker": {
                
        let item = await fromUuid(cardData.target.itemUuid)
        //The device may have been deleted since the attack: warn, no Flicker effect
        if (!item?.system) return ui.notifications.warn(game.i18n.localize("SR5.WARN_TargetItemMissing"))
        let existingMark = await SR5_MarkHelpers.findMarkValue(item.system, ice.id)
        if (!target.system.matrix.isLinkLocked) 
          await SR5_MatrixHelpers.applylinkLockEffect(ice, target)
        //The forced reboot deals the dumpshock in VR (rebootDeck, SR5 p. 244)
        if (existingMark >= 2) {
          let deck_iceFlicker = target.items.find((item) => item.type === "itemDevice" && item.system.isActive)
          target.rebootDeck(deck_iceFlicker)
        }
        break
      }
      default:
        SR5_SystemHelpers.srLog(1, `Unknown '${cardData.test.typeSub}' type in applyIceEffect`)
    }
  }

}