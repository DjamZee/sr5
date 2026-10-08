// Factory equipment and vehicle equipment of a vehicle or a drone (Rigger 5.0 p. 154-156).
// Pure rules, read by the actor preparation, the item price, the drone sheet and the recall of a drone.

// R5 p. 156: the standard upgrades of the core book vehicles are already in their printed profile ("Cela
// explique la pénalité indiquée [...] cela n'augmente pas cette pénalité"). A factory mod is free: it takes up
// neither slots nor Modification Points (R5 p. 191, Body without (Y): a new Steel Lynx keeps its 6 points), its
// effect is not applied a second time, and it costs nothing on top of the vehicle (arbitrage de DjamZ du 08/10,
// which replaces Q6 of the rigging plan of 07/10, « l'équipement d'origine occupe ses emplacements »)

/** Vehicle equipment (R5 p. 154-156) is plain gear carried aboard, not a mod: kits (p. 156), scanners,
 *  jammers, commlinks. It goes out with a deployed drone and comes back with it */
export function carriedGear(items) {
  return Array.from(items ?? []).filter(i => i?.type === "itemGear")
}

/** A mod fitted at the factory: the box of its sheet, or the flag the Mégapack writes on its copies */
export function isFactoryMod(item) {
  return item?.system?.isFactory === true || item?.flags?.sr5?.isFactory === true
}

/** A mod takes up its slots (or its points) while it is fitted (active), never when it comes from the factory */
export function modTakesSlots(itemData, factory) {
  return itemData?.isActive === true && factory !== true
}

/** The printed profile is the vehicle's attributes (Handling, Speed, Acceleration, Body, Armor, Pilot, Sensor,
 *  Seats): a factory mod's effect on one of them is already counted. What the system works out from them (the
 *  condition monitor a drone arm adds a box to, R5 p. 129) is not printed, and the effect still applies */
export function factorySkipsEffect(factory, effect) {
  return factory === true && typeof effect?.target === "string" && effect.target.startsWith("system.attributes.")
}
