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
  canUseHoldCard, staleHoldWarning, tokenForBaseActor, reversalRoles
} from "./grapple-rules.js"

//The grappling effects being deleted on this client: each is deleted once (see deleteGrappleEffectOnce)
const PENDING_DELETIONS = new Set()

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
  static async startHold(holderId, heldId, hold, kind = "subdue", fromUserId = null){
    //On the client that clicked, where the controlled tokens are known: an unlinked token's base actor becomes the token
    if (!fromUserId) {
      holderId = SR5_GrappleHelpers.resolveFighterId(holderId)
      heldId = SR5_GrappleHelpers.resolveFighterId(heldId)
    }
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleStartHold", {
      holderId, heldId, hold, kind, fromUserId: game.user.id
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

  static _socketWarn(message){
    ui.notifications.warn(game.i18n.localize(message.data.key))
  }

  //Run & Gun p. 126 : the held fighter reverses the situation, and the roles are swapped in a hold of the same kind
  static async reverseHold(reverserId, hold, holdId = null, fromUserId = null){
    if (!fromUserId) reverserId = SR5_GrappleHelpers.resolveFighterId(reverserId)
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleReverseHold", {
      reverserId, hold, holdId, fromUserId: game.user.id
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

  static async _socketReverseHold(message){
    const d = message.data
    await SR5_GrappleHelpers.reverseHold(d.reverserId, d.hold, d.holdId, d.fromUserId)
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

  //SR5 p. 196 : the hold strengthened or weakened, written on both fighters; actorId is either of them
  //holdId is the hold the card was rolled against: an older card never touches a newer hold
  static async setHold(actorId, hold, holdId = null, fromUserId = null){
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleSetHold", {
      actorId, hold, holdId, fromUserId: game.user.id
    })
    const actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    const data = grappleHoldOf(actor?.effects)
    const stale = staleHoldWarning(data, holdId)
    if (stale) return SR5_GrappleHelpers.warn(stale, fromUserId)
    const partner = SR5_EntityHelpers.getRealActorFromID(data.partner, data.actorUuids)
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
  static async releaseHold(actorId, holdId = null, fromUserId = null){
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleReleaseHold", {
      actorId, holdId, fromUserId: game.user.id
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

  static async _socketStartHold(message){
    const d = message.data
    await SR5_GrappleHelpers.startHold(d.holderId, d.heldId, d.hold, d.kind, d.fromUserId)
  }

  static async _socketSetHold(message){
    const d = message.data
    await SR5_GrappleHelpers.setHold(d.actorId, d.hold, d.holdId, d.fromUserId)
  }

  static async _socketReleaseHold(message){
    const d = message.data
    await SR5_GrappleHelpers.releaseHold(d.actorId, d.holdId, d.fromUserId)
  }

  //Active GM side : when one half of the hold goes, the other half of the same hold goes too
  static async onDeleteEffect(effect){
    if (!SR5_GrappleHelpers.isKeeper()) return
    const data = effect.flags?.sr5?.grapple
    if (!data) return
    await deleteGrappleEffectOnce(SR5_EntityHelpers.getRealActorFromID(data.partner, data.actorUuids), PENDING_DELETIONS, data.holdId)
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
    await SR5_GrappleHelpers.releaseActors([tokenDocument.actorLink ? actor : SR5_EntityHelpers.getRealActorFromID(data.partner, data.actorUuids)])
  }
}
