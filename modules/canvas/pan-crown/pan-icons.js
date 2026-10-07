// The icons of the crown of a PAN (couronne du PAN, lot 2): which generic icon an item of the Matrix takes, and
// where its image lives. Plain rules with no Foundry in them, so that tests can read them.
//
// One generic icon per category, delivered in the system (decision of DjamZ, Q1): assets/img/pan/<category>.webp,
// the images of DjamZ (lot 10), converted by tools/pan-icons/convert-pan-icons.py. They carry the colour of their
// family and no frame: the disc around them is drawn by the crown. The categories are the list of the specification
// (27 icons). An item can wear its own picture instead (flags.sr5.panIcon, lot 10), which follows it when copied.

export const PAN_ICON_CATEGORIES = [
  // Base
  "commlink", "cyberdeck", "rigger-console", "weapon", "armor", "implant-eye", "implant-ear", "implant-reflex",
  "implant-other", "drone", "vehicle", "device",
  // Scenery and security
  "camera", "maglock", "door", "sensor", "turret", "elevator", "light", "terminal",
  // Pure Matrix
  "persona", "host", "ice", "sprite", "agent", "file", "mark",
]

export const PAN_ICON_FOLDER = "systems/sr5/assets/img/pan"
export const PAN_ICON_EXTENSION = "webp"

const DECK_CATEGORIES = {
  commlink: "commlink",
  cyberdeck: "cyberdeck",
  riggerCommandConsole: "rigger-console",
  livingPersona: "persona",
  headcase: "persona",
}

const AUGMENTATION_CATEGORIES = {
  eyeware: "implant-eye",
  earware: "implant-ear",
  // An implanted weapon is a weapon first (retours de DjamZ, 07/10)
  cyberweapon: "weapon",
}

// A device of the scenery (actorDevice) knows only device, slavedDevice, host, ice or maglock: what it is (a camera,
// a door...) is read in its name, or its device's, in French and in English. The first that matches wins: a turret
// camera is a turret, a maglock on a door is a maglock. A gamemaster who wants another picture gives it its own.
const SCENERY_NAMES = [
  ["turret", /tourelle|turret/i],
  ["maglock", /maglock|serrure|lock\b/i],
  ["camera", /cam[ée]ra|camera/i],
  ["elevator", /ascenseur|elevator|\blift\b/i],
  ["door", /\bportes?\b|portail|\bsas\b|\bdoors?\b|\bgates?\b/i],
  ["sensor", /capteur|senseur|sensor|d[ée]tecteur|detector|scanner/i],
  ["light", /[ée]clairage|lampe|lumi[èe]re|projecteur|\blights?\b|lighting|lamp\b/i],
  ["terminal", /terminal|ordinateur|computer|poste de travail|workstation/i],
]

// A piece of gear has no category at all: it takes a picture of the scenery only when its name says it is a camera,
// a sensor or a maglock (not a lockpick kit, not a maglock passkey, not sensor tags)
const GEAR_NAMES = [
  ["camera", /cam[ée]ra|camera/i],
  ["sensor", /^(senseur|capteur|batterie de senseurs|sensor)/i],
  ["maglock", /^maglock/i],
]

function sceneryOf(...names){
  for (const name of names){
    const found = SCENERY_NAMES.find(([, pattern]) => pattern.test(name ?? ""))
    if (found) return found[0]
  }
  return null
}

/**
 * The generic icon category of an actor of the Matrix, for its own device (the base device of a drone, a host, an IC,
 * an agent, a sprite, a device of the scenery).
 * @param {Object} actor
 * @param {Object} [device]   its device, whose name may tell what a device of the scenery is
 * @return {String|null}      a key of PAN_ICON_CATEGORIES; null for a character, who has no base device
 */
export function actorIconCategoryOf(actor, device = null){
  switch (actor?.type){
    case "actorDrone":
      return actor.system?.type === "vehicle" ? "vehicle" : "drone"
    case "actorSprite":
      return "sprite"
    case "actorAgent":
      return "agent"
    case "actorDevice": {
      const type = actor.system?.matrix?.deviceType
      if (type === "host") return "host"
      if (type === "ice") return "ice"
      if (type === "maglock") return "maglock"
      return sceneryOf(actor.name, device?.name) ?? "device"
    }
    default:
      return null
  }
}

