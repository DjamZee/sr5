import {
  SR5_EntityHelpers 
} from "../../entities/helpers.js"
import {
  SR5_SocketHandler 
} from "../../socket.js"
import {
  SR5_ActorHelper 
} from "../../entities/actors/entityActor-helpers.js"
import {
  SR5_MiscellaneousHelpers
} from "./miscellaneous.js"
import {
  SR5_SystemHelpers
} from "../../system/utilitySystem.js"
import {
  ownsTarget, recountHits, consumedKey
} from "./socket-guard.js"
import {
  MARK_DEFENSE_TESTS, attackerMarks, markPenalty, markOutcome, eraseWins
} from "./socket-senders.js"

//The same fighter, whether the card names its token or its actor (a token's actor shares the actor's id)
const sameActor = (a, b) => !!a && !!b && (a === b || a.id === b.id)
const hitsWritten = card => Math.max(0, Number(card.data.roll?.hits) || 0)
const refuse = (kind, senderId, data) => {
  SR5_SystemHelpers.srLog(1, `Socket ${kind} refused from ${game.users.get(senderId)?.name ?? senderId}`, data)
  return false
}

/** Kill Code p. 45: Initiative cost of the actions a Watchdog mark can turn into an Interruption action.
 * It lives here rather than in config.js, which holds translation tables only.
 */
export const WATCHDOG_INTERRUPTION_COST = {
  haywire: 10,
  popupHacking: 10,
  popupCybercombat: 10,
  squelch: 5,
}

export class SR5_MarkHelpers {

  /** Put a mark on a specific Item
   * @param {Object} targetActor - The Actor who owns the item
   * @param {Object} attackerID - Actor ID who wants to put a mark
   * @param {Object} mark - Number of Marks to put
   * @param {Object} targetItem - Target item
   * @param {Boolean} isWatchdog - Kill Code p. 45: the mark comes from a Watchdog action
   */
  static async markItem(targetActorID, attackerID, mark, targetItem, isWatchdog = false, messageId = null) {
    let attacker = await SR5_EntityHelpers.getRealActorFromID(attackerID),
      targetActor = await SR5_EntityHelpers.getRealActorFromID(targetActorID),
      realAttackerID = attackerID,
      existingMark = false,
      item

    if (targetItem) item = await fromUuid(targetItem)
    else item = targetActor.items.find(i => i.type === "itemDevice" && i.system.isActive)
    //An AI outside any device is marked on its persona, which no device carries (Data Trails p. 157)
    if (!item) {
      if (targetActor.system.activeSpecialAttribute === "depth") await SR5_MarkHelpers.markPersona(targetActor, attacker, attackerID, mark, isWatchdog)
      return
    }
    if (item.parent.type === "actorDevice" && item.parent.isToken) item = targetActor.items.find(i => i.type === "itemDevice" && i.system.isActive)

    let itemToMark = foundry.utils.duplicate(item.system)

    //If attacker is an ice use serveur id to mark
    if(attacker.system.matrix.deviceType === "ice" && attacker.isToken){
      realAttackerID = attacker.id
    }
    // If item is already marked, increase marks
    for (let m of itemToMark.marks){
      if (m.ownerId === realAttackerID) {
        m.value += mark
        if (m.value > 3) m.value = 3
        if (isWatchdog) m.watchdog = true
        existingMark = true
      }
    }
    // Add new mark to item
    if (!existingMark){
      let newMark = {
        "ownerId": realAttackerID,
        "value": mark,
        "ownerName": attacker.name,
        "watchdog": isWatchdog,
      }
      itemToMark.marks.push(newMark)
    }
    await item.update({
      "system": itemToMark
    })

    //Update attacker deck with info
    if (!game.user?.isGM) {
      await SR5_SocketHandler.emitForGM("updateDeckMarkedItems", {
        ownerID: realAttackerID,
        markedItem: item.uuid,
        mark: mark,
      })
      if (itemToMark.isSlavedToPan){
        //The GM reads the slaved item and the card again: the item's system is no longer sent
        await SR5_SocketHandler.emitForGM("markPanMaster", {
          itemUuid: item.uuid,
          attackerID: realAttackerID,
          mark: mark,
          messageId,
        })
      }
      if (targetActor.system.matrix.deviceType === "host"){
        await SR5_SocketHandler.emitForGM("markSlavedDevice", {
          targetActorID: targetActorID
        })
      }
    } else {  
      await SR5_MarkHelpers.updateDeckMarkedItems(realAttackerID, item.uuid, mark)
      if (itemToMark.isSlavedToPan) await SR5_MarkHelpers.markPanMaster(itemToMark, realAttackerID, mark)
      if (targetActor.system.matrix.deviceType === "host") await SR5_MarkHelpers.markSlavedDevice(targetActorID)
    }
  }

