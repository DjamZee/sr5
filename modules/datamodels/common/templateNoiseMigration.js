/**
 * The matrix noise a template puts on the actors inside it.
 *
 * A spam or static zone adds its rating to the Noise (SR5 p. 232). Before d7b64aa66 (N32,
 * 2026-10-04) the template effect stored -rating, so every device inside it rolled more dice.
 * The effect is created once, when the token enters the template, and kept as long as it stays:
 * a world played before the fix kept the old negative value until the template was placed again.
 *
 * A template's noise is the sum of its Spam and Static ratings, never negative: a negative noise
 * on an area effect can only come from the old code, and is turned back into the rating.
 * Arbitrage de DjamZ (2026-10-06, T6) : migrer les gabarits existants.
 *
 * Called from `Item.migrateData`, so it covers every item wherever it is, unlinked tokens included.
 * @param {object} source  The raw data of an item.
 * @return {object}        The same source object.
 */
export function migrateTemplateNoise(source) {
  const system = source?.system
  if (source?.type !== "itemEffect" || system?.type !== "areaEffect" || !system.customEffects) return source
  const effects = Array.isArray(system.customEffects) ? system.customEffects : Object.values(system.customEffects)
  const noises = effects.filter(e => e?.target === "system.matrix.noise" && Number(e.value) < 0)
  if (!noises.length) return source
  for (const effect of noises) effect.value = -Number(effect.value)
  //The noise effect carries only its noise: its displayed value is that same rating
  if (effects.length === noises.length && Number(system.value) < 0) system.value = -Number(system.value)
  return source
}
