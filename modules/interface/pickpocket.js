import {
  pickableItems, randomPick, concealmentOf, transferEnds, pickpocketOutcome, isTransferAllowed,
  PICKPOCKET_MAX_CONCEALMENT
} from "../rolls/roll-helpers/pickpocket-rules.js"
import {
  NOT_LOOTERS
} from "./storage-rules.js"
import {
  SR5_SystemHelpers
} from "../system/utilitySystem.js"
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_RollMessage
} from "../rolls/roll-message.js"

/**
 * Picking a pocket from the token HUD (SR5 p. 135, p. 422).
 *
 * The thief right-clicks the target's token with his own selected, within
 * reach. His roll and the target's Perception are whispered to the GM: the
 * target does not know until he notices. The GM rolls the Perception, picks
 * the object (unless the world lets the thief do it) and moves it: every
 * write happens on the GM's side, read again from the cards, so a player
 * never writes another one's actor.
 */
export class SR5Pickpocket {

  //Whose token it is, as the cards name actors: the token for an unlinked one, the actor otherwise
  static actorIdOf(tokenDocument) {
    return tokenDocument?.actorLink ? tokenDocument.actorId : tokenDocument?.id
  }

  //The token of an actor named by a card, on the scene viewed
  static tokenOf(actorId) {
    const tokens = canvas.scene?.tokens
    return tokens?.get(actorId) ?? tokens?.find(t => t.actorLink && t.actorId === actorId)
  }

  //Within reach: adjacent spaces, diagonal included (SR5 p. 187, Reach 0); a gridless scene counts one grid unit
  static inReach(thiefDocument, targetDocument) {
    if (!thiefDocument || !targetDocument || thiefDocument.parent !== targetDocument.parent) return false
    const inReach = SR5_SystemHelpers.isInMeleeRange(canvas.grid, thiefDocument.getOccupiedGridSpaceOffsets(), targetDocument.getOccupiedGridSpaceOffsets(), 0)
    if (inReach !== null) return inReach
    return SR5_SystemHelpers.getDistanceBetweenTwoPoint(thiefDocument, targetDocument) <= canvas.scene.grid.distance
  }

  //The token the user plays and has selected, other than the target
  static thiefToken(targetDocument) {
    return canvas.tokens?.controlled.map(t => t.document).find(d => d !== targetDocument && d.isOwner && d.actor?.system?.skills?.palming)
  }

  static addHudButton(hud) {
    const target = hud.document
    if (!target?.actor || NOT_LOOTERS.includes(target.actor.type)) return
    const thief = SR5Pickpocket.thiefToken(target)
    if (!thief || !SR5Pickpocket.inReach(thief, target)) return

    const left = hud.element?.querySelector(".col.left")
    if (!left || left.querySelector(".sr-hud-pickpocket")) return
    const button = document.createElement("button")
    button.type = "button"
    button.className = "control-icon sr-hud-pickpocket"
    button.dataset.tooltip = game.i18n.localize("SR5.Pickpocket")
    button.innerHTML = "<i class=\"fas fa-hand-holding\"></i>"
    button.addEventListener("click", event => {
      event.preventDefault()
      event.stopPropagation()
      SR5Pickpocket.start(thief, target)
    })
    left.appendChild(button)
  }