  /** Put a mark on the persona of an AI outside any device (Data Trails p. 157), kept in its own matrix data
   * @param {Object} targetActor - The AI
   * @param {Object} attacker - Actor who puts the mark
   * @param {String} attackerID - ID of that actor
   * @param {Number} mark - Number of Marks to put
   * @param {Boolean} isWatchdog - Kill Code p. 45: the mark comes from a Watchdog action
   */
  static async markPersona(targetActor, attacker, attackerID, mark, isWatchdog = false) {
    let realAttackerID = (attacker.system.matrix.deviceType === "ice" && attacker.isToken) ? attacker.id : attackerID,
      marks = foundry.utils.duplicate(targetActor.system.matrix.marks || []),
      existing = marks.find(m => m.ownerId === realAttackerID)

    if (existing) {
      existing.value = Math.min(existing.value + mark, 3)
      if (isWatchdog) existing.watchdog = true
    } else marks.push({
      "ownerId": realAttackerID,
      "value": mark,
      "ownerName": attacker.name,
      "watchdog": isWatchdog,
    })
    await targetActor.update({
      "system.matrix.marks": marks
    })

    //Update attacker deck with info
    if (!game.user?.isGM) await SR5_SocketHandler.emitForGM("updateDeckMarkedItems", {
      ownerID: realAttackerID,
      markedItem: targetActor.uuid,
      mark: mark,
    })
    else await SR5_MarkHelpers.updateDeckMarkedItems(realAttackerID, targetActor.uuid, mark)
  }

  /** Erase the marks placed on the persona of an AI, and their trace on the decks of those who placed them:
   * the AI reboots (SR5 p. 244)
   * @param {Object} actor - The AI
   */
  static async clearPersonaMarks(actor) {
    let marks = actor._source?.system?.matrix?.marks ?? []
    if (!marks.length) return
    for (let m of marks) {
      if (!game.user?.isGM) await SR5_SocketHandler.emitForGM("deleteMarkInfo", {
        actorId: m.ownerId,
        item: actor.uuid,
        exact: true,
      })
      else await SR5_ActorHelper.deleteMarkInfo(m.ownerId, actor.uuid, true)
    }
    await actor.update({
      "system.matrix.marks": []
    }, {
      sr5PersonaMarks: true
    })
  }

  /* -------------------------------------------- */
  /*  The mark sockets, on the GM's browser         */
  /* -------------------------------------------- */
  // Security lot (Thomas, before the djamz.11): a GM, or the owner of the icon marked, writes as
  // before. Anyone else only puts the marks the cards allow: the defense card the button stood on and
  // the attack card it answers, read again from the chat log, their hits counted again on their dice
  // within the pools of the sheets (SR5 p. 240, 242: one to three marks chosen before the test, -4 or
  // -10 dice; p. 232: a failed Sleaze action gives the defender one mark). A card serves once per
  // target, and a card a player wrote is confirmed by the GM.

