// The Megapack ships in three editions with the same pack names (voie A, arbitrage de DjamZ, 16/10): the full module
// (megapack-sr5-foundry-vtt), the Lite module (megapack-sr5-lite, without the book text), and the Lite inside the
// system itself (arbitrage de DjamZ, 23/10, for the 1.0). The system reads the full module first, then the Lite module
// (kept for the transition), then its own packs.
export const MEGAPACK_FULL_ID = "megapack-sr5-foundry-vtt"
export const MEGAPACK_LITE_ID = "megapack-sr5-lite"
export const MEGAPACK_IDS = [MEGAPACK_FULL_ID, MEGAPACK_LITE_ID]
export const MEGAPACK_SYSTEM_ID = "sr5"
export const MEGAPACK_PACKS = ["sr5-megapack-items", "sr5-megapack-actors", "sr5-megapack-tables", "sr5-megapack-macros"]
// Where the system keeps the Lite's media, built by `npm run build:megapack` (not in Git)
export const SYSTEM_MEGAPACK_ROOT = "systems/sr5/megapack"
const SYSTEM_ITEMS = `${MEGAPACK_SYSTEM_ID}.${MEGAPACK_PACKS[0]}`

/** Whether the system declares its own Megapack packs (game.packs once built, the packs metadata during init). */
export function systemShipsMegapack(game = globalThis.game) {
  if (game?.packs?.get?.(SYSTEM_ITEMS)) return true
  return !!game?.data?.packs?.some?.(p => packId(p) === SYSTEM_ITEMS)
}

/**
 * The id of the active Megapack: the full module if it is active, else the Lite module, else the system when it ships
 * its own packs, else null.
 */
export function activeMegapackId(modules = globalThis.game?.modules, ships = systemShipsMegapack()) {
  return MEGAPACK_IDS.find(id => modules?.get(id)?.active) ?? (ships ? MEGAPACK_SYSTEM_ID : null)
}

/** The folder a Megapack edition keeps its media in. */
export function megapackRoot(id) {
  return id === MEGAPACK_SYSTEM_ID ? SYSTEM_MEGAPACK_ROOT : `modules/${id}`
}

/** Whether a collection id ("package.pack") is one of the Megapack's, in any edition. */
export function isMegapackCollection(collection) {
  const [packageId, name, ...rest] = String(collection ?? "").split(".")
  if (!name || rest.length) return false
  return isMegapackPackage(packageId) || (packageId === MEGAPACK_SYSTEM_ID && MEGAPACK_PACKS.includes(name))
}

/** Whether a compendium (a pack or its collection id) is one of the Megapack's, in any edition. */
export function isMegapackPack(pack) {
  return isMegapackPackage(packageOf(pack)) || isMegapackCollection(typeof pack === "string" ? pack : pack?.collection ?? packId(pack?.metadata))
}

/**
 * A compendium chosen in one edition of the Megapack, read in the active one when that one is not active: the packs
 * share their names. A world moved from the full Megapack to the Lite one kept the full one in its settings, and its
 * spirits came without a weapon or a power (manual 2.1.3, 21/10). Any other compendium is returned as it is.
 */
export function inActiveMegapack(collection, modules = globalThis.game?.modules, ships = systemShipsMegapack()) {
  if (!isMegapackCollection(collection)) return collection
  const [packageId, ...rest] = String(collection).split(".")
  const active = activeMegapackId(modules, ships)
  if (!active || packageId === active) return collection
  return [active, ...rest].join(".")
}

/** Whether a package id is one of the two Megapack modules. */
export function isMegapackPackage(id) {
  return MEGAPACK_IDS.includes(id)
}

/**
 * The Megapacks that are active but not read: the Lite one when both are. Their packs hold the same items, with the
 * same _id, as the active one's, so a list of every pack shows each item twice (Maëlle#3381, 16/10: 5 776 shop rows
 * for 2 888 items). Empty when at most one Megapack is active. The system's own packs are never shadowed: they are
 * taken out at init when a module is active (hideSystemMegapack).
 */
