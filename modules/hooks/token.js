import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_EffectArea
} from "../system/effectArea.js"
import {
  SR5_Jammer
} from "../system/jammer.js"

export async function sr5HookCreateToken(tokenDocument) {
  if (!game.user.isGM) return
  let tokenData = foundry.utils.duplicate(tokenDocument)
  if (tokenData.texture.src == "") tokenData.texture.src = tokenDocument.actor.img
  tokenData = await SR5_EntityHelpers.getVisionData(tokenData, tokenDocument.actor, tokenDocument.parent)
  await tokenDocument.update(tokenData)
}

export async function sr5HookUpdateToken(tokenDocument, change) {
  // A coordinate of 0 is a move too (the left or top edge of the scene)
  if ("x" in change || "y" in change) {
    SR5_EffectArea.tokenAura(tokenDocument)
    if (game.user.isGM) SR5_EffectArea.checkIfTokenIsInTemplate(tokenDocument)
    //A physical jammer's noise depends on the distance (SR5 p. 443): measured again whoever moved
    SR5_Jammer.refreshScene(tokenDocument.parent)
  }
}

//A token gone takes its area jammer with it, and leaves the noise others gave it behind
export function sr5HookDeleteToken(tokenDocument) {
  SR5_Jammer.refreshScene(tokenDocument.parent)
  if (tokenDocument.actor && !tokenDocument.actorLink) SR5_Jammer.syncActor(tokenDocument.actor, new Map())
}

export function sr5HookPreDeleteToken(tokenDocument, _options, _userId) {
  let deleteToken = canvas.tokens.get(tokenDocument.id)
  if (!deleteToken) return
  // GSAP/TweenMax was removed in Foundry v12+; no animation cleanup needed
}
