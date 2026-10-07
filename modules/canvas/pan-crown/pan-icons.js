// The icons of the crown of a PAN (couronne du PAN, lot 2): which generic icon an item of the Matrix takes, and
// where its image lives. Plain rules with no Foundry in them, so that tests can read them.
//
// One generic icon per category, delivered in the system (decision of DjamZ, Q1): assets/img/pan/<category>.svg
// for now, provisional pictograms; lot 10 puts in their place the images of DjamZ under the same names, and the
// custom icon of an item (flags.sr5.panIcon). The categories are the list of the specification (27 icons).

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
export const PAN_ICON_EXTENSION = "svg"

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
 * @param {Object} item   the item (an itemDevice, itemWeapon, itemAugmentation, itemVehicle...)
 * @return {String}       a key of PAN_ICON_CATEGORIES; "device" when nothing more precise is known
 */
export function iconCategoryOf(item){
  switch (item?.type){
    case "itemDevice":
      return DECK_CATEGORIES[item.system?.type] ?? "device"
    case "itemWeapon":
      return "weapon"
    case "itemArmor":
      return "armor"
    case "itemAugmentation":
      if (AUGMENTATION_CATEGORIES[item.system?.category]) return AUGMENTATION_CATEGORIES[item.system.category]
      return isReflexImplant(item) ? "implant-reflex" : "implant-other"
    case "itemVehicle":
      return item.system?.type === "vehicle" ? "vehicle" : "drone"
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
  const key = PAN_ICON_CATEGORIES.includes(category) ? category : "device"
  return table?.[key] || `${PAN_ICON_FOLDER}/${key}.${PAN_ICON_EXTENSION}`
}