// An implant that speeds the reflexes (wired reflexes, reaction enhancers, synaptic booster...): the system knows
// it only by what it changes, the initiative dice or the Reaction
const REFLEX_TARGET = /initiatives\.physicalInit\.dice|attributes\.reaction/

function isReflexImplant(item){
  const effects = item?.system?.customEffects
  if (!effects) return false
  return Array.from(effects).some(effect => REFLEX_TARGET.test(effect?.target ?? ""))
}

/**
 * The generic icon category of an item of the Matrix.
 * @param {Object} item       the item (an itemDevice, itemWeapon, itemAugmentation, itemVehicle...)
 * @param {Object} [holder]   the actor that carries it (its parent by default): the base device of a drone, a host,
 *                            an IC, an agent or a sprite takes the picture of what it is
 * @return {String}           a key of PAN_ICON_CATEGORIES; "device" when nothing more precise is known
 */
export function iconCategoryOf(item, holder = item?.parent){
  switch (item?.type){
    case "itemDevice":
      return DECK_CATEGORIES[item.system?.type] ?? actorIconCategoryOf(holder, item) ?? "device"
    case "itemGear":
      return GEAR_NAMES.find(([, pattern]) => pattern.test(item.name ?? ""))?.[0] ?? "device"
    case "itemWeapon":
      return "weapon"
    case "itemArmor":
      return "armor"
    case "itemAugmentation":
      if (AUGMENTATION_CATEGORIES[item.system?.category]) return AUGMENTATION_CATEGORIES[item.system.category]
      return isReflexImplant(item) ? "implant-reflex" : "implant-other"
    case "itemVehicle":
      return item.system?.type === "vehicle" ? "vehicle" : "drone"
    case "itemFile":
      return "file"
    default:
      return "device"
  }
}

/**
 * The image of a category.
 * @param {String} category   a key of PAN_ICON_CATEGORIES
 * @param {Object} [table]    category -> path, to take the place of the generic images (CONFIG.SR5.panIcons)
 * @return {String}           the path of the image; the generic device for an unknown category
 */
export function iconPathOf(category, table = null){
  // A category a module brought (registerPanIcon, lot 11)
  if (typeof category === "string" && !PAN_ICON_CATEGORIES.includes(category) && typeof table?.[category] === "string" && table[category]) return table[category]
  const key = PAN_ICON_CATEGORIES.includes(category) ? category : "device"
  return table?.[key] || `${PAN_ICON_FOLDER}/${key}.${PAN_ICON_EXTENSION}`
}

// A category is a key of letters, digits, dashes and underscores (a module's own: "matrice-zone-hall")
const CATEGORY_KEY = /^[a-z0-9][a-z0-9_-]*$/i

/**
 * A generic icon brought by a module (lot 11): a category of its own, or a picture in place of the system's.
 * @param {Object} table       category -> path (CONFIG.SR5.panIcons), changed in place
 * @param {String} category    a key of letters, digits, dashes and underscores
 * @param {String} path        the path of the image
 * @return {Boolean}           false when the category or the path is not usable
 */
export function registerPanIcon(table, category, path){
  if (!table || typeof category !== "string" || !CATEGORY_KEY.test(category)) return false
  if (typeof path !== "string" || !path.trim()) return false
  table[category] = path.trim()
  return true
}

/**
 * The picture an item or an actor (a drone, a device of the scenery) chose for itself (lot 10).
 * @param {Object} document   an Item or an Actor, or its plain data
 * @return {String|null}      the path in flags.sr5.panIcon; null when there is none
 */
export function customIconOf(document){
  const path = document?.flags?.sr5?.panIcon
  return typeof path === "string" && path.trim() ? path.trim() : null
}

/**
 * The picture of a node of the crown: its own if it has one, else the generic one of its category.
 * @param {Object} node       a node of the graph ({icon, customIcon})
 * @param {Object} [table]    category -> path (CONFIG.SR5.panIcons)
 * @return {String}
 */
export function nodeIconPathOf(node, table = null){
  return node?.customIcon || iconPathOf(node?.icon, table)
}

/** Is it one of the provisional pictograms, drawn in white to be tinted, rather than a picture in colour? */
export function isTintedIcon(path){
  return /\.svg$/i.test(path ?? "")
}
