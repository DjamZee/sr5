// SR5 p. 178: progressive recoil carries over "from one action phase and combat turn to the next".
// Outside a combat there are no action phases: each shot stands alone and nothing carries over.
export function isRecoilCarriedOver(actor, combat = globalThis.game?.combat){
  if (!combat) return false
  if (actor.isToken) return combat.combatants.some(c => c.tokenId === actor.token?.id)
  // An unlinked token fights with its own actor: the base actor's sheet is outside the combat,
  // and the combat's resets never reach it
  return combat.combatants.some(c => c.actorId === actor.id && c.token?.actorLink !== false)
}

// SR5 p. 177-178: recoil is the force of a firearm shooting, counted in rounds fired. SR5 p. 180: single-shot (SS)
// and suppressive fire (SF) have no recoil. A weapon with no firing mode (bow, thrown weapon) builds none either
export function buildsProgressiveRecoil(firingMode){
  return ["SA", "BF", "FA", "SB", "LB", "FAc"].includes(firingMode)
}
