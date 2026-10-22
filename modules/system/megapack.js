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

/**
 * A compendium chosen in one edition of the Megapack, read in the active one when only the other is active: the packs
 * share their names. A world moved from the full Megapack to the Lite one kept the full one in its settings, and its
 * spirits came without a weapon or a power (manual 2.1.3, 21/10). Any other compendium is returned as it is.
 */
export function inActiveMegapack(collection, modules = globalThis.game?.modules) {
  const [packageId, ...rest] = String(collection ?? "").split(".")
  if (!rest.length || !isMegapackPackage(packageId) || modules?.get(packageId)?.active) return collection
  const active = activeMegapackId(modules)
  return active ? [active, ...rest].join(".") : collection
}

/** Whether a package id is one of the two Megapacks. */
export function isMegapackPackage(id) {
  return MEGAPACK_IDS.includes(id)
}

/**
 * The Megapacks that are active but not read: the Lite one when both are. Their packs hold the same items, with the
 * same _id, as the active one's, so a list of every pack shows each item twice (Maëlle#3381, 16/10: 5 776 shop rows
 * for 2 888 items). Empty when at most one Megapack is active.
 */
export function shadowedMegapackIds(modules = globalThis.game?.modules) {
  const active = activeMegapackId(modules)
  return MEGAPACK_IDS.filter(id => id !== active && modules?.get(id)?.active)
}

/** The package a compendium belongs to: its metadata, else the head of its collection id ("module.pack"). */
function packageOf(pack) {
  if (typeof pack === "string") return pack.split(".")[0]
  return pack?.metadata?.packageName ?? pack?.metadata?.package ?? pack?.collection?.split(".")[0] ?? null
}

/** Is this compendium (a pack or its collection id) one of a Megapack shadowed by the active one? */
export function isShadowedMegapackPack(pack, modules = globalThis.game?.modules) {
  return shadowedMegapackIds(modules).includes(packageOf(pack))
}

/** The packs without those of the shadowed Megapack: the list to read when every item must appear once. */
export function withoutShadowedMegapack(packs, modules = globalThis.game?.modules) {
  const shadowed = shadowedMegapackIds(modules)
  const list = [...(packs ?? [])]
  return shadowed.length ? list.filter(pack => !shadowed.includes(packageOf(pack))) : list
}
