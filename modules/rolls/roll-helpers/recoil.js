// SR5 p. 178: progressive recoil carries over "from one action phase and combat turn to the next".
// Outside a combat there are no action phases: each shot stands alone and nothing carries over.
export function isRecoilCarriedOver(actor, combat = globalThis.game?.combat){
  if (!combat) return false
  if (actor.isToken) return combat.combatants.some(c => c.tokenId === actor.token?.id)
  // An unlinked token fights with its own actor: the base actor's sheet is outside the combat,
  // and the combat's resets never reach it
  return combat.combatants.some(c => c.actorId === actor.id && c.token?.actorLink !== false)
}
