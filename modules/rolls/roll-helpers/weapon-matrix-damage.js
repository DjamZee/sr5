// DSP weapons, MCT (Street Lethal p. 56-57): "Cette arme inflige des dommages matriciels, qui doivent être reportés
// sur le moniteur de condition correspondant. Ils sont résistés avec Indice d'Appareil + Firewall" (decision H6 of
// DjamZ). The pulse "cible spécifiquement un dispositif ou un système par le biais de sa connexion sans fil" (p. 56):
// - a character is hit through the device running its persona (the active device, as for any matrix damage,
//   SR5 p. 229); a technomancer takes it as Stun, resisted with "Indice d'appareil + Firewall de leur persona
//   incarné" (SR5 p. 230: the living persona's Device Rating is the Resonance);
// - a drone, a vehicle or a device actor takes it on its own matrix monitor;
// - anything else (no active device, a spirit, a sprite, an agent, an AI outside any device) has no matrix
//   monitor in reach: no effect. The book does not say it: the gamemaster's ruling, as written in the wiki.
// The weapon is defended as any weapon; its resistance and its damage go through the matrix chain already there
// (rollData-MatrixResistance, test-MatrixResistance, SR5_MatrixHelpers.applyDamageToDecK).

/** The weapon damage type the DSP weapons carry, besides "physical" and "stun". */
export const WEAPON_MATRIX_DAMAGE = "matrix"

/** Carried by the resistance cards of a DSP hit (damage.fromWeapon): a matrix attack never sets it. */
export function isWeaponPulse(damage) {
  return !!damage?.fromWeapon
}

/** Whether `actor` has a matrix monitor a DSP pulse reaches (see above). */
export function hasMatrixMonitorInReach(actor) {
  if (!actor) return false
  if (actor.type === "actorDrone" || actor.type === "actorDevice") return true
  if (actor.type !== "actorPc" && actor.type !== "actorGrunt") return false
  return !!actor.items?.find(i => i.type === "itemDevice" && i.system?.isActive)
}

/**
 * The resistance button of a hit by a DSP weapon, instead of the damage resistance: the matrix resistance, with the
 * damage value of the hit, or the end of the test when nothing is in reach.
 * @param {object} cardData the defense (or grenade) card, its damage value computed
 * @param {Actor} actor the one hit
 * @param {Function} button SR5_RollMessage.generateChatButton
 */
export function weaponMatrixResistance(cardData, actor, button) {
  if (!hasMatrixMonitorInReach(actor)) {
    cardData.chatCard.buttons.actionEnd = button("SR-CardButtonHit endTest", "", game.i18n.localize("SR5.WeaponMatrixDamageNoDevice"))
    return
  }
  cardData.damage.matrix.value = cardData.damage.value
  cardData.damage.fromWeapon = true
  if (cardData.damage.value > 0) cardData.chatCard.buttons.matrixResistance = button("nonOpposedTest", "matrixResistance",
    `${game.i18n.localize("SR5.TakeOnDamageMatrix")} (${cardData.damage.value})`)
}
