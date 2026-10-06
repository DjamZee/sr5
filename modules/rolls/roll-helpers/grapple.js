import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_SocketHandler
} from "../../socket.js"
import {
  SR5_PrepareRollTest
} from "../roll-prepare.js"
import {
  grappleHoldOf, canStartHold, crushDamage, holdReplacesClinch, GRAPPLE_STATUSES,
  deleteGrappleEffectOnce, isGrappleKeeper, tokenRemovalEndsHold, refusalRecipient,
  canUseHoldCard, staleHoldWarning, tokenForBaseActor, reversalRoles, counterGrappleHold
} from "./grapple-rules.js"
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
  grappleNeedsCard, grappleWarnAllowed
} from "./socket-senders.js"

//The same fighter, whether its id is the token's or the actor's (a token's actor shares the actor's id)
const sameFighter = (a, b) => !!a && !!b && (a === b || a.id === b.id)
const refuse = (kind, senderId, data) => {
  SR5_SystemHelpers.srLog(1, `Socket ${kind} refused from ${game.users.get(senderId)?.name ?? senderId}`, data)
  return false
}
//The called shot effect a defense card carries, by name
const calledShotEffect = (data, name) => Object.values(data?.combat?.calledShot?.effects ?? {
}).find(e => e?.name === name)

//The grappling effects being deleted on this client: each is deleted once (see deleteGrappleEffectOnce)
const PENDING_DELETIONS = new Set()

//The GM's answer on a player's card whose hold is read, not counted again: asked once per card
const READ_CONFIRMATIONS = new Map()

//The chat message that announces a new hold, by kind
const HOLD_TAKEN_MESSAGES = {
  subdue: "SR5.GrappleHoldTaken",
  clinch: "SR5.GrappleClinchTaken",
}

//Grappling (SR5 p. 195-196, Run & Gun p. 126 and 133-138), behind the world setting sr5GrapplingRules.
//Each fighter carries one active effect : its status shows on the token, its flag holds the role,
//the partner's id (actor or token id, as getRealActorFromID reads it) and the net hits of the hold.
//Effects on both fighters are written by the GM : a player rarely owns the other one.
export class SR5_GrappleHelpers {

  static isActive(){
    return game.settings.get("sr5", "sr5GrapplingRules")
  }

  static actorIdOf(actor){
    return actor.isToken ? actor.token.id : actor.id
  }

  //The statuses added to CONFIG.statusEffects when the setting is on
  static statusEffects(){
    return [
      {
        img: "icons/svg/combat.svg", id: "subduing", name: "SR5.STATUSES_Subduing"
      },
      {
        img: "icons/svg/net.svg", id: "subdued", name: "SR5.STATUSES_Subdued"
      },
      {
        img: "icons/svg/mystery-man.svg", id: "clinching", name: "SR5.STATUSES_Clinching"
      },
      {
        img: "icons/svg/padlock.svg", id: "clinched", name: "SR5.STATUSES_Clinched"
      },
    ]
  }

