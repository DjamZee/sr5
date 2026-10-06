import {
  SR5_ActorHelper
} from "../entities/actors/entityActor-helpers.js"
import {
  SR5Combat
} from "../system/srcombat.js"
import {
  SR5_EffectArea
} from "../system/effectArea.js"
import {
  SR5_GrappleHelpers
} from "../rolls/roll-helpers/grapple.js"

export async function sr5HookDeleteActiveEffect(effect, options, userId) {
  if (!game.user.isGM ) return
  if (effect.flags?.sr5?.grapple) await SR5_GrappleHelpers.onDeleteEffect(effect, userId)
  //Every GM runs this hook: the active one alone spends the action of standing up, or two GMs spent it twice
  if (effect.statuses.has("prone") && game.users?.activeGM?.isSelf){
    let itemEffect = effect.parent.items.find(i => i.type === "itemEffect" && i.system.type === "prone")
    let actorId = (effect.parent.isToken ? effect.parent.token.id : effect.parent.id)
    if (itemEffect) await SR5_ActorHelper.deleteItemEffectLinkedToActiveEffect(actorId, itemEffect.id)
    SR5Combat.changeActionInCombat(actorId, [{
      type: "simple", value: 1, source: "standUp"
    }])
  }
}

export function sr5HookCreateActiveEffect(effect) {
  if (!game.user.isGM ) return
  if (SR5_GrappleHelpers.isActive()) SR5_GrappleHelpers.onCreateEffect(effect)
  let actorId = (effect.parent.isToken ? effect.parent.token.id : effect.parent.id)
  if (effect.statuses.has("signalJam")) SR5_EffectArea.onJamCreation(actorId)
  //Taking cover costs one simple action, spent by the active GM alone: with two GMs it was spent twice
  if (!game.users?.activeGM?.isSelf) return
  if ((effect.statuses.has("cover") || effect.statuses.has("coverFull")) && game.combat) SR5Combat.changeActionInCombat(actorId, [{
    type: "simple", value: 1, source: "takeCover"
  }])
}
