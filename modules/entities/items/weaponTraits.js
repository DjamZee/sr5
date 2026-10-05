// Weapon traits from Gun H(e)aven 3 p. 3 and The Complete Trog p. 177.
// Pure helpers, kept apart from the item preparation so the tests can reach them.

/** Does the weapon carry this catalog accessory or trait? */
export function hasWeaponTrait(weaponData, key) {
  let accessories = weaponData?.accessory
  if (!accessories) return false
  if (!Array.isArray(accessories)) accessories = Object.values(accessories)
  return accessories.some(a => a?.name === key)
}

/**
 * Vintage (GH3 p. 3): "not compatible with modern electronics […] Physical upgrades are possible,
 * but adding them […] costs twice the normal listed amount". Traits themselves stay free.
 */
export function vintageAccessoryPrice(price, accessoryType, isVintage) {
  if (!isVintage || accessoryType === "trait") return price
  return price * 2
}

/** Vintage weapons can never go wireless: their wireless bonuses never apply. */
export function applyVintageWireless(weaponData) {
  if (!hasWeaponTrait(weaponData, "vintage")) return false
  weaponData.isWireless = false
  weaponData.wirelessTurnedOn = false
  return true
}

/**
 * Cap & Ball (GH3 p. 3): "three Complex Actions to reload each round". In combat each click spends
 * one Complex Action; the round goes in on the third. Returns the next step and whether a round is loaded.
 */
export const CAP_BALL_STEPS = 3
export function capBallReloadStep(previousStep) {
  const step = (Number(previousStep) || 0) + 1
  if (step >= CAP_BALL_STEPS) return {
    step: 0, done: CAP_BALL_STEPS, loaded: 1 
  }
  return {
    step, done: step, loaded: 0 
  }
}

/**
 * Osmium mace (The Complete Trog p. 177): Accuracy 3 and (STR+2)P with STR 4 or less,
 * Accuracy 5 and (STR+6)P with STR 7 or more; the listed 4 and (STR+4)P in between.
 * Returns null when the listed profile applies.
 */
export function osmiumProfile(strength) {
  if (strength <= 4) return {
    accuracy: 3, damageBonus: 2 
  }
  if (strength >= 7) return {
    accuracy: 5, damageBonus: 6 
  }
  return null
}
