import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_EffectArea
} from "../system/effectArea.js"

export async function sr5HookCreateToken(tokenDocument) {
  if (!game.user.isGM) return
  let tokenData = foundry.utils.duplicate(tokenDocument)
  if (tokenData.texture.src == "") tokenData.texture.src = tokenDocument.actor.img
  tokenData = await SR5_EntityHelpers.getVisionData(tokenData, tokenDocument.actor)
  await tokenDocument.update(tokenData)
}

export async function sr5HookUpdateToken(tokenDocument, change) {
  // A coordinate of 0 is a move too (the left or top edge of the scene)
  if ("x" in change || "y" in change) {
    SR5_EffectArea.tokenAura(tokenDocument)
    if (game.user.isGM) SR5_EffectArea.checkIfTokenIsInTemplate(tokenDocument)
  }
}

export function sr5HookPreDeleteToken(tokenDocument, _options, _userId) {
  let deleteToken = canvas.tokens.get(tokenDocument.id)
  if (!deleteToken) return
  // GSAP/TweenMax was removed in Foundry v12+; no animation cleanup needed
}
