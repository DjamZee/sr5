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
  grappleHoldOf, canStartHold, crushDamage, GRAPPLE_STATUSES
} from "./grapple-rules.js"

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
    ]
  }

  //SR5 p. 195 : put both fighters in the hold
  static async startHold(holderId, heldId, hold, kind = "subdue"){
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleStartHold", {
      holderId, heldId, hold, kind
    })
    const holder = SR5_EntityHelpers.getRealActorFromID(holderId),
      held = SR5_EntityHelpers.getRealActorFromID(heldId)
    if (!holder || !held) return
    if (!canStartHold(holder.effects, held.effects)) return ui.notifications.warn(game.i18n.localize("SR5.WARN_GrappleAlreadyHeld"))

    await holder.createEmbeddedDocuments("ActiveEffect", [SR5_GrappleHelpers._effect(kind, "holder", heldId, hold)])
    await held.createEmbeddedDocuments("ActiveEffect", [SR5_GrappleHelpers._effect(kind, "held", holderId, hold)])
    await SR5_GrappleHelpers.postHoldCard(holderId, heldId, hold, "SR5.GrappleHoldTaken")
  }

  //SR5 p. 196 : the hold strengthened or weakened, written on both fighters; actorId is either of them
  static async setHold(actorId, hold){
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleSetHold", {
      actorId, hold
    })
    const actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    const data = grappleHoldOf(actor?.effects)
    if (!data) return
    const partner = SR5_EntityHelpers.getRealActorFromID(data.partner)
    for (const a of [actor, partner]){
      const effect = a?.effects.find(e => e.flags?.sr5?.grapple)
      if (effect) await effect.update({
        "flags.sr5.grapple.hold": hold
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
      button("crush", game.i18n.format("SR5.GrappleCrush", {
        damage: crushDamage(holder.system.attributes.strength.augmented.value).value
      })) +
      button("release", game.i18n.localize("SR5.GrappleRelease"))
    await ChatMessage.create({
      content,
      speaker: {
        alias: holder.name
      },
      flags: {
        sr5: {
          grappleCard: {
            holderId, heldId
          }
        }
      }
    })
  }

  //Bind the buttons of a hold card when it is rendered
  static onRenderHoldCard(message, html){
    const card = message.flags?.sr5?.grappleCard
    if (!card) return
    html.querySelectorAll(".sr5-grapple-button").forEach(el => el.addEventListener("click", async ev => {
      ev.preventDefault()
      const holder = SR5_EntityHelpers.getRealActorFromID(card.holderId)
      if (!holder?.isOwner) return ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActor"))
      //A card left from a hold that has since ended does nothing
      if (grappleHoldOf(holder.effects)?.partner !== card.heldId) return ui.notifications.warn(game.i18n.localize("SR5.WARN_GrappleNoHold"))
      if (el.dataset.grapple === "release") return SR5_GrappleHelpers.releaseHold(card.holderId)
      if (el.dataset.grapple === "crush") return SR5_GrappleHelpers.crush(card.holderId, card.heldId)
    }))
  }

  //SR5 p. 196 : damage the held fighter, Strength as Stun Damage Value, no test, resisted normally with armor
  static async crush(holderId, heldId){
    const holder = SR5_EntityHelpers.getRealActorFromID(holderId),
      held = SR5_EntityHelpers.getRealActorFromID(heldId)
    if (!holder || !held) return
    const damage = crushDamage(holder.system.attributes.strength.augmented.value)
    const chatData = SR5_PrepareRollTest.getBaseRollData(null, holder)
    chatData.damage.value = damage.value
    chatData.damage.type = damage.type
    chatData.damage.isAttack = true
    chatData.damage.resistanceType = "physicalDamage"
    chatData.test.typeSub = "meleeWeapon"
    chatData.owner.actorId = holderId
    chatData.previousMessage.actorId = holderId

    const user = SR5_EntityHelpers.getUserOwner(held)
    if (user && user.id !== game.user.id && !user.isGM) return SR5_SocketHandler.emitForPlayer("actorRoll", {
      actorId: heldId, rollType: "resistanceCard", rollKey: null, chatData
    }, user.id)
    if (held.isOwner) return held.rollTest("resistanceCard", null, chatData)
    return SR5_SocketHandler.emitForGM("actorRoll", {
      actorId: heldId, rollType: "resistanceCard", rollKey: null, chatData
    })
  }

  static _effect(kind, role, partner, hold){
    const status = GRAPPLE_STATUSES[kind][role]
    const statusEffect = CONFIG.statusEffects.find(s => s.id === status)
    return {
      name: game.i18n.localize(statusEffect?.name ?? status),
      img: statusEffect?.img,
      statuses: [status],
      flags: {
        sr5: {
          grapple: {
            role, kind, partner, hold
          }
        }
      }
    }
  }

  //Leave the hold : both fighters lose their grappling effect (deleting one deletes the other, see onDeleteEffect)
  static async releaseHold(actorId){
    if (!game.user.isGM) return SR5_SocketHandler.emitForGM("grappleReleaseHold", {
      actorId
    })
    const actor = SR5_EntityHelpers.getRealActorFromID(actorId)
    const effect = actor?.effects.find(e => e.flags?.sr5?.grapple)
    if (effect) await effect.delete()
  }

  static async _socketStartHold(message){
    const d = message.data
    await SR5_GrappleHelpers.startHold(d.holderId, d.heldId, d.hold, d.kind)
  }

  static async _socketSetHold(message){
    await SR5_GrappleHelpers.setHold(message.data.actorId, message.data.hold)
  }

  static async _socketReleaseHold(message){
    await SR5_GrappleHelpers.releaseHold(message.data.actorId)
  }

  //GM side : when one half of the hold goes, the other goes too
  static async onDeleteEffect(effect){
    const data = effect.flags?.sr5?.grapple
    if (!data) return
    const partner = SR5_EntityHelpers.getRealActorFromID(data.partner)
    const other = partner?.effects.find(e => e.flags?.sr5?.grapple)
    if (other) await other.delete()
  }

  //GM side : a fighter knocked out or killed leaves the hold
  static async onCreateEffect(effect){
    if (!(effect.statuses.has("unconscious") || effect.statuses.has("dead"))) return
    const grapple = effect.parent?.effects?.find(e => e.flags?.sr5?.grapple)
    if (grapple) await grapple.delete()
  }

  //GM side : the end of the combat, or a token removed, ends every hold it takes part in
  static async releaseActors(actors){
    for (const actor of actors){
      if (!actor || !grappleHoldOf(actor.effects)) continue
      const grapple = actor.effects.find(e => e.flags?.sr5?.grapple)
      if (grapple) await grapple.delete()
    }
  }
}
