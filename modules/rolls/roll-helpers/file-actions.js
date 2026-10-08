// The Matrix actions on a file, in Foundry (objet Fichier): the buttons of the cards, the request to the active
// gamemaster, who reads the cards again, rolls the file's own dice, writes the file and posts the result. The rules are
// in system/matrix-files.js.
//
// Who writes: the active gamemaster, as for Matrix Perception (pan-perception-card.js): the attacker's client asks, the
// gamemaster's reads the card again from the chat log (cardOf), counts its hits again, spends it once (consume), and
// writes. A file may be carried by an actor its attacker does not own (a host's), and a bomb hurts the attacker.
// Nothing here is hardened further against the console (decision of 06/10).

import {
  FILE_ROLLED_ACTIONS, bombDamage, bombOf, fileOppositionDice, isFile, knowsPassword, resolveFileAction
} from "../../system/matrix-files.js"

export const FILE_BUTTONS = ["fileResolve", "fileEdit", "fileProtect", "fileApply"]
// The reasons the attacker is told of, when the gamemaster refuses her request
export const FILE_REFUSALS = ["card", "owner", "target", "spent", "action"]

const ROLLED = {
  rolled: true
}

// Every id an actor answers to: a mark, a bomb or an edit may carry either
function idsOf(actor){
  return [actor?.id, actor?.isToken ? actor.token?.id : undefined].filter(Boolean)
}

function realIdOf(actor){
  return actor?.isToken ? actor.token?.id : actor?.id
}

/** The file a card aims at (the target chosen on the crown, or by uuid with rollMatrixActionOn), or null */
export function matrixFileTarget(cardData){
  const uuid = cardData?.target?.itemUuid
  if (!uuid) return null
  const item = globalThis.fromUuidSync?.(uuid) ?? null
  return isFile(item) ? item : null
}

/** Does an actor own a file (SR5 p. 238: its owner, here the actor that carries it)? */
export function ownsFile(actor, file){
  const holder = file?.parent
  return !!actor && !!holder && idsOf(actor).some(id => idsOf(holder).includes(id))
}

/** The words of a file's last edit (Matrix Perception, SR5 p. 237) */
export function fileLastEditText(lastEdit){
  if (typeof lastEdit?.worldTime !== "number") return game.i18n.localize("SR5.FileNeverEdited")
  const seconds = Math.max(0, Math.round((game.time?.worldTime ?? 0) - lastEdit.worldTime))
  const when = seconds < 60 ? game.i18n.format("SR5.MatrixPerceptionWhenSeconds", {
    seconds
  }) : seconds < 86400 ? game.i18n.format("SR5.MatrixPerceptionWhenMinutes", {
    minutes: Math.round(seconds / 60)
  }) : game.i18n.format("SR5.FileWhenDays", {
    days: Math.round(seconds / 86400)
  })
  return lastEdit.byName ? game.i18n.format("SR5.FileLastEditBy", {
    when, name: lastEdit.byName
  }) : when
}

/* -------------------------------------------- */
/*  The buttons of the cards                     */
/* -------------------------------------------- */

/**
 * The buttons of a Matrix action card aimed at a file (test-MatrixAction.js). Crack File, Set Data Bomb and Disarm
 * Data Bomb are opposed by the file's own dice, which the gamemaster rolls; the owner of a file edits or protects it
 * with no defense. Any other action keeps the system's defense (Edit File: the host or the owner, SR5 p. 240).
 * @return {Boolean} true when the card's buttons are set here
 */
export async function fileActionButtons(cardData, actor){
  const file = matrixFileTarget(cardData)
  if (!file) return false
  const {
    SR5_RollMessage
  } = await import("../roll-message.js")
  const key = cardData.test.typeSub
  if (FILE_ROLLED_ACTIONS.includes(key)) {
    cardData.chatCard.buttons.fileResolve = SR5_RollMessage.generateChatButton("nonOpposedTest", "fileResolve", game.i18n.format("SR5.FileResolve", {
      file: file.name
    }))
    return true
  }
  if (key === "editFile" && ownsFile(actor, file)) {
    cardData.chatCard.buttons.fileEdit = SR5_RollMessage.generateChatButton("nonOpposedTest", "fileEdit", game.i18n.localize("SR5.FileEditOwn"))
    cardData.chatCard.buttons.fileProtect = SR5_RollMessage.generateChatButton("nonOpposedTest", "fileProtect", game.i18n.format("SR5.FileProtectOwn", {
      rating: cardData.roll.hits
    }))
    return true
  }
  return false
}

