import {
  SR5_SpiritTypes
} from "../items/spirit-types.js"

/**
 * Default pictures of spirits (DjamZ's ruling, 14/10: his own Midjourney pictures, free to use). A spirit gets the
 * portrait and the token of its type and size tier, built by tools/spirits-images.mjs into assets/img/spirits/<type>/.
 * Tiers are DjamZ's postulate, the book does not tie size to Force: Small 1-3, Medium 4-6, Large 7-9, Colossal 10+.
 * A picture the gamemaster chose is never overwritten: only a spirit whose portrait AND token are still a default
 * (Foundry's, the system's icon, or one set here) is given new ones. A custom type (itemSpiritType) takes the pictures
 * of the official type it is based on. A type without pictures yet (insect spirits, shedim, watcher…) keeps its own.
 * Toxic, shadow and blood spirits added on 21/10 (Rémi#2846).
 */
export const SPIRIT_IMAGE_DIR = "systems/sr5/assets/img/spirits"

/** Official types that have pictures; another family = its folder and its key here. */
export const SPIRIT_IMAGE_TYPES = new Set(["air", "beasts", "earth", "fire", "guardian", "guidance", "man", "plant", "task", "water",
  "abomination", "barren", "noxious", "nuclear", "plague", "sludge",
  "shadowMuse", "shadowNightmare", "shadowShade", "shadowSuccubus", "shadowWraith", "blood"])

const DEFAULT_IMAGES = new Set([
  "", "icons/svg/mystery-man.svg",
  "systems/sr5/assets/img/actors/actorSpirit.svg",
  "systems/sr5/assets/img/items/itemSpirit.svg",
])

/** 1 Small (Force 1-3), 2 Medium (4-6), 3 Large (7-9), 4 Colossal (10+); no Force counts as Small. */
export function spiritImageTier(force) {
  const f = Number(force) || 0
  if (f >= 10) return 4
  return Math.max(1, Math.ceil(f / 3))
}

/** Whether a picture is a default one, which this code may replace. */
export function isDefaultSpiritImage(img) {
  if (img == null) return true
  return DEFAULT_IMAGES.has(img) || img.startsWith(`${SPIRIT_IMAGE_DIR}/`)
}

/**
 * The type whose pictures a spirit uses: its own, or the official type a custom one is based on.
 * @param {string} type An actor's system.type
 * @param {(type: string) => string} [baseOf] resolves a custom type to its base (SR5_SpiritTypes.baseType)
 */
export function spiritImageType(type, baseOf = (t) => SR5_SpiritTypes.baseType(t)) {
  if (SPIRIT_IMAGE_TYPES.has(type)) return type
  const base = type ? baseOf(type) : ""
  return SPIRIT_IMAGE_TYPES.has(base) ? base : null
}

/** { portrait, token } for a type and a Force, or null when the type has no pictures. */
export function defaultSpiritImages(type, force, baseOf) {
  const key = spiritImageType(type, baseOf)
  if (!key) return null
  const tier = spiritImageTier(force)
  return {
    portrait: `${SPIRIT_IMAGE_DIR}/${key}/portrait-${tier}.webp`,
    token: `${SPIRIT_IMAGE_DIR}/${key}/token-${tier}.webp`,
  }
}

/**
 * The changes that give a spirit its default pictures, or null: none when either picture is the gamemaster's, when
 * the type has none, or when they are already in place.
 * @param {{img?: string, token?: string, type: string, force: number}} spirit
 */
export function spiritImageChanges({
  img, token, type, force 
}, baseOf) {
  if (!isDefaultSpiritImage(img) || !isDefaultSpiritImage(token)) return null
  const images = defaultSpiritImages(type, force, baseOf)
  if (!images || (images.portrait === img && images.token === token)) return null
  return {
    img: images.portrait, "prototypeToken.texture.src": images.token 
  }
}

function enabled() {
  try {
    return game.settings.get("sr5", "sr5SpiritDefaultImages") !== false
  } catch {
    return true
  }
}

/** preCreateActor: a spirit made by hand, summoned from a sheet or taken from a compendium. */
export function spiritImageOnCreate(document) {
  if (document.type !== "actorSpirit" || !enabled()) return
  const src = document._source
  const changes = spiritImageChanges({
    img: src.img, token: src.prototypeToken?.texture?.src, type: src.system?.type, force: src.system?.force?.base,
  })
  if (changes) document.updateSource(changes)
}

/** preUpdateActor: a type or a Force changed on a spirit whose pictures are still the default ones. */
export function spiritImageOnUpdate(document, changes) {
  if (document.type !== "actorSpirit" || !enabled()) return
  const flat = foundry.utils.flattenObject(changes)
  if (!("system.type" in flat) && !("system.force.base" in flat) && !("system.force" in flat)) return
  //The update sets a picture of its own: it is the user's. A sheet sends its whole form, the unchanged picture with it
  const img = document._source.img, token = document._source.prototypeToken?.texture?.src
  if (("img" in flat && flat.img !== img) || ("prototypeToken.texture.src" in flat && flat["prototypeToken.texture.src"] !== token)) return
  const type = flat["system.type"] ?? document._source.system?.type
  const force = flat["system.force.base"] ?? flat["system.force"]?.base ?? document._source.system?.force?.base
  const pictures = spiritImageChanges({
    img, token, type, force 
  })
  if (!pictures) return
  delete changes.img
  delete changes["prototypeToken.texture.src"]
  foundry.utils.mergeObject(changes, foundry.utils.expandObject(pictures))
}

/**
 * updateActor: the spirit's tokens already on a scene take the new token picture, when theirs is still a default.
 * Written once, by the user who made the update.
 */
export async function spiritImageOnTokens(actor, changes, options, userId) {
  if (actor.type !== "actorSpirit" || userId !== game.user?.id) return
  const src = foundry.utils.getProperty(changes, "prototypeToken.texture.src")
  if (!src || !src.startsWith(`${SPIRIT_IMAGE_DIR}/`)) return
  for (const token of actor.getActiveTokens(false, true)) {
    if (token.texture?.src === src || !isDefaultSpiritImage(token.texture?.src)) continue
    await token.update({
      "texture.src": src 
    })
  }
}
