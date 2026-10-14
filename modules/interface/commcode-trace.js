// Trace Icon succeeded (SR5 p. 246): "la position réelle de la cible est découverte, et reste connue tant que le
// personnage a encore au moins une mark sur cette dernière". The button of the defense card (lot 14) tells the hacker
// and the gamemaster where the target stands, and points at it when it is on the scene shown.

/**
 * @param {Object} target   the traced actor
 * @param {Object} hacker   the actor who traced it
 */
export async function locateTraced(target, hacker){
  if (!target) return ui.notifications?.warn(game.i18n.localize("SR5.COMMCODE_Refused_unknown"))
  const token = target.isToken ? target.token : target.getActiveTokens?.(false, true)?.[0] ?? null
  const scene = token?.parent ?? null
  const content = scene ? game.i18n.format("SR5.COMMCODE_TraceFound", {
    target: target.name, scene: scene.name, hacker: hacker?.name ?? ""
  }) : game.i18n.format("SR5.COMMCODE_TraceNowhere", {
    target: target.name
  })
  const whisper = [...new Set([game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)])]
  await ChatMessage.create({
    content: `<p><i class="fas fa-location-crosshairs"></i> ${content}</p>`, whisper,
    speaker: ChatMessage.getSpeaker({
      actor: hacker ?? undefined
    }),
  })
  if (!token || globalThis.canvas?.scene?.id !== scene?.id) return
  const center = {
    x: token.x + (token.width * scene.grid.size) / 2, y: token.y + (token.height * scene.grid.size) / 2
  }
  // Not awaited: an animation waits for the screen, and a hidden window would hold the button's handler
  canvas.ping?.(center)
  canvas.animatePan?.(center)
}