/** The button of a defense card against Edit File on a file (test-MatrixDefense.js): the attacker's, as Snoop's */
export async function fileDefenseButton(cardData){
  if (cardData.test.typeSub !== "editFile") return false
  const file = matrixFileTarget(cardData)
  if (!file) return false
  const {
    SR5_RollMessage
  } = await import("../roll-message.js")
  cardData.chatCard.buttons.fileApply = SR5_RollMessage.generateChatButton("attackerTest", "fileApply", game.i18n.format("SR5.FileApply", {
    file: file.name
  }))
  return true
}

/* -------------------------------------------- */
/*  The attacker's request                       */
/* -------------------------------------------- */

// Set Data Bomb: the rating, at most the net hits (SR5 p. 243), and whether it erases the file
async function askBomb(hits){
  const esc = foundry.utils.escapeHTML
  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("SR5.MatrixActionSetDataBomb")
    },
    content: `<p>${esc(game.i18n.localize("SR5.FileBombAskHint"))}</p>
      <label>${esc(game.i18n.localize("SR5.FileDataBombRating"))} <input type="number" name="rating" min="1" value="${Math.max(1, Number(hits) || 1)}"></label>
      <label><input type="checkbox" name="destroysFile"> ${esc(game.i18n.localize("SR5.FileDataBombDestroys"))}</label>`,
    buttons: [{
      action: "ok", label: game.i18n.localize("SR5.MatrixActionSetDataBomb"), default: true,
      callback: (event, button) => ({
        rating: Math.max(1, Math.floor(Number(button.form.elements.rating.value) || 1)),
        destroysFile: button.form.elements.destroysFile.checked,
      }),
    }, {
      action: "cancel", label: game.i18n.localize("SR5.Cancel")
    }],
    rejectClose: false,
  })
  return result && typeof result === "object" ? result : null
}

/**
 * A click on a file button of a card: the request goes to the active gamemaster.
 * @param {Object} messageData   the card's data
 * @param {String} messageId
 * @param {String} button        a key of FILE_BUTTONS
 */
export async function requestFileAction(messageData, messageId, button){
  if (!FILE_BUTTONS.includes(button)) return false
  const request = {
    messageId, button
  }
  if (button === "fileResolve" && messageData?.test?.typeSub === "setDataBomb") {
    const file = matrixFileTarget(messageData)
    // Nothing to choose when a bomb is there already: the try sets it off, or fails
    if (!bombOf(file)) {
      request.bomb = await askBomb(messageData.roll?.hits)
      if (!request.bomb) return false
    }
  }
  if (game.user.isGM) return resolveFileRequest(request, game.user)
  const {
    SR5_SocketHandler
  } = await import("../../socket.js")
  return SR5_SocketHandler.emitForGM("matrixFileAction", request)
}

/* -------------------------------------------- */
/*  The gamemaster's resolution                  */
/* -------------------------------------------- */

/**
 * The cards behind a request, read again: null when refused, with the reason.
 * @return {{card, attackCard, attacker, typeSub, mode, defenseHits}|{refused: String}}
 */
async function requestCards(request){
  const {
    SR5_MiscellaneousHelpers
  } = await import("./miscellaneous.js")
  const {
    SR5_EntityHelpers
  } = await import("../../entities/helpers.js")
  const card = SR5_MiscellaneousHelpers.cardOf(request?.messageId)
  const data = card?.data
  if (!data) return {
    refused: "card"
  }
  const typeSub = data.test?.typeSub
  if (request.button === "fileApply") {
    // The defense card of Edit File, and the attacker's card it answers, rolled by the attacker it names
    if (data.test?.type !== "matrixDefense" || typeSub !== "editFile") return {
      refused: "action"
    }
    const attackCard = SR5_MiscellaneousHelpers.cardOf(data.previousMessage?.messageId)
    const attacker = data.previousMessage?.actorId ? SR5_EntityHelpers.getRealActorFromID(data.previousMessage.actorId, data.actorUuids) : null
    if (!attackCard || !attacker || attackCard.roller?.uuid !== attacker.uuid) return {
      refused: "card"
    }
    const {
      SR5_MarkHelpers
    } = await import("./mark.js")
    const {
      recountHits, chanceSpent
    } = await import("./socket-guard.js")
    const defenseHits = card.byGM ? Math.max(0, Number(data.roll?.hits) || 0) : recountHits(data.roll?.r, await SR5_MarkHelpers.defenseCap(card), {
      secondChance: chanceSpent(data, card.roller)
    })
    if (defenseHits === null) return {
      refused: "card"
    }
    return {
      card, attackCard, attacker, typeSub, mode: "edit", defenseHits
    }
  }
  if (data.test?.type !== "matrixAction") return {
    refused: "action"
  }
  if (request.button === "fileResolve" && !FILE_ROLLED_ACTIONS.includes(typeSub)) return {
    refused: "action"
  }
  if ((request.button === "fileEdit" || request.button === "fileProtect") && typeSub !== "editFile") return {
    refused: "action"
  }
  return {
    card, attackCard: card, attacker: card.roller, typeSub, mode: request.button === "fileProtect" ? "protect" : "edit", defenseHits: 0
  }
}