  //SR5 p. 195 : put both fighters in the hold. fromUserId is the user who asked, when the GM acts for them
  //messageId is the card whose button asked for it, read again by the GM (security lot, Thomas)
  static async startHold(holderId, heldId, hold, kind = "subdue", fromUserId = null, messageId = null){
    //On the client that clicked, where the controlled tokens are known: an unlinked token's base actor becomes the token
    if (!fromUserId) {
      holderId = SR5_GrappleHelpers.resolveFighterId(holderId)
      heldId = SR5_GrappleHelpers.resolveFighterId(heldId)
    }
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleStartHold", {
      holderId, heldId, hold, kind, messageId
    })
    const holder = SR5_EntityHelpers.getRealActorFromID(holderId),
      held = SR5_EntityHelpers.getRealActorFromID(heldId)
    if (!holder || !held) return
    //Run & Gun p. 134: subduing the one you clinch turns the clinch into a hold; both halves go first
    if (holdReplacesClinch(holder.effects, heldId, kind)) {
      const holdId = grappleHoldOf(holder.effects).holdId
      await Promise.all([holder, held].map(a => deleteGrappleEffectOnce(a, PENDING_DELETIONS, holdId)))
    }
    else if (!canStartHold(holder.effects, held.effects)) return SR5_GrappleHelpers.warn("SR5.WARN_GrappleAlreadyHeld", fromUserId)

    const holdId = foundry.utils.randomID()
    await holder.createEmbeddedDocuments("ActiveEffect", [SR5_GrappleHelpers._effect(kind, "holder", heldId, hold, holdId)])
    await held.createEmbeddedDocuments("ActiveEffect", [SR5_GrappleHelpers._effect(kind, "held", holderId, hold, holdId)])
    await SR5_GrappleHelpers.postHoldCard(holderId, heldId, hold, HOLD_TAKEN_MESSAGES[kind])
  }

  //A warning for the user who asked: here, or sent back through the socket when the GM acted for them
  static warn(key, fromUserId = null){
    const recipient = refusalRecipient(fromUserId, game.user.id)
    if (recipient) return SR5_SocketHandler.emitForPlayer("grappleWarn", {
      key
    }, recipient)
    ui.notifications.warn(game.i18n.localize(key))
  }

  //Only a GM sends it, and only a grappling warning: a player's console wrote any text on another's screen
  static _socketWarn(message, senderId){
    if (!grappleWarnAllowed(game.users.get(senderId)?.isGM, message?.data?.key)) return refuse("grappleWarn", senderId, message?.data)
    ui.notifications.warn(game.i18n.localize(message.data.key))
  }

  //Run & Gun p. 126 : the held fighter reverses the situation, and the roles are swapped in a hold of the same kind
  static async reverseHold(reverserId, hold, holdId = null, fromUserId = null, messageId = null){
    if (!fromUserId) reverserId = SR5_GrappleHelpers.resolveFighterId(reverserId)
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleReverseHold", {
      reverserId, hold, holdId, messageId
    })
    const reverser = SR5_EntityHelpers.getRealActorFromID(reverserId)
    const data = grappleHoldOf(reverser?.effects)
    const stale = staleHoldWarning(data?.role === "held" ? data : null, holdId)
    if (stale) return SR5_GrappleHelpers.warn(stale, fromUserId)
    const roles = reversalRoles(data, reverserId)
    const formerHolder = SR5_EntityHelpers.getRealActorFromID(roles.heldId)
    await Promise.all([reverser, formerHolder].map(a => deleteGrappleEffectOnce(a, PENDING_DELETIONS, data.holdId)))
    const newHoldId = foundry.utils.randomID()
    await reverser.createEmbeddedDocuments("ActiveEffect", [SR5_GrappleHelpers._effect(roles.kind, "holder", roles.heldId, hold, newHoldId)])
    await formerHolder.createEmbeddedDocuments("ActiveEffect", [SR5_GrappleHelpers._effect(roles.kind, "held", roles.holderId, hold, newHoldId)])
    await SR5_GrappleHelpers.postHoldCard(roles.holderId, roles.heldId, hold, "SR5.GrappleReversed")
  }

  static async _socketReverseHold(message, senderId){
    const sender = game.users.get(senderId),
      d = message?.data ?? {
      },
      reverser = SR5_EntityHelpers.getRealActorFromID(d.reverserId)
    if (!sender || !reverser) return refuse("grappleReverseHold", senderId, d)
    let hold = d.hold, holdId = d.holdId
    if (grappleNeedsCard(SR5_GrappleHelpers.ownsHold(sender, reverser))) {
      const use = SR5_GrappleHelpers.reverseUse(d, reverser)
      if (!use || !(await SR5_GrappleHelpers.grantUse(use, sender))) return refuse("grappleReverseHold", senderId, d)
      hold = use.value
      holdId = use.holdId
    }
    await SR5_GrappleHelpers.reverseHold(d.reverserId, hold, holdId, senderId)
  }

  //An actor id as the cards carry it. An unlinked token rolled from its base actor's sheet gives the base actor's id:
  //the hold must go on the token's own actor instead (see tokenForBaseActor)
  static resolveFighterId(actorId){
    const actor = game.actors?.get(actorId)
    if (!actor || !canvas?.scene) return actorId
    const tokenIds = canvas.scene.tokens.filter(t => t.actorId === actorId && !t.actorLink).map(t => t.id)
    const tokenId = tokenForBaseActor({
      isToken: false,
      actorLink: actor.prototypeToken?.actorLink,
      tokenIds,
      controlledIds: canvas.tokens?.controlled?.map(t => t.id) ?? [],
    })
    return tokenId ?? actorId
  }

  /* -------------------------------------------- */
  /*  The grappling sockets, on the GM's browser    */
  /* -------------------------------------------- */
  // Security lot (Thomas, before the djamz.11): a GM, or a player who owns every fighter the request
  // writes on, acts as before. Anyone else needs the card whose button asked for it, read again from
  // the chat log: the test the rule names, rolled by the fighter the rule names, against the hold in
  // progress; the hold comes from the card, never from the request; a card serves once; a player's
  // card is confirmed by the GM. A hold is read on the effect of the fighter the sender does NOT own:
  // a player writes the flags of her own actor's effects (Olympe's remark).

  /**
   * Grant a use read on a card. The hold of a subdue, a strengthened hold or a reversal is read on the
   * card, not counted again on its dice (it comes from two cards and the defense pool): the GM is told
   * so in his own words, then the card is spent. Escape cards are counted again: the common window.
   */
  static async grantUse(use, sender){
    if (!use.readOnly || use.card.byGM) return SR5_MiscellaneousHelpers.grant(use, sender)
    //A spent card asks nothing, and the GM is asked once per card, as in the common window
    if (SR5_MiscellaneousHelpers.isConsumed(use.key)) return false
    let asked = READ_CONFIRMATIONS.get(use.card.id)
    if (!asked) {
      asked = SR5_GrappleHelpers.confirmRead(use, sender)
      READ_CONFIRMATIONS.set(use.card.id, asked)
    }
    if (!(await asked)) return false
    return SR5_MiscellaneousHelpers.grant({
      ...use, card: {
        id: use.card.id, byGM: true
      }
    }, sender)
  }

  /** The GM's say on a hold read on a player's card, without the word "counted". Replaced in the tests. */
  static async confirmRead(use, sender){
    const esc = foundry.utils.escapeHTML
    return foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("SR5.SocketUseConfirmTitle")
      },
      content: `<p>${game.i18n.format("SR5.SocketUseConfirmRead", {
        user: esc(sender?.name ?? "?"), what: esc(game.i18n.format(`SR5.SocketUse_${use.label}`, {
          target: use.target ?? ""
        })), value: use.value ?? "",
      })}</p>`,
      rejectClose: false,
    })
  }

  /** Whether the sender is a GM or owns all these fighters. */
  static ownsFighters(sender, ...fighters){
    return !!sender && (sender.isGM || fighters.every(f => !!f && ownsTarget(sender, f)))
  }

  /** The hold between two fighters as the held one's partner writes it: { holder, held, data } where
   * data is the holder's half, or null when the two halves do not name each other. */
  static holdBetween(a, b){
    const da = grappleHoldOf(a?.effects), db = grappleHoldOf(b?.effects)
    if (!da || !db || da.holdId !== db.holdId || da.role === db.role) return null
    if (!sameFighter(SR5_EntityHelpers.getRealActorFromID(da.partner), b) || !sameFighter(SR5_EntityHelpers.getRealActorFromID(db.partner), a)) return null
    return da.role === "holder" ? {
      holder: a, held: b, data: da
    } : {
      holder: b, held: a, data: db
    }
  }

  /** Whether the sender is a GM, or owns both halves of the hold this fighter is in, each naming the
   * other (a partner forged on her own half names nobody who agrees). */
  static ownsHold(sender, fighter){
    if (sender?.isGM) return true
    const hold = SR5_GrappleHelpers.holdBetween(fighter, SR5_GrappleHelpers.partnerOf(fighter))
    return !!hold && SR5_GrappleHelpers.ownsFighters(sender, hold.holder, hold.held)
  }

  /** The partner of a fighter in a hold, as its own effect names it. */
  static partnerOf(fighter){
    const data = grappleHoldOf(fighter?.effects)
    return data ? SR5_EntityHelpers.getRealActorFromID(data.partner) : null
  }

  /**
   * An escape card (Run & Gun p. 135, SR5 p. 195) that frees its roller: its hits, counted again on its
   * dice within Unarmed Combat with Strength (plus Chance), reach the hold that the HOLDER's half
   * writes. null when it does not.
   */
  static escapeOf(messageId){
    const card = SR5_MiscellaneousHelpers.cardOf(messageId)
    if (!card || card.data.test?.type !== "grappleEscape") return null
    const held = card.roller, hold = SR5_GrappleHelpers.holdBetween(held, SR5_GrappleHelpers.partnerOf(held))
    if (!hold || !sameFighter(hold.held, held)) return null
    //A card rolled before this hold began frees nobody from it: the server dates both
    const begun = hold.holder.effects?.find(e => e.flags?.sr5?.grapple?.holdId === hold.data.holdId)?._stats?.createdTime ?? 0
    if (!((game.messages.get(messageId)?.timestamp ?? 0) >= begun)) return null
    const attributes = held.system?.attributes ?? {
    }
    const cap = SR5_MiscellaneousHelpers.poolCap(held, "skills.unarmedCombat.test.dicePool") +
      Math.max(0, (Number(attributes.strength?.augmented?.value) || 0) - (Number(attributes.agility?.augmented?.value) || 0))
    const hits = card.byGM ? Math.max(0, Number(card.data.roll?.hits) || 0) : recountHits(card.data.roll?.r, cap)
    const stored = Math.max(Number(hold.data.hold) || 0, 0)
    if (!(hits >= Math.max(stored, 1))) return null
    return {
      card, hold, hits, stored
    }
  }

  /** The card behind a new hold: a subdue on a defense card (SR5 p. 195), or a clinch (Run & Gun p. 133). */
  static startUse(d, holder, held){
    const card = SR5_MiscellaneousHelpers.cardOf(d.messageId)
    if (!card || !sameFighter(card.roller, held) || !sameFighter(SR5_EntityHelpers.getRealActorFromID(card.data.previousMessage?.actorId), holder)) return null
    let value, kind
    if (card.data.test?.type === "defense") {
      value = Number(calledShotEffect(card.data, "subdue")?.value)
      kind = "subdue"
    } else if (card.data.test?.type === "grappleClinchDefense") {
      value = (Number(card.data.previousMessage?.hits) || 0) - (Number(card.data.roll?.hits) || 0)
      kind = "clinch"
    }
    if (!kind || !(value > 0)) return null
    return {
      card, key: consumedKey(card.id, "grappleStartHold"), label: "grappleStartHold", target: held.name, value, kind, readOnly: true,
    }
  }

  /** The card behind a strengthened (or weakened) hold (SR5 p. 196), rolled by the held fighter against
   * the hold in progress. */
  static setUse(d, actor){
    const card = SR5_MiscellaneousHelpers.cardOf(d.messageId)
    const effect = calledShotEffect(card?.data, "strengthenHold")
    if (!card || card.data.test?.type !== "defense" || !effect || !sameFighter(card.roller, actor)) return null
    const hold = SR5_GrappleHelpers.holdBetween(actor, SR5_EntityHelpers.getRealActorFromID(card.data.previousMessage?.actorId))
    if (!hold || !sameFighter(hold.held, actor) || hold.data.holdId !== effect.holdId) return null
    const value = Number(effect.value)
    if (!Number.isFinite(value) || value < 0) return null
    return {
      card, key: consumedKey(card.id, "grappleSetHold"), label: "grappleSetHold", target: actor.name, value, holdId: effect.holdId, readOnly: true,
    }
  }

  /** The card behind a reversal: a reversal called shot against the holder (Run & Gun p. 126), or an
   * escape with Counter-grapple (Run & Gun p. 148-149), whose new hold the GM works out again. */
  static reverseUse(d, reverser){
    const card = SR5_MiscellaneousHelpers.cardOf(d.messageId)
    if (!card) return null
    if (card.data.test?.type === "defense") {
      const effect = calledShotEffect(card.data, "reversal")
      const hold = SR5_GrappleHelpers.holdBetween(reverser, card.roller)
      if (!effect || !hold || !sameFighter(hold.held, reverser) || !sameFighter(SR5_EntityHelpers.getRealActorFromID(card.data.previousMessage?.actorId), reverser) ||
        hold.data.holdId !== effect.holdId || !(Number(effect.value) > 0)) return null
      return {
        card, key: consumedKey(card.id, "grappleReverseHold"), label: "grappleReverseHold", target: hold.holder.name, readOnly: true,
        value: Number(effect.value), holdId: hold.data.holdId,
      }
    }
    const escape = SR5_GrappleHelpers.escapeOf(d.messageId)
    if (!escape || !sameFighter(escape.hold.held, reverser) || !reverser.system?.itemsProperties?.martialArts?.counterGrapple?.isActive) return null
    return {
      card: escape.card, key: consumedKey(escape.card.id, "grappleEscape"), label: "grappleReverseHold",
      target: escape.hold.holder.name, value: counterGrappleHold(escape.hits, escape.stored), holdId: escape.hold.data.holdId,
    }
  }

  //SR5 p. 196 : the hold strengthened or weakened, written on both fighters; actorId is either of them
  //holdId is the hold the card was rolled against: an older card never touches a newer hold
  static async setHold(actorId, hold, holdId = null, fromUserId = null, messageId = null){
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleSetHold", {
      actorId, hold, holdId, messageId
    })
    const actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    const data = grappleHoldOf(actor?.effects)
    const stale = staleHoldWarning(data, holdId)
    if (stale) return SR5_GrappleHelpers.warn(stale, fromUserId)
    const partner = SR5_EntityHelpers.getRealActorFromID(data.partner)
    //A changed hold is a new state of the hold: the cards rolled against the former one no longer apply
    const newHoldId = foundry.utils.randomID()
    for (const a of [actor, partner]){
      const effect = a?.effects.find(e => e.flags?.sr5?.grapple?.holdId === data.holdId)
      if (effect) await effect.update({
        "flags.sr5.grapple.hold": hold, "flags.sr5.grapple.holdId": newHoldId
      })
    }
    const [holderId, heldId] = data.role === "holder" ? [actorId, data.partner] : [data.partner, actorId]
    await SR5_GrappleHelpers.postHoldCard(holderId, heldId, hold, "SR5.GrappleHoldChanged")
  }

  //The chat card of a hold : what it is, and the holder's buttons (SR5 p. 195-196)
  static async postHoldCard(holderId, heldId, hold, messageKey){
    const holder = SR5_EntityHelpers.getRealActorFromID(holderId),
      held = SR5_EntityHelpers.getRealActorFromID(heldId)
    const button = (action, label) => `<button type="button" class="sr5-grapple-button" data-grapple="${action}">${label}</button>`
    const content = `<p>${game.i18n.format(messageKey, {
      holder: holder.name, held: held.name, hold
    })}</p>` +
      //Crushing is an option of the one who subdues (SR5 p. 196), not of a clinch (Run & Gun p. 133)
      (grappleHoldOf(holder.effects)?.kind === "subdue" ? button("crush", game.i18n.format("SR5.GrappleCrush", {
        damage: crushDamage(holder.system.attributes.strength.augmented.value).value
      })) : "") +
      button("release", game.i18n.localize("SR5.GrappleRelease"))
    await ChatMessage.create({
      content,
      speaker: {
        alias: holder.name
      },
      flags: {
        sr5: {
          grappleCard: {
            holderId, heldId, holdId: grappleHoldOf(holder.effects)?.holdId
          }
        }
      }
    })
  }

  //Bind the buttons of a hold card when it is rendered
  static onRenderHoldCard(message, html){
    const card = message.flags?.sr5?.grappleCard
    if (!card) return
    const holder = SR5_EntityHelpers.getRealActorFromID(card.holderId)
    //The buttons belong to the one who holds: hidden from the other players
    if (!canUseHoldCard(game.user.isGM, holder?.isOwner)) return html.querySelectorAll(".sr5-grapple-button").forEach(el => el.remove())
    html.querySelectorAll(".sr5-grapple-button").forEach(el => el.addEventListener("click", async ev => {
      ev.preventDefault()
      const holder = SR5_EntityHelpers.getRealActorFromID(card.holderId)
      if (!canUseHoldCard(game.user.isGM, holder?.isOwner)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_GrappleNotYourHold"))
      //A card left from a hold that has since ended, or changed (a clinch turned into a subdue, a hold strengthened), does nothing
      const current = grappleHoldOf(holder.effects)
      const stale = current?.partner === card.heldId ? staleHoldWarning(current, card.holdId) : "SR5.WARN_GrappleNoHold"
      if (stale) return ui.notifications.warn(game.i18n.localize(stale))
      if (el.dataset.grapple === "release") return SR5_GrappleHelpers.releaseHold(card.holderId, card.holdId)
      if (el.dataset.grapple === "crush") return SR5_GrappleHelpers.crush(card.holderId, card.heldId)
    }))
  }

  //SR5 p. 196 : damage the held fighter, Strength as Stun Damage Value, no test, resisted normally with armor
  static async crush(holderId, heldId){
    const held = SR5_EntityHelpers.getRealActorFromID(heldId)
    const chatData = SR5_GrappleHelpers.crushRollData(holderId, heldId)
    if (!held || !chatData) return
    //Only who crushes whom travels: whoever rolls the resistance builds the card again (security pass, Olympe)
    const request = {
      actorId: heldId, rollType: "resistanceCard", rollKey: null, use: "grappleCrush", holderId
    }
    const user = SR5_EntityHelpers.getUserOwner(held)
    if (user && user.id !== game.user.id && !user.isGM) return SR5_SocketHandler.emitForPlayer("actorRoll", request, user.id)
    if (held.isOwner) return held.rollTest("resistanceCard", null, chatData)
    return SR5_SocketHandler.emitForGM("actorRoll", request)
  }

  /**
   * The resistance card of a crush (SR5 p. 196). Asked by a player (`sender`), only for a holder she owns, and
   * while the held fighter's own effect, written by the GM, names that holder.
   * @return {Object|null} the card's data, null when the crush is not hers to ask
   */
  static crushRollData(holderId, heldId, sender = null){
    const holder = SR5_EntityHelpers.getRealActorFromID(holderId),
      held = SR5_EntityHelpers.getRealActorFromID(heldId)
    if (!holder || !held) return null
    if (sender && !sender.isGM) {
      if (!holder.testUserPermission?.(sender, "OWNER")) return null
      const hold = grappleHoldOf(held.effects)
      if (hold?.role !== "held" || hold.partner !== holderId) return null
    }
    const damage = crushDamage(holder.system.attributes.strength.augmented.value)
    const chatData = SR5_PrepareRollTest.getBaseRollData(null, holder)
    chatData.damage.value = damage.value
    chatData.damage.type = damage.type
    chatData.damage.isAttack = true
    chatData.damage.resistanceType = "physicalDamage"
    chatData.test.typeSub = "meleeWeapon"
    chatData.owner.actorId = holderId
    chatData.previousMessage.actorId = holderId
    return chatData
  }

  //holdId names the hold both halves belong to, so that deleting one half never takes a newer hold away
  static _effect(kind, role, partner, hold, holdId){
    const status = GRAPPLE_STATUSES[kind][role]
    const statusEffect = CONFIG.statusEffects.find(s => s.id === status)
    return {
      name: game.i18n.localize(statusEffect?.name ?? status),
      img: statusEffect?.img,
      statuses: [status],
      flags: {
        sr5: {
          grapple: {
            role, kind, partner, hold, holdId
          }
        }
      }
    }
  }

  //Leave the hold : both fighters lose their grappling effect (deleting one deletes the other, see onDeleteEffect)
  //With a holdId (a card button), only the hold the card was rolled against is released
  static async releaseHold(actorId, holdId = null, fromUserId = null, messageId = null){
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleReleaseHold", {
      actorId, holdId, messageId
    })
    const actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    if (holdId) {
      const stale = staleHoldWarning(grappleHoldOf(actor?.effects), holdId)
      if (stale) return SR5_GrappleHelpers.warn(stale, fromUserId)
    }
    await deleteGrappleEffectOnce(actor, PENDING_DELETIONS)
  }

  //The grappling hooks run on the active GM's client only, not on every GM connected
  static isKeeper(){
    return isGrappleKeeper(game.users)
  }

  //The warnings go back to the sender the server stamps, never to a user the request names
  static async _socketStartHold(message, senderId){
    const sender = game.users.get(senderId),
      d = message?.data ?? {
      },
      holder = SR5_EntityHelpers.getRealActorFromID(d.holderId),
      held = SR5_EntityHelpers.getRealActorFromID(d.heldId)
    if (!sender || !holder || !held) return refuse("grappleStartHold", senderId, d)
    let hold = d.hold, kind = d.kind ?? "subdue"
    if (grappleNeedsCard(SR5_GrappleHelpers.ownsFighters(sender, holder, held))) {
      const use = SR5_GrappleHelpers.startUse(d, holder, held)
      if (!use || !(await SR5_GrappleHelpers.grantUse(use, sender))) return refuse("grappleStartHold", senderId, d)
      hold = use.value
      kind = use.kind
    }
    await SR5_GrappleHelpers.startHold(d.holderId, d.heldId, hold, kind, senderId)
  }

  static async _socketSetHold(message, senderId){
    const sender = game.users.get(senderId),
      d = message?.data ?? {
      },
      actor = SR5_EntityHelpers.getRealActorFromID(d.actorId)
    if (!sender || !actor) return refuse("grappleSetHold", senderId, d)
    let hold = d.hold, holdId = d.holdId
    if (grappleNeedsCard(SR5_GrappleHelpers.ownsHold(sender, actor))) {
      const use = SR5_GrappleHelpers.setUse(d, actor)
      if (!use || !(await SR5_GrappleHelpers.grantUse(use, sender))) return refuse("grappleSetHold", senderId, d)
      hold = use.value
      holdId = use.holdId
    }
    await SR5_GrappleHelpers.setHold(d.actorId, hold, holdId, senderId)
  }

  //The holder lets go when she likes (SR5 p. 196); the held fighter only with an escape card that
  //reaches the hold (Run & Gun p. 135)
  static async _socketReleaseHold(message, senderId){
    const sender = game.users.get(senderId),
      d = message?.data ?? {
      },
      actor = SR5_EntityHelpers.getRealActorFromID(d.actorId)
    if (!sender || !actor) return refuse("grappleReleaseHold", senderId, d)
    if (!sender.isGM) {
      const hold = SR5_GrappleHelpers.holdBetween(actor, SR5_GrappleHelpers.partnerOf(actor))
      let allowed = !!hold && ownsTarget(sender, hold.holder)
      if (!allowed && hold && ownsTarget(sender, hold.held)) {
        const escape = SR5_GrappleHelpers.escapeOf(d.messageId)
        allowed = !!escape && sameFighter(escape.hold.held, hold.held) && await SR5_MiscellaneousHelpers.grant({
          card: escape.card, key: consumedKey(escape.card.id, "grappleEscape"), label: "grappleEscape",
          target: hold.holder.name, value: escape.hits,
        }, sender)
      }
      if (!allowed) return refuse("grappleReleaseHold", senderId, d)
    }
    await SR5_GrappleHelpers.releaseHold(d.actorId, d.holdId, senderId)
  }

  //Active GM side: an escape a player rolled, whose card asks for the hold to end (test-GrappleEscape.js).
  //The card is the request: read again, its hits counted again against the holder's half, once
  static async onEscapeCard(message){
    if (!SR5_GrappleHelpers.isKeeper() || !message?.flags?.sr5data?.various?.grappleEscaped || message.author?.isGM) return
    //A card that frees nobody (hold already over, hits short of it) frees nobody, without a word: the card says so
    const escape = SR5_GrappleHelpers.escapeOf(message.id)
    if (!escape) return
    const key = consumedKey(escape.card.id, "grappleEscape")
    if (SR5_MiscellaneousHelpers.isConsumed(key)) return
    const granted = await SR5_MiscellaneousHelpers.grant({
      card: escape.card, key, label: "grappleEscape", target: escape.hold.holder.name, value: escape.hits,
    }, message.author)
    if (!granted) return refuse("grappleEscape", message.author?.id, message.id)
    await deleteGrappleEffectOnce(escape.hold.held, PENDING_DELETIONS, escape.hold.data.holdId)
  }

  //Active GM side : when one half of the hold goes, the other half of the same hold goes too
  //A held fighter's player who deletes her own half (the status in the token HUD) has not escaped: the
  //half comes back, and the holder's stays (security lot, Thomas). Only an escape card frees her.
  static async onDeleteEffect(effect, userId = null){
    if (!SR5_GrappleHelpers.isKeeper()) return
    const data = effect.flags?.sr5?.grapple
    if (!data) return
    const user = userId ? game.users.get(userId) : null,
      partner = SR5_EntityHelpers.getRealActorFromID(data.partner)
    if (data.role === "held" && user && !user.isGM && partner && !ownsTarget(user, partner) &&
      grappleHoldOf(partner.effects)?.holdId === data.holdId) {
      const kept = grappleHoldOf(partner.effects)
      await effect.parent?.createEmbeddedDocuments("ActiveEffect", [SR5_GrappleHelpers._effect(kept.kind, "held", data.partner, kept.hold, kept.holdId)])
      return refuse("grappleDeleteHeld", userId, data)
    }
    await deleteGrappleEffectOnce(SR5_EntityHelpers.getRealActorFromID(data.partner), PENDING_DELETIONS, data.holdId)
  }

  //Active GM side : a fighter knocked out or killed leaves the hold
  static async onCreateEffect(effect){
    if (!SR5_GrappleHelpers.isKeeper()) return
    if (!(effect.statuses.has("unconscious") || effect.statuses.has("dead"))) return
    await deleteGrappleEffectOnce(effect.parent, PENDING_DELETIONS)
  }

  //Active GM side : the end of the combat ends every hold among its fighters
  static async releaseActors(actors){
    for (const actor of actors){
      if (actor && grappleHoldOf(actor.effects)) await deleteGrappleEffectOnce(actor, PENDING_DELETIONS)
    }
  }

  //Active GM side : a fighter removed from the scene lets go of its hold, or is let go. A linked actor may still
  //have a token on another scene: the hold ends only with its last token.
  static async onDeleteToken(tokenDocument){
    if (!SR5_GrappleHelpers.isKeeper()) return
    const actor = tokenDocument.actor
    const data = grappleHoldOf(actor?.effects)
    if (!data) return
    const remaining = tokenDocument.actorLink ? game.scenes.reduce((n, s) => n + s.tokens.filter(t => t.actorId === actor.id).length, 0) : 0
    if (!tokenRemovalEndsHold(tokenDocument.actorLink, remaining)) return
    //An unlinked token's effects went with it: only the partner's half is left. A linked actor keeps its half,
    //whose deletion takes the partner's along (onDeleteEffect).
    await SR5_GrappleHelpers.releaseActors([tokenDocument.actorLink ? actor : SR5_EntityHelpers.getRealActorFromID(data.partner)])
  }
}
