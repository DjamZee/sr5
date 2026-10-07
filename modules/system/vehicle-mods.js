// The vehicle mods whose game effect an item effect cannot say (Rigger 5.0 p. 153-173, lot R8 of the rigging plan).
// Pure rules, read by the actor preparation, the rolls and the item guards. The other mods are data (effects).

import {
  isFactoryMod
} from "./vehicle-factory.js"

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
    (factory || !isFactoryMod(i)) && vehicleModKind(i) === kind)
}

const ratingOf = item => Math.max(0, Number(item?.system?.itemRating) || 0)

/** The highest rating among the fitted mods of a kind, or 0 */
export function fittedRating(items, kind, options) {
  return fittedMods(items, kind, options).reduce((best, i) => Math.max(best, ratingOf(i)), 0)
}

// R5 p. 170: "cette amélioration remplace la valeur de l'attribut Autopilote du véhicule au lieu de s'y ajouter", and
// the same for the Sensor. The replacement stands in for the printed value; the other mods still add to it
const REPLACEMENT_KINDS = {
  pilot: "autopilotReplacement", sensor: "sensorReplacement"
}
const REPLACED_TARGET = /^system\.attributes\.(pilot|sensor)\.augmented$/

/** The attribute ("pilot", "sensor") a mod's effect replaces, or null: read once, in the base of the attribute */
export function replacedVehicleAttributeOf(effect) {
  if (effect?.type !== "ratingReplace" && effect?.type !== "valueReplace") return null
  return REPLACED_TARGET.exec(effect.target ?? "")?.[1] ?? null
}

/** The value that replaces the printed Pilot or Sensor of a vehicle, or null: the highest of the replacements fitted
 *  afterwards. A factory one is the printed profile already (R5 p. 156) */
export function replacedVehicleAttribute(items, attribute) {
  let replaced = null
  for (const item of fittedMods(items, REPLACEMENT_KINDS[attribute], {
    factory: false
  })) replaced = Math.max(replaced ?? 0, ratingOf(item))
  for (const item of Array.from(items ?? [])) {
    const system = item?.system
    if (item?.type !== "itemVehicleMod" || system?.isActive !== true || isFactoryMod(item)) continue
    for (const effect of Object.values(system.customEffects ?? {
    })) {
      if (replacedVehicleAttributeOf(effect) !== attribute || effect.transfer || (effect.wifi && !system.wirelessTurnedOn)) continue
      const value = effect.type === "ratingReplace" ? ratingOf(item) : Number(effect.value) || 0
      replaced = Math.max(replaced ?? 0, value * (Number(effect.multiplier ?? 1) || 1))
    }
  }
  return replaced
}

// R5 p. 161: "Un véhicule ne peut ajouter au maximum qu'un nombre de points de blindage égal à sa Structure (ce qui
// donne un Blindage maximal = Structure + Blindage d'origine)", whatever slots are left. Factory armor is the printed
// Armor (R5 p. 156): only the armor added afterwards counts

/** How much of the armor added by the Armor mods goes beyond the vehicle's Body, to take off; 0 within the cap */
export function armorCapReduction(addedArmor, body) {
  return Math.max(0, (Number(addedArmor) || 0) - Math.max(0, Number(body) || 0))
}

/** The armor the fitted Armor mods (factory left out) add, read from the modifiers they left on the Armor */
export function addedArmor(items, armorModifiers) {
  const sources = new Set(fittedMods(items, "armor", {
    factory: false
  }).map(i => i.name))
  return (armorModifiers ?? []).filter(m => sources.has(m.source) && !m.isMultiplier).reduce((sum, m) => sum + (Number(m.value) || 0), 0)
}