/**
 * Resolve a request, on the active gamemaster's client.
 * @param {{messageId: String, button: String, bomb?: Object}} request
 * @param {User} sender
 */
export async function resolveFileRequest(request, sender){
  const refuse = async reason => {
    const {
      SR5_SystemHelpers
    } = await import("../../system/utilitySystem.js")
    SR5_SystemHelpers.srLog(1, `Matrix file action refused from ${sender?.name}: ${reason}`, request)
    await tellFileRefusal(sender, reason)
    return false
  }
  if (!FILE_BUTTONS.includes(request?.button)) return refuse("action")
  const found = await requestCards(request)
  if (found.refused) return refuse(found.refused)
  const {
    card, attackCard, attacker, typeSub, mode, defenseHits
  } = found
  if (!attacker) return refuse("card")
  if (!sender?.isGM && !attacker.testUserPermission(sender, "OWNER")) return refuse("owner")
  const file = attackCard.data.target?.itemUuid ? await fromUuid(attackCard.data.target.itemUuid) : null
  if (!isFile(file)) return refuse("target")
  // The owner's own edit: only the actor that carries the file
  if ((request.button === "fileEdit" || request.button === "fileProtect") && !ownsFile(attacker, file)) return refuse("owner")

  const {
    SR5_MiscellaneousHelpers
  } = await import("./miscellaneous.js")
  const {
    consumedKey
  } = await import("./socket-guard.js")
  const hits = SR5_MiscellaneousHelpers.pushAwareHits(attackCard, `matrix.actions.${typeSub}.test.dicePool`, Number(attackCard.data.limit?.value) || 0, ROLLED)
  if (hits === null) return refuse("card")
  // One resolution per card, whichever of its buttons (Edit or Protect)
  const use = request.button === "fileProtect" ? "fileEdit" : request.button
  const key = consumedKey(card.id, use, file.uuid)
  if (!(await SR5_MiscellaneousHelpers.consume(key))) return refuse("spent")

  const holder = file.parent
  const password = knowsPassword(file, idsOf(attacker), idsOf(holder))
  // The file's own dice: the gamemaster rolls them (SR5 p. 240, 242, 243)
  let fileRoll = null, oppositionHits = defenseHits
  const dice = request.button === "fileResolve" && !(typeSub === "setDataBomb" && bombOf(file)) ?
    fileOppositionDice(typeSub, file, holder?.system?.matrix?.deviceRating) : null
  if (dice) {
    const {
      SR5_RollTest
    } = await import("../roll-test.js")
    fileRoll = await SR5_RollTest.rollDice({
      dicePool: dice
    })
    oppositionHits = fileRoll.hits
  }
  const result = resolveFileAction({
    action: typeSub, file, hits, oppositionHits, knowsPassword: password, bomb: request.bomb, mode,
    by: {
      id: realIdOf(attacker), name: attacker.name
    }, now: game.time?.worldTime ?? 0,
  })

  // Crack File is an Attack action, Set Data Bomb a Sleaze one: the file's hits raise the Overwatch Score (SR5 p. 233)
  if (request.button === "fileResolve" && typeSub !== "disarmDataBomb" && oppositionHits > 0) {
    const {
      SR5_ActorHelper
    } = await import("../../entities/actors/entityActor-helpers.js")
    await SR5_ActorHelper.overwatchIncrease(oppositionHits, realIdOf(attacker))
  }

  let damage = 0
  if (result.explosion) {
    const roll = await new Roll(`${result.explosion.rating}d6`).evaluate()
    damage = bombDamage(roll.dice?.[0]?.results?.map(r => r.result) ?? [roll.total])
  }
  const fileName = file.name
  if (result.explosion?.destroysFile) await file.delete()
  else if (result.update) await file.update(result.update)

  await postFileResult({
    attacker, typeSub, fileName, result, fileRoll, dice, damage, holder
  })
  const {
    SR5_RollMessage
  } = await import("../roll-message.js")
  await SR5_RollMessage.updateChatButton(card.id, request.button)
  // Edit and Protect are one choice: the other button goes too
  if (use === "fileEdit") await SR5_RollMessage.updateChatButton(card.id, request.button === "fileEdit" ? "fileProtect" : "fileEdit")
  return true
}

