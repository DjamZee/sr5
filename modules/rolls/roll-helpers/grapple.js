import {
  SR5_EntityHelpers
} from "../../entities/helpers.js"
import {
  SR5_SocketHandler
} from "../../socket.js"
import {
  grappleHoldOf, canStartHold, GRAPPLE_STATUSES
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
    ChatMessage.create({
      content: game.i18n.format("SR5.GrappleHoldTaken", {
        holder: holder.name, held: held.name, hold
      })
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
