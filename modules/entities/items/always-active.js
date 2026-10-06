// Powers that need no action to work: « Certains sont toujours actifs et ne nécessitent donc aucune action pour
// leur activation ; ils sont listés avec une action automatique » (SR5 p. 396). The system's own "permanent" says
// the same. Such a power is switched on wherever the system gives it: at the creation of a spirit or a sprite, when
// it is dropped on a sheet, and by the GM macro for the sheets made before (arbitrage de DjamZ, H39).
export const ALWAYS_ACTIVE_ACTIONS = ["automatic", "permanent"]

// The item types whose action decides it
export const ACTION_DRIVEN_TYPES = ["itemPower", "itemSpritePower", "itemAdeptPower", "itemMartialArt"]

export function isAlwaysActive(item) {
  return ACTION_DRIVEN_TYPES.includes(item?.type) && ALWAYS_ACTIVE_ACTIONS.includes(item?.system?.actionType)
}
