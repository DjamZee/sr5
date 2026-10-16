// The Megapack ships in two editions with the same pack names (voie A, arbitrage de DjamZ, 16/10): the full one
// (megapack-sr5-foundry-vtt) and the Lite one (megapack-sr5-lite, without the book text). The system reads
// whichever is active, the full one first when both are.
export const MEGAPACK_FULL_ID = "megapack-sr5-foundry-vtt"
export const MEGAPACK_LITE_ID = "megapack-sr5-lite"
export const MEGAPACK_IDS = [MEGAPACK_FULL_ID, MEGAPACK_LITE_ID]

/** The id of the active Megapack: the full one if it is active, else the Lite one, else null. */
export function activeMegapackId(modules = globalThis.game?.modules) {
  return MEGAPACK_IDS.find(id => modules?.get(id)?.active) ?? null
}

/** Whether a package id is one of the two Megapacks. */
export function isMegapackPackage(id) {
  return MEGAPACK_IDS.includes(id)
}
