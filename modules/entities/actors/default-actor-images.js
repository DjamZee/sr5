import {
  CONTACT_IMAGES
} from "./contact-images-list.js"

/**
 * Default pictures of IC, sprites and contacts (DjamZ's own Midjourney pictures, free to use), on the model of the
 * spirits' (spirit-default-image.js), built by tools/default-images.mjs into assets/img/<family>/.
 * - an IC (actorDevice of deviceType "ice") gets the portrait and token of its deviceSubType;
 * - a sprite gets those of its type (one picture per type, whatever its Level);
 * - a contact brought to life from its item gets one of the contact pictures, picked by metatype, gender and job (the
 *   item's free "type" text) when they match, at random otherwise; the draw is seeded by the item's id, so the same
 *   contact gets the same face each time it is called. A named character (a fixer of DjamZ's…) only comes on a job match.
 * A picture the gamemaster chose is never overwritten: only an actor whose portrait AND token are still a default
 * (Foundry's, the system's icon, or one set here) is given new ones. Each family has its world setting, on by default.
 */
export const IMAGE_DIR = "systems/sr5/assets/img"
export const ICE_IMAGE_DIR = `${IMAGE_DIR}/ice`
export const SPRITE_IMAGE_DIR = `${IMAGE_DIR}/sprites`
export const CONTACT_IMAGE_DIR = `${IMAGE_DIR}/contacts`

export const ICE_IMAGE_TYPES = new Set(["iceAcid", "iceBinder", "iceBlack", "iceBlaster", "iceBloodhound", "iceBlueGoo",
  "iceCatapult", "iceCrash", "iceFlicker", "iceJammer", "iceKiller", "iceMarker", "icePatrol", "iceProbe", "iceScramble",
  "iceShocker", "iceSparky", "iceSleuther", "iceTarBaby", "iceTrack"])
export const SPRITE_IMAGE_TYPES = new Set(["companion", "courier", "crack", "data", "fault", "generalist", "machine"])

const DEFAULT_IMAGES = new Set([
  "", "icons/svg/mystery-man.svg",
  `${IMAGE_DIR}/actors/actorDevice.svg`, `${IMAGE_DIR}/actors/actorSprite.svg`, `${IMAGE_DIR}/actors/actorGrunt.svg`,
  `${IMAGE_DIR}/items/itemSprite.svg`, `${IMAGE_DIR}/items/itemContact.svg`,
])
const OWN_DIRS = [ICE_IMAGE_DIR, SPRITE_IMAGE_DIR, CONTACT_IMAGE_DIR]

/** Whether a picture is a default one, which this code may replace. */
export function isDefaultActorImage(img) {
  if (img == null) return true
  return DEFAULT_IMAGES.has(img) || OWN_DIRS.some((d) => img.startsWith(`${d}/`))
}

/** { portrait, token } of an IC's subtype, or null. */
export function defaultIceImages(subType) {
  if (!ICE_IMAGE_TYPES.has(subType)) return null
  return {
    portrait: `${ICE_IMAGE_DIR}/${subType}/portrait.webp`, token: `${ICE_IMAGE_DIR}/${subType}/token.webp`
  }
}

/** { portrait, token } of a sprite's type, or null. */
export function defaultSpriteImages(type) {
  if (!SPRITE_IMAGE_TYPES.has(type)) return null
  return {
    portrait: `${SPRITE_IMAGE_DIR}/${type}/portrait.webp`, token: `${SPRITE_IMAGE_DIR}/${type}/token.webp`
  }
}

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** A number in [0, 1) drawn from a string, always the same for the same string (FNV-1a). */
export function seededRandom(seed) {
  let h = 2166136261
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967296
}

/**
 * The contact pictures that suit a contact best: metatype counts most, then the job, then the gender. A named
 * character is only a candidate when the job matches.
 * @param {{job?: string, metatype?: string, gender?: string}} contact
 */
export function contactImageCandidates({
  job, metatype, gender
}, list = CONTACT_IMAGES) {
  const j = norm(job)
  let best = -1, out = []
  for (const e of list) {
    // "Flic" finds "flic des rues", "Street doc de Redmond" finds "street doc"; a word too short finds nothing
    const jobMatch = j.length >= 3 && !!e.job && (j.includes(e.job) || e.job.startsWith(j))
    if (e.named && !jobMatch) continue
    const score = (metatype && e.metatype === metatype ? 4 : 0) + (jobMatch ? 3 : 0) + (gender && e.gender === gender ? 2 : 0)
    if (score > best) { best = score; out = [] }
    if (score === best) out.push(e)
  }
  return out
}