/** The card of the result, the gamemaster's: the file's dice when it rolled, and the bomb's damage to resist */
async function postFileResult({
  attacker, typeSub, fileName, result, fileRoll, dice, damage, holder
}){
  const {
    SR5_PrepareRollTest
  } = await import("../roll-prepare.js")
  const {
    SR5_RollTest
  } = await import("../roll-test.js")
  const {
    SR5_RollMessage
  } = await import("../roll-message.js")
  const {
    SR5
  } = await import("../../config.js")
  const rollData = SR5_PrepareRollTest.getBaseRollData(null, attacker)
  rollData.test.title = `${fileName}${game.i18n.localize("SR5.Colons")} ${game.i18n.localize(SR5.matrixRolledActions[typeSub])}`
  rollData.edge.canUseEdge = false
  if (fileRoll) {
    rollData.test.type = "matrixFile"
    rollData.test.title += ` (${game.i18n.format("SR5.FileOppositionDice", {
      dice
    })})`
    rollData.roll = fileRoll
    rollData.dicePool.value = dice
    rollData.dicePool.base = dice
  } else {
    rollData.test.type = "falseTest"
    rollData.roll = {
      rollMode: game.settings.get("core", "rollMode")
    }
  }
  rollData.matrix.fileOutcome = result.outcome
  rollData.chatCard.buttons.actionEnd = SR5_RollMessage.generateChatButton("SR-CardButtonHit endTest", "", game.i18n.format(`SR5.FileOutcome_${result.outcome}`, {
    file: fileName, net: Math.max(0, result.net), name: attacker.name, holder: holder?.name ?? ""
  }))
  if (result.explosion) {
    // (rating)D6 Matrix damage to the icon that set it off, resisted normally (SR5 p. 243)
    rollData.damage.matrix.value = damage
    rollData.damage.matrix.base = damage
    rollData.chatCard.buttons.matrixResistance = SR5_RollMessage.generateChatButton("nonOpposedTest", "matrixResistance", `${game.i18n.localize("SR5.TakeOnDamageMatrix")} (${damage})`)
  }
  return SR5_RollTest.renderRollCard(rollData)
}

/** The attacker's player is told why, in a few words */
async function tellFileRefusal(sender, reason){
  if (!sender) return
  const text = game.i18n.format("SR5.FileRefusedByGM", {
    reason: game.i18n.localize(`SR5.FileRefused_${reason}`)
  })
  if (sender.id === game.user?.id) return void ui.notifications.warn(text)
  const {
    SR5_SocketHandler
  } = await import("../../socket.js")
  return SR5_SocketHandler.emitForPlayer("matrixFileRefused", {
    reason
  }, sender.id)
}

function activeGM(){
  return game.users?.activeGM?.id === game.user?.id
}

export async function _socketFileAction(message, senderId){
  if (!activeGM()) return false
  return resolveFileRequest(message?.data ?? {
  }, game.users.get(senderId))
}

// Only a gamemaster sends it, and only a reason of the list: no other text reaches a player's screen
export function _socketFileRefused(message, senderId){
  const data = message?.data ?? {
  }
  if (!game.users.get(senderId)?.isGM || !FILE_REFUSALS.includes(data.reason)) return false
  ui.notifications.warn(game.i18n.format("SR5.FileRefusedByGM", {
    reason: game.i18n.localize(`SR5.FileRefused_${data.reason}`)
  }))
}
