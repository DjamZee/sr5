// The vehicle mods whose game effect an item effect cannot say (Rigger 5.0 p. 153-173, lot R8 of the rigging plan).
// Pure rules, read by the actor preparation, the rolls and the item guards. The other mods are data (effects).

// What a mod does, chosen on its sheet. "" = nothing the system works out by code
export const VEHICLE_MOD_EFFECT_KINDS = [
  "autopilotReplacement", "sensorReplacement", "armor", "bullBar", "passengerProtection", "riggerCocoon",
  "tactileSensors", "signatureMasking", "metahumanAdaptation",
]

// A mod whose kind was never chosen (the Mégapack's, the compendiums') is known by its name, French or English.
// Read in this order: "Blindage personnel renforcé" and "Blindage électromagnétique" are not the Armor mod
const KIND_BY_NAME = [
  ["autopilotReplacement", /^(remplacement de l'autopilote|autopilot (replacement|upgrade))/],
  ["sensorReplacement", /^(remplacement des senseurs|sensor (replacement|upgrade))/],
  ["armor", /^(blindage|armor) \((standard|dissimule|concealed)\)/],
  ["bullBar", /^(pare-buffle|ram plate|bull bar)/],
  ["passengerProtection", /^(systeme de protection des passagers|passenger protection system)/],
  ["riggerCocoon", /^(cocon (de|pour) rigger|rigger cocoon)/],
  ["tactileSensors", /^(senseurs tactiles|capteurs tactiles|touch sensors|tactile sensors)/],
  ["signatureMasking", /^(camouflage de la signature|signature masking)/],
  ["metahumanAdaptation", /^(adaptation metahumaine|metahuman adjustment)/],
]

const plain = name => String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'").trim().toLowerCase()

/** The kind of a mod: the one its sheet chose, otherwise the one its name tells, otherwise "" */
export function vehicleModKind(item) {
  if (item?.type && item.type !== "itemVehicleMod") return ""
  const chosen = item?.system?.effectKind
  if (chosen) return VEHICLE_MOD_EFFECT_KINDS.includes(chosen) ? chosen : ""
  const name = plain(item?.name)
  return KIND_BY_NAME.find(([, pattern]) => pattern.test(name))?.[0] ?? ""
}

/** The mods of a kind fitted on the vehicle (active), factory ones included unless left out */
export function fittedMods(items, kind, {
  factory = true
} = {
}) {
  return Array.from(items ?? []).filter(i => i?.type === "itemVehicleMod" && i.system?.isActive === true &&
    (factory || i.system?.isFactory !== true) && vehicleModKind(i) === kind)
}

const ratingOf = item => Math.max(0, Number(item?.system?.itemRating) || 0)

/** The highest rating among the fitted mods of a kind, or 0 */
export function fittedRating(items, kind, options) {
  return fittedMods(items, kind, options).reduce((best, i) => Math.max(best, ratingOf(i)), 0)
}