  /** The cap of a defense card's dice: the best pool the defender could roll against this action
   * (its own, the device's rating x2, or its PAN master's, as rollData-MatrixDefense.js), plus Chance. */
  static async defenseCap(defense) {
    const key = defense.data.test?.typeSub,
      pools = [Number(foundry.utils.getProperty(defense.roller?.system ?? {
      }, `matrix.actions.${key}.defense.dicePool`)) || 0]
    const item = defense.data.target?.itemUuid ? await fromUuid(defense.data.target.itemUuid) : null
    if (item?.system) {
      pools.push((Number(item.system.deviceRating) || 0) * 2)
      const master = item.system.isSlavedToPan ? SR5_EntityHelpers.getRealActorFromID(item.system.panMaster) : null
      pools.push(Number(foundry.utils.getProperty(master?.system ?? {
      }, `matrix.actions.${key}.defense.dicePool`)) || 0)
    }
    return Math.max(...pools) + (Number(defense.roller?.system?.specialAttributes?.edge?.augmented?.value) || 0)
  }

  /** The defense card behind a mark request, the attack card it answers, and what they allow: null
   * unless both are trusted (cardOf) and the attack card was rolled by the attacker the defense names. */
  static async markCards(messageId) {
    const defense = SR5_MiscellaneousHelpers.cardOf(messageId)
    if (!defense || !MARK_DEFENSE_TESTS.includes(defense.data.test?.type)) return null
    const attack = SR5_MiscellaneousHelpers.cardOf(defense.data.previousMessage?.messageId)
    if (!attack || !sameActor(attack.roller, SR5_EntityHelpers.getRealActorFromID(defense.data.previousMessage?.actorId))) return null
    const typeSub = defense.data.test.typeSub,
      chosen = attack.data.matrix?.mark,
      marks = attackerMarks(typeSub, chosen)
    //The attacker's dice within its pool for this action, less the dice the marks cost
    const attackerHits = attack.byGM ? hitsWritten(attack) :
      recountHits(attack.data.roll?.r, SR5_MiscellaneousHelpers.poolCap(attack.roller, `matrix.actions.${typeSub}.test.dicePool`) + markPenalty(marks))
    const defenderHits = defense.byGM ? hitsWritten(defense) : recountHits(defense.data.roll?.r, await SR5_MarkHelpers.defenseCap(defense))
    //Sleaze or Attack is read on the attacker's sheet, not on a card
    const actionType = attack.roller?.system?.matrix?.actions?.[typeSub]?.actionType
    const outcome = markOutcome({
      typeSub, actionType, attackerHits, defenderHits, chosen
    })
    if (!outcome) return null
    return {
      defense, attack, outcome, attacker: attack.roller, defender: defense.roller,
      card: {
        id: defense.id, byGM: defense.byGM && attack.byGM
      },
    }
  }

  /** A markItem request the cards allow: the defender's mark on the attacker who failed a Sleaze
   * action, or the attacker's marks on the master of a slaved drone it marked. null if refused. */
  static async markUse(data, target) {
    const pair = await SR5_MarkHelpers.markCards(data.messageId)
    if (!pair) return null
    const {
      outcome, attacker, defender
    } = pair
    const marker = SR5_EntityHelpers.getRealActorFromID(data.attackerID)
    let allowed
    if (outcome.winner === "defender") allowed = sameActor(target, attacker) && sameActor(marker, defender)
    else allowed = defender?.type === "actorDrone" && !!defender.system?.slaved && sameActor(marker, attacker) &&
      sameActor(target, SR5_EntityHelpers.getRealActorFromID(defender.system.vehicleOwner?.id))
    if (!allowed) return null
    return {
      card: pair.card, key: consumedKey(pair.card.id, "markItem", target.uuid),
      label: "markItem", target: target.name, value: outcome.marks, watchdog: outcome.watchdog,
    }
  }