/** The path of a contact's picture, drawn among the best candidates with the seed (the contact item's id). */
export function defaultContactImage(contact, seed, list = CONTACT_IMAGES) {
  const candidates = contactImageCandidates(contact, list)
  if (!candidates.length) return null
  const pick = candidates[Math.floor(seededRandom(seed) * candidates.length)]
  return `${CONTACT_IMAGE_DIR}/${pick.file}`
}

/** The changes that set portrait and token, or null when either is the gamemaster's or they are already in place. */
export function imageChanges(img, token, images) {
  if (!images || !isDefaultActorImage(img) || !isDefaultActorImage(token)) return null
  if (images.portrait === img && images.token === token) return null
  return {
    img: images.portrait, "prototypeToken.texture.src": images.token
  }
}

function enabled(key) {
  try {
    return game.settings.get("sr5", key) !== false
  } catch {
    return true
  }
}

/** The pictures an actor's source calls for, by family, or null. */
function imagesFor(type, system, findContactItem) {
  if (type === "actorDevice" && system?.matrix?.deviceType === "ice") {
    return enabled("sr5IceDefaultImages") ? defaultIceImages(system.matrix.deviceSubType) : null
  }
  if (type === "actorSprite") return enabled("sr5SpriteDefaultImages") ? defaultSpriteImages(system?.type) : null
  if (type === "actorGrunt" && system?.creatorItemId) {
    if (!enabled("sr5ContactDefaultImages")) return null
    const item = findContactItem(system.creatorId, system.creatorItemId)
    if (item && item.type !== "itemContact") return null
    const portrait = defaultContactImage({
      job: item?.system?.type, metatype: system.biography?.metatype, gender: system.biography?.gender,
    }, system.creatorItemId)
    return portrait ? {
      portrait, token: portrait
    } : null
  }
  return null
}

function contactItemOf(creatorId, itemId) {
  return globalThis.game?.actors?.get?.(creatorId)?.items?.get?.(itemId) ?? null
}

/** preCreateActor: an IC, a sprite or a contact made by hand, called from a sheet or taken from a compendium. */
export function defaultImageOnCreate(document, data, options, userId, findContactItem = contactItemOf) {
  const src = document._source
  const changes = imageChanges(src.img, src.prototypeToken?.texture?.src, imagesFor(document.type, src.system, findContactItem))
  if (changes) document.updateSource(changes)
}

/** preUpdateActor: an IC's subtype or a sprite's type changed while its pictures are still the default ones. */
export function defaultImageOnUpdate(document, changes) {
  if (document.type !== "actorDevice" && document.type !== "actorSprite") return
  const flat = foundry.utils.flattenObject(changes)
  const watched = document.type === "actorSprite" ? ["system.type"] : ["system.matrix.deviceType", "system.matrix.deviceSubType"]
  if (!watched.some((k) => k in flat)) return
  //The update sets a picture of its own: it is the user's. A sheet sends its whole form, the unchanged picture with it
  const img = document._source.img, token = document._source.prototypeToken?.texture?.src
  if (("img" in flat && flat.img !== img) || ("prototypeToken.texture.src" in flat && flat["prototypeToken.texture.src"] !== token)) return
  const system = foundry.utils.mergeObject(foundry.utils.deepClone(document._source.system ?? {
  }), foundry.utils.expandObject(flat).system ?? {
  })
  const pictures = imageChanges(img, token, imagesFor(document.type, system, contactItemOf))
  if (!pictures) return
  delete changes.img
  delete changes["prototypeToken.texture.src"]
  foundry.utils.mergeObject(changes, foundry.utils.expandObject(pictures))
}

/**
 * updateActor: the actor's tokens already on a scene take the new token picture, when theirs is still a default.
 * Written once, by the user who made the update.
 */
export async function defaultImageOnTokens(actor, changes, options, userId) {
  if ((actor.type !== "actorDevice" && actor.type !== "actorSprite") || userId !== game.user?.id) return
  const src = foundry.utils.getProperty(changes, "prototypeToken.texture.src")
  if (!src || !OWN_DIRS.some((d) => src.startsWith(`${d}/`))) return
  for (const token of actor.getActiveTokens(false, true)) {
    if (token.texture?.src === src || !isDefaultActorImage(token.texture?.src)) continue
    await token.update({
      "texture.src": src
    })
  }
}
