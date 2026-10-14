/**
 * What an actor or an item exported from Foundry V12 (system 12.0.5) still carries.
 *
 * The world migration (migration.js) fixes these once, when a V12 world is opened as V13; an actor
 * imported later ("Import Data"), or read from a compendium, never goes through it. Lot 44: an actor
 * exported from V12 and imported in V13 lost its description, kept the V12 icons of its items (the
 * folder img/ became assets/img/) and the mental limit of Locksmith.
 *
 * Called from `Actor.migrateData` and `Item.migrateData`, so it covers every document wherever it is,
 * a V12 world opened as V13 included.
 */

const LEGACY_IMG = "systems/sr5/img/"
const CURRENT_IMG = "systems/sr5/assets/img/"

/** A V12 path of the system's images, moved to assets/img/; any other path is left as is */
export function migrateLegacyImgPath(path) {
  return typeof path === "string" && path.startsWith(LEGACY_IMG) ? CURRENT_IMG + path.slice(LEGACY_IMG.length) : path
}

/**
 * The image of a document, and of its prototype token for an actor.
 * @param {object} source  The raw data of an actor or an item.
 * @return {object}        The same source object.
 */
export function migrateLegacyImages(source) {
  if (!source || typeof source !== "object") return source
  if (source.img) source.img = migrateLegacyImgPath(source.img)
  const texture = source.prototypeToken?.texture
  if (texture?.src) texture.src = migrateLegacyImgPath(texture.src)
  return source
}

/**
 * The V12 sheet wrote the description of an actor in `system.characterDescription`; the V13 sheet
 * reads `system.biography.description`. The old text is taken only when the new one is empty.
 * @param {object} system  The raw system data of an actor.
 * @return {object}        The same system object.
 */
export function migrateLegacyDescription(system) {
  if (!system || typeof system !== "object" || !("characterDescription" in system)) return system
  const legacy = system.characterDescription
  if (legacy && typeof legacy === "string") {
    if (!system.biography || typeof system.biography !== "object") system.biography = {
    }
    if (!system.biography.description) system.biography.description = legacy
  }
  delete system.characterDescription
  return system
}

/** Whether a document was last written by the system before V13 (its _stats say so); unknown = not legacy */
export function isLegacySource(source) {
  const version = source?._stats?.systemVersion
  if (!version || typeof version !== "string") return false
  return Number.parseInt(version, 10) < 13
}

/**
 * Locksmith used the mental limit up to V12; an Agility skill (SR5 p. 148) uses the physical limit.
 * Only a document written before V13 is changed: a value set in V13 stays as it is.
 * @param {object} source  The raw data of an actor.
 * @return {object}        The same source object.
 */
export function migrateLocksmithLimit(source) {
  if (!isLegacySource(source)) return source
  const limit = source.system?.skills?.locksmith?.limit
  if (limit?.base === "mentalLimit") limit.base = "physicalLimit"
  return source
}
