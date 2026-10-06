import {
  pickableItems, randomPick, concealmentOf, transferEnds, pickpocketOutcome, isTransferAllowed, perceptionDialogLocks,
  PICKPOCKET_MAX_CONCEALMENT, pileSize, defaultTakeQuantity, splitPile,
  thiefHitsCap, boundThiefHits
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

  //The tokens of an actor named by a card, on the scene viewed: an unlinked one by its own id, a linked actor
  //may stand there several times
  static tokensOf(actorId) {
    const tokens = canvas.scene?.tokens
    const own = tokens?.get(actorId)
    if (own) return [own]
    return tokens?.filter(t => t.actorLink && t.actorId === actorId) ?? []
  }

  //The one to name: the token the user has selected, else the first on the scene
  static tokenOf(actorId) {
    const list = SR5Pickpocket.tokensOf(actorId)
    return list.find(t => t.object?.controlled) ?? list[0]
  }

  //Whether any token of the thief stands within reach of any token of the target
  static actorsInReach(thiefId, targetId) {
    const targets = SR5Pickpocket.tokensOf(targetId)
    return SR5Pickpocket.tokensOf(thiefId).some(a => targets.some(b => a !== b && SR5Pickpocket.inReach(a, b)))
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

  //Whether the user can pick this token's pocket now: someone with pockets, and his own thief within reach
  static canPickFrom(target) {
    if (!target?.actor || NOT_LOOTERS.includes(target.actor.type)) return false
    const thief = SR5Pickpocket.thiefToken(target)
    return !!thief && SR5Pickpocket.inReach(thief, target)
  }

  static addHudButton(hud) {
    const target = hud.document
    if (!SR5Pickpocket.canPickFrom(target)) return
    const thief = SR5Pickpocket.thiefToken(target)

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

    //Putting an object on someone: the same test the other way round (SR5 p. 422), when the thief has something small
    if (!pickableItems(thief.actor).length) return
    const plant = document.createElement("button")
    plant.type = "button"
    plant.className = "control-icon sr-hud-pickpocket-plant"
    plant.dataset.tooltip = game.i18n.localize("SR5.PickpocketPlant")
    plant.innerHTML = "<i class=\"fas fa-hand-holding-hand\"></i>"
    plant.addEventListener("click", event => {
      event.preventDefault()
      event.stopPropagation()
      SR5Pickpocket.start(thief, target, "plant")
    })
    left.appendChild(plant)
  }

  //The thief's side when he plants: he always chooses, it is his own object, and how many of a pile
  static async askPlant(thief, targetDocument) {
    const escape = foundry.utils.escapeHTML
    const items = pickableItems(thief)
    if (!items.length) return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketNothingToPlant"))
    const options = items.map(i => `<option value="${i.id}" data-default="${defaultTakeQuantity(i)}" data-max="${pileSize(i)}">${escape(i.name)}${pileSize(i) > 1 ? ` ×${pileSize(i)}` : ""}</option>`).join("")
    return foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format("SR5.PickpocketPlantTitle", {
          name: targetDocument.name
        })
      },
      content: `<div class="form-group"><label>${escape(game.i18n.localize("SR5.PickpocketItem"))}</label><select name="itemId">${options}</select></div><div class="form-group"><label>${escape(game.i18n.localize("SR5.PickpocketQuantityPlanted"))}</label><input type="number" name="quantity" min="1" step="1" value="${defaultTakeQuantity(items[0])}" max="${pileSize(items[0])}"/></div>`,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("SR5.PickpocketPlant"),
        default: true,
        callback: (event, button) => ({
          aim: "",
          itemId: button.form.elements.itemId.value,
          quantity: Number(button.form.elements.quantity.value) || null,
        }),
      }],
      render: (event, dialog) => {
        const form = dialog.element.querySelector("form") ?? dialog.element
        const select = form.querySelector("[name=itemId]"), field = form.querySelector("[name=quantity]")
        select?.addEventListener("change", () => {
          const option = select.selectedOptions[0]
          field.value = option?.dataset.default ?? ""
          field.max = option?.dataset.max ?? ""
        })
      },
      rejectClose: false,
    })
  }

  //The thief's side: what he says he is after, the object itself if the world lets him choose, then his roll
  static async start(thiefDocument, targetDocument, mode = "take") {
    const thief = thiefDocument.actor
    //SR5 p. 135: Palming cannot be used untrained
    if (!(thief.system.skills.palming.rating?.value > 0)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketNeedsPalming"))

    if (mode === "plant") {
      const planted = await SR5Pickpocket.askPlant(thief, targetDocument)
      if (!planted?.itemId) return
      return thief.rollTest("pickpocket", null, {
        targetActorId: SR5Pickpocket.actorIdOf(targetDocument),
        mode,
        aim: "",
        itemId: planted.itemId,
        quantity: planted.quantity,
      })
    }

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
    //One Perception per thief card: a second click would give a second roll, and a second object
    if (SR5Pickpocket.isAnswered(messageData.owner.messageId)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketAnswered"))
    //The thief card must be written by someone who plays the thief: nobody rolls in another's name
    const thiefMessage = game.messages.get(messageData.owner.messageId)
    if (!thiefMessage?.author || !thief.testUserPermission(thiefMessage.author, "OWNER")) return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketRefused"))
    //The card is the player's own message, retouchable until the GM's first click: its hits are a claim,
    //bounded by the pool the GM's browser prepares and confirmed by the GM below (security lot, Sixtine)
    const hitsCap = thiefHitsCap(thief)
    const claimedHits = Number(thiefMessage.flags?.sr5data?.roll?.hits) || 0
    const mode = messageData.various.pickpocketMode ?? "take"
    const giver = mode === "plant" ? thief : target

    const escape = foundry.utils.escapeHTML
    //Taking, the thief chooses only when the world lets him: otherwise a choice on his card is his own writing
    const thiefMayChoose = mode === "plant" || game.settings.get("sr5", "sr5PickpocketThiefChooses")
    const chosen = thiefMayChoose ? messageData.various.pickpocketItemId : null
    //Every object the GM can pass over to, the small ones first; one bigger than +2 is marked
    const items = pickableItems(giver, {
      allowLarge: true
    }).sort((a, b) => concealmentOf(a) - concealmentOf(b))
    const options = items.map(i => {
      const large = concealmentOf(i) > PICKPOCKET_MAX_CONCEALMENT ? ` — ${game.i18n.localize("SR5.PickpocketLarge")}` : ""
      const pile = pileSize(i) > 1 ? ` ×${pileSize(i)}` : ""
      return `<option value="${i.id}" data-default="${defaultTakeQuantity(i)}" data-max="${pileSize(i)}" ${i.id === chosen ? "selected" : ""}>${escape(i.name)}${pile} (${concealmentOf(i)})${large}</option>`
    }).join("")
    const locks = perceptionDialogLocks(mode, chosen)
    const locked = locks.item ? "disabled" : ""
    const chosenItem = chosen ? giver.items.get(chosen) : null
    //When he plants, the thief already said how many
    const chosenQuantity = chosenItem ? (mode === "plant" && messageData.various.pickpocketQuantity ? messageData.various.pickpocketQuantity : defaultTakeQuantity(chosenItem)) : ""
    const titleKey = mode === "plant" ? "SR5.PickpocketPlantTitle" : "SR5.PickpocketTitle"
    const quantityKey = mode === "plant" ? "SR5.PickpocketQuantityPlanted" : "SR5.PickpocketQuantity"
    const box = key => `<div class="form-group"><label>${escape(game.i18n.localize(`SR5.Pickpocket${key.charAt(0).toUpperCase()}${key.slice(1)}`))}</label><input type="checkbox" name="${key}"/></div>`
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format(titleKey, {
          name: SR5Pickpocket.tokenOf(messageData.target.actorId)?.name ?? target.name
        })
      },
      content: `<div class="form-group"><label>${escape(game.i18n.localize("SR5.PickpocketItem"))}</label><select name="itemId" ${locked}><option value="">${escape(game.i18n.localize("SR5.PickpocketRandom"))}</option>${options}</select></div><div class="form-group"><label>${escape(game.i18n.localize(quantityKey))}</label><input type="number" name="quantity" min="1" step="1" value="${chosenQuantity}" ${locks.quantity ? "disabled" : ""} placeholder="${escape(game.i18n.localize("SR5.PickpocketQuantityDefault"))}"/></div><div class="form-group"><label>${escape(game.i18n.format("SR5.PickpocketThiefHits", {
        claimed: claimedHits, cap: hitsCap
      }))}</label><input type="number" name="thiefHits" min="0" max="${hitsCap}" step="1" value="${boundThiefHits(claimedHits, hitsCap)}"/></div>${box("distracted")}${box("attentive")}${box("diversion")}`,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("SR5.SkillPerception"),
        default: true,
        callback: (event, button) => {
          const f = button.form.elements
          return {
            itemId: chosen || f.itemId.value || null,
            situations: ["distracted", "attentive", "diversion"].filter(k => f[k].checked),
            thiefHits: boundThiefHits(f.thiefHits.value, hitsCap),
            //Planting, the thief's quantity stands, whatever the field says
            quantity: locks.quantity ? (messageData.various.pickpocketQuantity ?? null) : (f.quantity.value === "" ? null : Number(f.quantity.value)),
          }
        },
      }],
      render: (event, dialog) => {
        const form = dialog.element.querySelector("form") ?? dialog.element
        const select = form.querySelector("[name=itemId]"), field = form.querySelector("[name=quantity]")
        select?.addEventListener("change", () => {
          const option = select.selectedOptions[0]
          field.value = option?.dataset.default ?? ""
          if (option?.dataset.max) field.max = option.dataset.max
          else field.removeAttribute("max")
        })
      },
      rejectClose: false,
    })
    if (!result) return

    //"At random" draws among the small objects only
    const item = result.itemId ? giver.items.get(result.itemId) : randomPick(pickableItems(giver), Math.random())
    if (!item) return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketNothing"))
    const data = foundry.utils.duplicate(messageData)
    data.various.pickpocketItemId = item.id
    data.various.pickpocketItemName = item.name
    //Arbitrage de DjamZ (2026-10-05): the GM chooses how many units of a pile are taken
    data.various.pickpocketQuantity = splitPile(item, result.quantity).quantity
    data.various.pickpocketConcealment = concealmentOf(item)
    data.various.pickpocketSituations = result.situations
    data.various.pickpocketAnswerId = foundry.utils.randomID()
    //The hits the GM confirmed: the Perception card freezes them, the thief card is never read again
    data.roll.hits = result.thiefHits
    //The thief's roll as it is now, kept on the GM's card: the hits go through previousMessage.hits
    data.various.pickpocketThiefGlitch = !!messageData.roll.glitchRoll
    data.various.pickpocketThiefCriticalGlitch = !!messageData.roll.criticalGlitchRoll
    //Checked again after the dialog: another click may have answered meanwhile
    if (SR5Pickpocket.isAnswered(messageData.owner.messageId)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_PickpocketAnswered"))
    await target.rollTest("pickpocketPerception", null, data)
  }

  static isAnswered(thiefMessageId) {
    const various = game.messages.get(thiefMessageId)?.flags?.sr5data?.various
    return !!(various?.pickpocketAnswerId || various?.pickpocketDone)
  }

  /** The Perception card is being written: the thief card it answers is spent, its button goes
   * @param {String} thiefMessageId - the thief card
   * @param {String} answerId - the id the Perception card carries
   */
  static async markAnswered(thiefMessageId, answerId) {
    if (!game.user.isGM) return
    const message = game.messages.get(thiefMessageId)
    if (!message || message.flags?.sr5data?.various?.pickpocketAnswerId) return
    await message.update({
      "flags.sr5data.various.pickpocketAnswerId": answerId
    })
    await SR5_RollMessage.updateChatButtonHelper(thiefMessageId, "pickpocketPerception")
  }

  //Users who play an actor, and the GMs: whom a warning about that actor goes to
  static whisperFor(actor) {
    return game.users.filter(u => u.isGM || (actor && actor.testUserPermission(u, "OWNER"))).map(u => u.id)
  }

  //The target learns of it: with the thief's name when caught or noticed, without when he only felt something.
  //Planting, a critical glitch drops the object at the target's feet (arbitrage de DjamZ, 2026-10-05)
  static async alertTarget(targetId, thiefId, named, mode = "take", dropped = false) {
    const target = SR5_EntityHelpers.getRealActorFromID(targetId)
    const thief = SR5_EntityHelpers.getRealActorFromID(thiefId)
    const name = SR5Pickpocket.tokenOf(targetId)?.name ?? target?.name ?? ""
    const thiefName = SR5Pickpocket.tokenOf(thiefId)?.name ?? thief?.name ?? ""
    let namedKey = "SR5.PickpocketAlertNamed"
    if (mode === "plant") namedKey = dropped ? "SR5.PickpocketPlantAlertDropped" : "SR5.PickpocketPlantAlertNamed"
    const text = named ? game.i18n.format(namedKey, {
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
    //The object dropped stays the thief's in the system: where it lands is the GM's call
    await SR5Pickpocket.alertTarget(targetId, thiefId, true, messageData.various?.pickpocketMode ?? "take", type === "pickpocketCaught")
    await game.messages.get(type === "pickpocketCaught" ? messageId : messageData.previousMessage.messageId)?.update({
      "flags.sr5data.various.pickpocketDone": true
    })
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
      inReach: SR5Pickpocket.actorsInReach(thiefId, targetId),
      allowLarge: true,
    })
    if (!allowed || !receiver) {
      SR5_SystemHelpers.srLog(1, "Pickpocket transfer refused", messageData)
      return ui.notifications.warn(game.i18n.localize(mode === "plant" ? "SR5.WARN_PickpocketPlantRefused" : "SR5.WARN_PickpocketRefused"))
    }

    //Marked first: a second click finds the card done
    await perceptionMessage.update({
      "flags.sr5data.various.pickpocketDone": true
    })
    await thiefMessage.update({
      "flags.sr5data.various.pickpocketDone": true
    })
    //Arbitrage de DjamZ (2026-10-05): a pile is split, the giver keeps the rest, the units taken join an
    //identical pile of the receiver if he has one
    const split = splitPile(item, perceptionCard.various.pickpocketQuantity, receiver.items)
    const given = item.toObject(false)
    delete given._id
    if (given.system?.storedIn !== undefined) given.system.storedIn = ""
    if (given.system?.quantity !== undefined) given.system.quantity = split.quantity
    let moved = true
    if (split.leftOnGiver > 0) await item.update({
      "system.quantity": split.leftOnGiver
    })
    else moved = !!(await giver.deleteEmbeddedDocuments("Item", [item.id]))?.length
    if (moved) {
      if (split.mergeInto) await split.mergeInto.update({
        "system.quantity": pileSize(split.mergeInto) + split.quantity
      })
      else await receiver.createEmbeddedDocuments("Item", [given])
    }

    await ChatMessage.create({
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format(mode === "plant" ? "SR5.PickpocketPlantDone" : "SR5.PickpocketDone", {
        thief: SR5Pickpocket.tokenOf(thiefId)?.name ?? thief.name,
        target: SR5Pickpocket.tokenOf(targetId)?.name ?? target.name,
        item: split.quantity > 1 || pileSize(item) > 1 ? `${item.name} ×${split.quantity}` : item.name
      }))}</p>`,
      whisper: SR5Pickpocket.whisperFor(thief),
    })
    const outcome = pickpocketOutcome({
      thiefHits: perceptionCard.previousMessage.hits, perceptionHits: perceptionCard.roll.hits, glitch: perceptionCard.various.pickpocketThiefGlitch
    })
    if (outcome === "felt") await SR5Pickpocket.alertTarget(targetId, thiefId, false)
    await SR5_RollMessage.updateChatButtonHelper(messageId, "pickpocketTransfer")
  }
}
