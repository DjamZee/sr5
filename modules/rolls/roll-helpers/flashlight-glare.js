// Run & Gun p. 69, weapon flashlight: "Une personne prise dans le rayon d'une lampe torche adaptée à sa vision souffre
// d'un modificateur d'éblouissement faible (p. 175, SR5)". The one the weapon points at is the target of its shot: on
// its defense, weak glare at least (row 1 of the Light / Glare column, SR5 p. 176). A standard flashlight is visible
// light, seen by everyone; a low-light one is seen with low-light vision only, an infrared one with thermographic
// vision only (same page).

export const FLASHLIGHT_KINDS = ["flashLight", "flashLightLowLight", "flashLightInfrared"]

//The row of weak glare
export const WEAK_GLARE = 1

/**
 * The kinds of flashlight lit on the weapon: its active accessories, read with `effectOf` (SR5_UtilityItem.weaponAccessoryEffect).
 * @returns {string[]}
 */
export function weaponLightKinds(weaponData, effectOf) {
  if (!weaponData?.isActive) return []
  let accessories = weaponData.accessory
  if (accessories && typeof accessories === "object" && !Array.isArray(accessories)) accessories = Object.values(accessories)
  if (!Array.isArray(accessories)) return []
  const kinds = accessories.filter(a => a?.isActive).map(a => effectOf(a)).filter(kind => FLASHLIGHT_KINDS.includes(kind))
  return [...new Set(kinds)]
}

/** Whether one of these flashlights dazzles a defender with these visions */
export function flashlightDazzles(kinds, visions) {
  return (kinds ?? []).some(kind => kind === "flashLight" ||
    (kind === "flashLightLowLight" && !!visions?.lowLight?.isActive) ||
    (kind === "flashLightInfrared" && !!visions?.thermographic?.isActive))
}
