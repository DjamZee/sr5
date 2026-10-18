// Vulcan Systems « Hot-Drop » rapid-egress jetpack (Street Lethal p. 57-59): « propulser vers le haut un sujet […]
// d'environ cinquante mètres en hauteur ou soixante-quinze en arc de cercle vers l'avant. Ils permettent également à
// un sujet de descendre en toute sécurité sur une centaine de mètres. » Note : « Utilisez Chute Libre pour manœuvrer.
// Le réservoir du dispositif permet 20 utilisations. » The book gives no threshold: the gamemaster sets it.

/** The value the gear carries in its system effects (category "specialCase"). */
export const HOT_DROP_EFFECT = "hotDrop"

/** The distances of a jump, in meters (Street Lethal p. 58). */
export const HOT_DROP_DISTANCES = {
  up: 50, arc: 75, down: 100
}

/** The uses a full tank holds (Street Lethal p. 59). */
export const HOT_DROP_USES = 20

/** The first active gear of the items with the Hot-Drop effect, or null. */
export function hotDropGear(items){
  for (const item of items ?? []){
    if (item?.type !== "itemGear" || item?.system?.isActive === false) continue
    const effects = item.system.systemEffects
    const list = Array.isArray(effects) ? effects : Object.values(effects ?? {
    })
    if (list.some(e => e?.value === HOT_DROP_EFFECT)) return item
  }
  return null
}

/**
 * One jump spends one use. The counter never blocks the jump: an empty tank only warns.
 * @param {number} charge the uses left before the jump
 * @returns {{charge: number, empty: boolean}} the uses left after it, and whether the tank was already empty
 */
export function hotDropSpend(charge){
  const left = Math.max(0, Math.floor(Number(charge) || 0))
  return {
    charge: Math.max(0, left - 1), empty: left === 0
  }
}
