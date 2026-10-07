// Factory equipment of a vehicle or a drone (Rigger 5.0 p. 154-156).
// Pure rules, read by the actor preparation and the item price.

// R5 p. 156: the standard upgrades of the core book vehicles are already in their printed profile ("Cela
// explique la pénalité indiquée [...] cela n'augmente pas cette pénalité"). A factory mod takes up its slots
// (R5 p. 154) but its effect is not applied a second time, and it costs nothing on top of the vehicle
// (arbitrage de DjamZ, Q6 du plan rigging, 2026-10-07)

/** A mod fitted at the factory: the box of its sheet, or the flag the Mégapack writes on its copies */
export function isFactoryMod(item) {
  return item?.system?.isFactory === true || item?.flags?.sr5?.isFactory === true
}

/** A mod takes up its slots while it is fitted (active), and always when it comes from the factory */
export function modTakesSlots(itemData, factory) {
  return itemData?.isActive === true || factory === true
}

/** The effects of a mod apply while it is active, never for a factory mod: the profile already carries them */
export function modAppliesEffects(itemData, factory) {
  return itemData?.isActive === true && factory !== true
}