  //The thief's side: what he says he is after, the object itself if the world lets him choose, then his roll
  static async start(thiefDocument, targetDocument, mode = "take") {
    const thief = thiefDocument.actor
    //SR5 p. 135: Palming cannot be used untrained
    if (!(thief.system.skills.palming.rating?.value > 0)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketNeedsPalming"))

    const escape = foundry.utils.escapeHTML
    const thiefChooses = game.settings.get("sr5", "sr5PickpocketThiefChooses")
    let choice = ""
    if (thiefChooses) {
      const giver = transferEnds(mode, thief, targetDocument.actor).from
      const options = pickableItems(giver).map(i => `<option value="${i.id}">${escape(i.name)}</option>`).join("")
      choice = `<div class="form-group"><label>${escape(game.i18n.localize("SR5.PickpocketItem"))}</label><select name="itemId"><option value="">${escape(game.i18n.localize("SR5.PickpocketRandom"))}</option>${options}</select></div>`
    }
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format("SR5.PickpocketTitle", {
          name: targetDocument.name
        })
      },
      content: `<div class="form-group"><label>${escape(game.i18n.localize("SR5.PickpocketAim"))}</label><input type="text" name="aim"/></div>${choice}`,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("SR5.Pickpocket"),
        default: true,
        callback: (event, button) => ({
          aim: button.form.elements.aim.value.trim(),
          itemId: button.form.elements.itemId?.value || null,
        }),
      }],
      rejectClose: false,
    })
    if (!result) return

    let itemId = result.itemId
    if (thiefChooses && !itemId) itemId = randomPick(pickableItems(transferEnds(mode, thief, targetDocument.actor).from), Math.random())?.id ?? null
    await thief.rollTest("pickpocket", null, {
      targetActorId: SR5Pickpocket.actorIdOf(targetDocument),
      mode,
      aim: result.aim,
      itemId,
    })
  }

  //The GM's side, from the thief card: the object and the situation, then the target's Perception
  static async openPerception(messageData) {
    if (!game.user.isGM) return
    const target = SR5_EntityHelpers.getRealActorFromID(messageData.target.actorId)
    const thief = SR5_EntityHelpers.getRealActorFromID(messageData.owner.actorId)
    if (!target || !thief) return ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActor"))
    const mode = messageData.various.pickpocketMode ?? "take"
    const giver = mode === "plant" ? thief : target

    const escape = foundry.utils.escapeHTML
    const chosen = messageData.various.pickpocketItemId
    //Every object the GM can pass over to, the small ones first; one bigger than +2 is marked
    const items = pickableItems(giver, {
      allowLarge: true
    }).sort((a, b) => concealmentOf(a) - concealmentOf(b))
    const options = items.map(i => {
      const large = concealmentOf(i) > PICKPOCKET_MAX_CONCEALMENT ? ` — ${game.i18n.localize("SR5.PickpocketLarge")}` : ""
      return `<option value="${i.id}" ${i.id === chosen ? "selected" : ""}>${escape(i.name)} (${concealmentOf(i)})${large}</option>`
    }).join("")
    const locked = chosen ? "disabled" : ""
    const box = key => `<label class="flexrow"><input type="checkbox" name="${key}"/> ${escape(game.i18n.localize(`SR5.Pickpocket${key.charAt(0).toUpperCase()}${key.slice(1)}`))}</label>`
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format("SR5.PickpocketTitle", {
          name: target.name
        })
      },
      content: `<div class="form-group"><label>${escape(game.i18n.localize("SR5.PickpocketItem"))}</label><select name="itemId" ${locked}><option value="">${escape(game.i18n.localize("SR5.PickpocketRandom"))}</option>${options}</select></div>${box("distracted")}${box("attentive")}${box("diversion")}`,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("SR5.SkillPerception"),
        default: true,
        callback: (event, button) => {
          const f = button.form.elements
          return {
            itemId: chosen || f.itemId.value || null,
            situations: ["distracted", "attentive", "diversion"].filter(k => f[k].checked),
          }
        },
      }],
      rejectClose: false,
    })
    if (!result) return

    //"At random" draws among the small objects only
    const item = result.itemId ? giver.items.get(result.itemId) : randomPick(pickableItems(giver), Math.random())
    if (!item) return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketNothing"))
    const data = foundry.utils.duplicate(messageData)
    data.various.pickpocketItemId = item.id
    data.various.pickpocketItemName = item.name
    data.various.pickpocketConcealment = concealmentOf(item)
    data.various.pickpocketSituations = result.situations
    await target.rollTest("pickpocketPerception", null, data)
  }

  //Users who play an actor, and the GMs: whom a warning about that actor goes to
  static whisperFor(actor) {
    return game.users.filter(u => u.isGM || (actor && actor.testUserPermission(u, "OWNER"))).map(u => u.id)
  }

  //The target learns of it: with the thief's name when caught or noticed, without when he only felt something
  static async alertTarget(targetId, thiefId, named) {
    const target = SR5_EntityHelpers.getRealActorFromID(targetId)
    const thief = SR5_EntityHelpers.getRealActorFromID(thiefId)
    const name = SR5Pickpocket.tokenOf(targetId)?.name ?? target?.name ?? ""
    const thiefName = SR5Pickpocket.tokenOf(thiefId)?.name ?? thief?.name ?? ""
    const text = named ? game.i18n.format("SR5.PickpocketAlertNamed", {
      name, thief: thiefName
    }) : game.i18n.format("SR5.PickpocketAlertFelt", {
      name
    })
    await ChatMessage.create({
      content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
      whisper: SR5Pickpocket.whisperFor(target),
    })
  }

  //The thief was caught (critical glitch) or noticed: the target hears of it, by name
  static async caught(messageData, messageId, type) {
    if (!game.user.isGM) return
    const thiefId = type === "pickpocketCaught" ? messageData.owner.actorId : messageData.previousMessage.actorId
    const targetId = type === "pickpocketCaught" ? messageData.target.actorId : messageData.owner.actorId
    await SR5Pickpocket.alertTarget(targetId, thiefId, true)
    await SR5_RollMessage.updateChatButtonHelper(messageId, type)
  }

  /** The GM moves the object, from the perception card, once everything is read again on his side.
   * @param {Object} messageData - the perception card
   * @param {String} messageId - its id
   */
  static async transfer(messageData, messageId) {
    if (!game.user.isGM) return
    const perceptionMessage = game.messages.get(messageId)
    const thiefMessage = game.messages.get(messageData.previousMessage.messageId)
    const thiefCard = thiefMessage?.flags?.sr5data
    const perceptionCard = perceptionMessage?.flags?.sr5data
    const thiefId = messageData.previousMessage.actorId
    const targetId = messageData.owner.actorId
    const thief = SR5_EntityHelpers.getRealActorFromID(thiefId)
    const target = SR5_EntityHelpers.getRealActorFromID(targetId)
    const mode = perceptionCard?.various?.pickpocketMode ?? "take"
    const ends = transferEnds(mode, thief, target)
    const giver = ends.from, receiver = ends.to
    const item = giver?.items.get(perceptionCard?.various?.pickpocketItemId)

    const allowed = isTransferAllowed({
      thiefCard,
      thiefMessageId: thiefMessage?.id,
      //The perception card is the GM's own: what it says about a bigger object is his passing over
      perceptionCard: perceptionMessage?.author?.isGM ? perceptionCard : null,
      authorOwnsThief: !!thiefMessage?.author && !!thief?.testUserPermission(thiefMessage.author, "OWNER"),
      item,
      itemOnGiver: !!item && item.parent === giver,
      inReach: SR5Pickpocket.inReach(SR5Pickpocket.tokenOf(thiefId), SR5Pickpocket.tokenOf(targetId)),
      allowLarge: true,
    })
    if (!allowed || !receiver) {
      SR5_SystemHelpers.srLog(1, "Pickpocket transfer refused", messageData)
      return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketRefused"))
    }

    //Marked first: a second click finds the card done
    await perceptionMessage.update({
      "flags.sr5data.various.pickpocketDone": true
    })
    const given = item.toObject(false)
    delete given._id
    if (given.system?.storedIn !== undefined) given.system.storedIn = ""
    const deleted = await giver.deleteEmbeddedDocuments("Item", [item.id])
    if (deleted?.length) await receiver.createEmbeddedDocuments("Item", [given])

    await ChatMessage.create({
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format("SR5.PickpocketDone", {
        thief: SR5Pickpocket.tokenOf(thiefId)?.name ?? thief.name, item: item.name
      }))}</p>`,
      whisper: SR5Pickpocket.whisperFor(thief),
    })
    const outcome = pickpocketOutcome({
      thiefHits: thiefCard.roll.hits, perceptionHits: perceptionCard.roll.hits, glitch: thiefCard.roll.glitchRoll
    })
    if (outcome === "felt") await SR5Pickpocket.alertTarget(targetId, thiefId, false)
    await SR5_RollMessage.updateChatButtonHelper(messageId, "pickpocketTransfer")
  }
}