export function shadowedMegapackIds(modules = globalThis.game?.modules) {
  const active = activeMegapackId(modules, false)
  return MEGAPACK_IDS.filter(id => id !== active && modules?.get(id)?.active)
}

/** The collection id of a pack's metadata. */
function packId(metadata) {
  return metadata?.id ?? (metadata?.name ? `${metadata.packageName ?? metadata.package}.${metadata.name}` : null)
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

/**
 * The packs metadata without the system's Megapack packs when a Megapack module is active: the module's packs hold
 * the same documents, so they would show twice in the compendium bar, the browser, the shop and the searches.
 * Ownership would hide them from the players only, never from the GM.
 */
export function withoutSystemMegapack(packsData, modules = globalThis.game?.modules) {
  const list = [...(packsData ?? [])]
  if (!MEGAPACK_IDS.some(id => modules?.get(id)?.active)) return list
  return list.filter(p => !(packId(p) === `${MEGAPACK_SYSTEM_ID}.${p.name}` && MEGAPACK_PACKS.includes(p.name)))
}

/**
 * The compendium UUID redirects (CONFIG.compendium.uuidRedirects, Foundry V13) that send the links of every other
 * edition to the active one: same pack names, same _id. A world that drew its actors from the Lite module keeps its
 * links once the module is gone; a document drawn from the system's packs follows the full Megapack once it is active.
 */
export function megapackUuidRedirects(modules = globalThis.game?.modules, ships = systemShipsMegapack()) {
  const active = activeMegapackId(modules, ships)
  const redirects = {
  }
  if (!active) return redirects
  const others = [...MEGAPACK_IDS, MEGAPACK_SYSTEM_ID].filter(id => id !== active && !modules?.get(id)?.active)
  for (const id of others) {
    for (const name of MEGAPACK_PACKS) redirects[`Compendium.${id}.${name}`] = `Compendium.${active}.${name}`
  }
  return redirects
}

// The media of the Lite module, and where the system keeps the same files
export const LITE_MEDIA_PREFIX = `modules/${MEGAPACK_LITE_ID}/`
export const SYSTEM_MEDIA_PREFIX = `${SYSTEM_MEGAPACK_ROOT}/`

/**
 * The update that sends a document's Lite module media to the system's copy: each string under its dotted key, an
 * array holding one whole under its key (an update cannot address an array element). The embedded collections named
 * in `skip` are left out: they are updated as documents of their own. Empty when nothing points at the Lite module.
 */
export function litePathUpdate(data, skip = []) {
  const update = {
  }
  const walk = (value, key) => {
    if (typeof value === "string") {
      if (value.includes(LITE_MEDIA_PREFIX)) update[key] = value.replaceAll(LITE_MEDIA_PREFIX, SYSTEM_MEDIA_PREFIX)
    } else if (Array.isArray(value)) {
      const json = JSON.stringify(value)
      if (json.includes(LITE_MEDIA_PREFIX)) update[key] = JSON.parse(json.replaceAll(LITE_MEDIA_PREFIX, SYSTEM_MEDIA_PREFIX))
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (!key && (skip.includes(k) || k === "_id" || k === "_stats")) continue
        walk(v, key ? `${key}.${k}` : k)
      }
    }
  }
  walk(data, "")
  return update
}

/**
 * At init, before Foundry builds game.packs: take the system's Megapack packs out when a module is active, and send
 * the other editions' links to the active one.
 */
export function installSystemMegapack(game = globalThis.game, config = globalThis.CONFIG) {
  const ships = systemShipsMegapack(game)
  if (game?.data?.packs) game.data.packs = withoutSystemMegapack(game.data.packs, game.modules)
  if (config?.compendium) {
    config.compendium.uuidRedirects ??= {
    }
    Object.assign(config.compendium.uuidRedirects, megapackUuidRedirects(game?.modules, ships))
  }
}