  //Socket for adding marks to main Device
  static async _socketMarkItem(message, senderId) {
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      },
      target = SR5_EntityHelpers.getRealActorFromID(data.targetActor)
    if (!sender || !target) return false
    if (ownsTarget(sender, target)) return SR5_MarkHelpers.markItem(data.targetActor, data.attackerID, data.mark, undefined, data.isWatchdog)
    const use = await SR5_MarkHelpers.markUse(data, target)
    if (!use || !(await SR5_MiscellaneousHelpers.grant(use, sender))) return refuse("markItem", senderId, data)
    await SR5_MarkHelpers.markItem(data.targetActor, data.attackerID, use.value, undefined, use.watchdog)
    return true
  }

  //Add mark to pan Master of the item
  static async markPanMaster(itemToMark, attackerID, mark){
    let panMaster = SR5_EntityHelpers.getRealActorFromID(itemToMark.panMaster)
    let masterDevice = panMaster.items.find(d => d.type === "itemDevice" && d.system.isActive)
    await SR5_MarkHelpers.markItem(itemToMark.panMaster, attackerID, mark, masterDevice.uuid)
  }

  //Socket for adding marks to pan Master of the item. The slaved item is read again by the GM, never
  //sent: its master must list it in its PAN (a player can write the panMaster of her own item), and
  //the marks are those of the card that marked it (SR5 p. 234), unless the sender owns the master
  static async _socketMarkPanMaster(message, senderId) {
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      },
      item = await fromUuid(data.itemUuid ?? "")
    if (!sender || !item?.system?.isSlavedToPan) return refuse("markPanMaster", senderId, data)
    const master = SR5_EntityHelpers.getRealActorFromID(item.system.panMaster),
      masterDevice = master?.items.find(d => d.type === "itemDevice" && d.system.isActive)
    if (!masterDevice?.system?.pan?.content?.some(p => p.uuid === item.uuid)) return refuse("markPanMaster", senderId, data)
    if (ownsTarget(sender, master)) return SR5_MarkHelpers.markPanMaster(item.system, data.attackerID, data.mark)
    const pair = await SR5_MarkHelpers.markCards(data.messageId)
    if (!pair || pair.outcome.winner !== "attacker" || pair.defense.data.target?.itemUuid !== item.uuid ||
      !sameActor(SR5_EntityHelpers.getRealActorFromID(data.attackerID), pair.attacker)) return refuse("markPanMaster", senderId, data)
    const use = {
      card: pair.card, key: consumedKey(pair.card.id, "markPanMaster", master.uuid),
      label: "markItem", target: master.name, value: pair.outcome.marks,
    }
    if (!(await SR5_MiscellaneousHelpers.grant(use, sender))) return refuse("markPanMaster", senderId, data)
    await SR5_MarkHelpers.markPanMaster(item.system, data.attackerID, use.value)
    return true
  }

  //Mark slaved device: for host, update all unlinked token with same marks
  static async markSlavedDevice(targetActorID){
    let targetActor = await SR5_EntityHelpers.getRealActorFromID(targetActorID),
      item = targetActor.items.find(i => i.type === "itemDevice" && i.system.isActive)

    for (let token of canvas.tokens.placeables){
      if (token.actor.id === targetActorID) {
        let tokenDeck = token.actor.items.find(i => i.type === "itemDevice" && i.system.isActive)
        let tokenDeckData = foundry.utils.duplicate(tokenDeck.system)
        tokenDeckData.marks = item.system.marks
        await tokenDeck.update({
          "system": tokenDeckData
        })
      }
    }
  }

  //Socket for marking slaved device: only from a GM or the owner of the host, the one who could mark
  //its device in the first place
  static async _socketMarkSlavedDevice(message, senderId) {
    const sender = game.users.get(senderId),
      host = SR5_EntityHelpers.getRealActorFromID(message?.data?.targetActorID)
    if (!sender || !host || host.system?.matrix?.deviceType !== "host" || !ownsTarget(sender, host)) return refuse("markSlavedDevice", senderId, message?.data)
    await SR5_MarkHelpers.markSlavedDevice(message.data.targetActorID)
    return true
  }

  //Add mark info to attacker deck. exact, when given, is the value the record takes (what the marked
  //icon carries), instead of adding mark to it
  static async updateDeckMarkedItems(ownerID, markedItem, mark, exact = null){
    let owner = SR5_EntityHelpers.getRealActorFromID(ownerID),
      ownerDeck = owner.items.find(i => i.type === "itemDevice" && i.system.isActive),
      deckData = foundry.utils.duplicate(ownerDeck.system),
      itemMarked = await fromUuid(markedItem),
      alreadyMarked = false

    //If item is already marked, update value
    for (let m of deckData.markedItems){
      if (m.uuid === itemMarked.uuid) {
        m.value = exact ?? (m.value + mark)
        if (m.value > 3) m.value = 3
        alreadyMarked = true
      }
    }
    if (!alreadyMarked){
      let newMark = {
        "uuid": itemMarked.uuid,
        "value": Math.min(exact ?? mark, 3),
        "itemName": itemMarked.name,
        //A persona marked directly is its own owner
        'itemOwner': itemMarked.actor?.name ?? itemMarked.name,
      }
      deckData.markedItems.push(newMark)
    }
    await ownerDeck.update({
      "system": deckData
    })

    //For host, update all unlinked token with same marked items
    if (owner.system.matrix.deviceType === "host"){
      for (let token of canvas.tokens.placeables){
        if (token.actor.id === ownerID) {
          let tokenDeck = token.actor.items.find(i => i.type === "itemDevice" && i.system.isActive)
          let tokenDeckData = foundry.utils.duplicate(tokenDeck.system)
          tokenDeckData.markedItems = deckData.markedItems
          await tokenDeck.update({
            "system": tokenDeckData
          })
        }
      }
    }
  }

  //Socket for updating marks items on other actors;
  //Sent by the owner of the icon just marked, for the marker's deck she does not own: the record takes
  //the marks the icon really carries from that marker, never the number sent
  static async _socketUpdateDeckMarkedItems(message, senderId) {
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      },
      marked = await fromUuid(data.markedItem ?? "")
    if (!sender || !marked || !SR5_EntityHelpers.getRealActorFromID(data.ownerID)) return refuse("updateDeckMarkedItems", senderId, data)
    if (sender.isGM) return SR5_MarkHelpers.updateDeckMarkedItems(data.ownerID, data.markedItem, data.mark)
    const isItem = marked.documentName === "Item"
    if (!ownsTarget(sender, marked)) return refuse("updateDeckMarkedItems", senderId, data)
    const carried = (isItem ? marked.system?.marks : marked.system?.matrix?.marks)?.find(m => m.ownerId === data.ownerID)?.value ?? 0
    if (!(carried > 0)) return refuse("updateDeckMarkedItems", senderId, data)
    await SR5_MarkHelpers.updateDeckMarkedItems(data.ownerID, data.markedItem, 0, carried)
    return true
  }

  /** Find if an Actor has a Mark item with the same ID as the attacker
     * @param {Object} targetActor - The Target Actor who owns the Mark
     * @param {Object} attackerID - The ID of the attacker who wants to mark
     * @return {Object} the mark item
     */
  static async findMarkValue(item, ownerID){
    if (item.marks.length) {
      for (let m of item.marks){
        if (m.ownerId === ownerID) return m.value
      }
      return 0
    } else return 0
  }

  /** Kill Code p. 45: tell whether an owner holds a Watchdog mark on one of the actor's items
     * @param {Object} targetActor - The Actor who may carry the mark
     * @param {String} ownerID - The ID of the hacker who placed it
     * @return {Boolean} true if a Watchdog mark is present
     */
  static hasWatchdogMark(targetActor, ownerID){
    if (!targetActor) return false
    for (let item of targetActor.items){
      if (item.system.marks?.find(m => m.ownerId === ownerID && m.watchdog && m.value > 0)) return true
    }
    return false
  }

  static async eraseMarkChoice(cardData){
    let actor, newData = cardData

    //Determine actor who is marked
    if (cardData.target.actorId) actor = SR5_EntityHelpers.getRealActorFromID(cardData.target.actorId, cardData.actorUuids)
    else actor = SR5_EntityHelpers.getRealActorFromID(cardData.owner.actorId, cardData.actorUuids)

    //Build marked items list
    let markedItems = actor.items.filter(i => i.system.marks?.length > 0)
    let dialogData = {
      list: markedItems
    }

    //Check if at least one item has a mark
    if (!markedItems.length) return ui.notifications.info(`${actor.name}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize('SR5.INFO_NoMarksToDelete')}`)

    //Render dialog to choose marked item
    const dlg = await foundry.applications.handlebars.renderTemplate("systems/sr5/templates/interface/chooseMark.hbs", dialogData)
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('SR5.ChooseMarkToErase') 
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
    let targetItem = result.element.querySelector("[name=item]").value,
      item = markedItems.find(i => i.id === targetItem),
      markOwner = SR5_EntityHelpers.getRealActorFromID(item.system.marks[0].ownerId)//Determine actor who marked

    //Add info for building roll
    newData.previousMessage.actorId = actor.id
    newData.previousMessage.itemUuid = item.uuid

    //Roll matrix defense test
    markOwner.rollTest("matrixDefense", "eraseMark", newData)
  }

  static async eraseMark(cardData){
    let item = await fromUuid(cardData.previousMessage.itemUuid),
      itemData = foundry.utils.duplicate(item.system)

    //Iterate through marked item and remove the one from the same source
    for (let i = 0; i < itemData.marks.length; i++){
      if (itemData.marks[i].ownerId === cardData.owner.actorId) {
        itemData.marks[i].value -= 1
        if (itemData.marks[i].value <= 0){
          itemData.marks.splice(i, 1)
          i--
        }
      }
    }
    await item.update({
      "system": itemData
    })
    //Delete mark from owner deck
    await SR5_ActorHelper.deleteMarkInfo(cardData.owner.actorId, cardData.previousMessage.itemUuid)
  }

  /** The Erase Mark the cards allow (SR5 p. 240): the defense card the button stood on (rolled by the
   * marker), and the eraser's action card it answers, its hits counted again within its pool. null if
   * refused. The card's data, as the chat log keeps it, is what is erased: never the request's. */
  static async eraseUse(messageId) {
    const defense = SR5_MiscellaneousHelpers.cardOf(messageId)
    if (!defense || defense.data.test?.type !== "eraseMark") return null
    const action = SR5_MiscellaneousHelpers.cardOf(defense.data.previousMessage?.messageId)
    if (!action || action.data.test?.type !== "matrixAction" || action.data.test?.typeSub !== "eraseMark") return null
    const eraserHits = action.byGM ? hitsWritten(action) :
      recountHits(action.data.roll?.r, SR5_MiscellaneousHelpers.poolCap(action.roller, "matrix.actions.eraseMark.test.dicePool"))
    const defenderHits = defense.byGM ? hitsWritten(defense) : recountHits(defense.data.roll?.r, Infinity)
    if (!eraseWins(eraserHits, defenderHits)) return null
    //The item erased belongs to the actor the card names, and carries a mark of the defender
    const item = await fromUuid(defense.data.previousMessage?.itemUuid ?? "")
    if (!item || !sameActor(item.parent, SR5_EntityHelpers.getRealActorFromID(defense.data.previousMessage?.actorId))) return null
    if (!item.system?.marks?.some(m => m.ownerId === defense.data.owner?.actorId && m.value > 0)) return null
    return {
      card: {
        id: defense.id, byGM: defense.byGM && action.byGM
      },
      key: consumedKey(defense.id, "eraseMark", item.uuid), label: "eraseMark", target: item.name, value: eraserHits,
      cardData: defense.data,
    }
  }

  static async _socketEraseMark(message, senderId){
    const sender = game.users.get(senderId),
      data = message?.data ?? {
      }
    if (!sender) return false
    const use = await SR5_MarkHelpers.eraseUse(data.messageId)
    if (!use || !(await SR5_MiscellaneousHelpers.grant(use, sender))) return refuse("eraseMark", senderId, data)
    await SR5_MarkHelpers.eraseMark(use.cardData)
    return true
  }
}