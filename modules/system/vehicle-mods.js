// The vehicle mods whose game effect an item effect cannot say (Rigger 5.0 p. 153-173, lot R8 of the rigging plan).
// Pure rules, read by the actor preparation, the rolls and the item guards. The other mods are data (effects).

import {
  isFactoryMod, modTakesSlots
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

// R5 p. 164 (Pare-buffle): "Lorsqu'un véhicule effectue une attaque pour Percuter (p. 203, SR5), les dégâts infligés sont
// augmentés d'un cran, comme si le véhicule roulait à une catégorie de vitesse supérieure" (converter.js)

/** Whether a vehicle rams with a ram plate fitted */
export function hasBullBar(items) {
  return fittedMods(items, "bullBar").length > 0
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

// R5 p. 153-154: a vehicle has as many slots as its Body in each of six categories, and a mod cannot go beyond them.
// Factory equipment fits by definition (R5 p. 156): it is never refused
const SLOT_CATEGORIES = ["powerTrain", "protection", "weapons", "body", "electromagnetic", "cosmetic"]

/** The slots a mod takes and their category, or null when it takes none (switched off, equipment, no slots) */
export function modSlotUse(system) {
  if (!system || !SLOT_CATEGORIES.includes(system.type) || !modTakesSlots(system, system.isFactory)) return null
  const slots = Number(system.slots?.value) || 0
  return slots > 0 ? {
    category: system.type, slots
  } : null
}

/** Whether fitting a mod as `after` (it was `before`) goes beyond the free slots of its category, and by how much:
 *  {category, needed, free} or null. `free` holds the vehicle's slots left, `before` already counted in them.
 *  A change that takes no more slots is never refused, even on a vehicle already over its slots */
export function slotsRefusal(free, before, after) {
  if (!after) return null
  const held = before?.category === after.category ? before.slots : 0
  if (after.slots <= held) return null
  const left = (Number(free?.[after.category]?.value) || 0) + held
  return after.slots > left ? {
    category: after.category, needed: after.slots, free: Math.max(0, left)
  } : null
}

/** Whether the drone already stands in the world, as opposed to one being created with its mods. The synthetic actor of
 *  an unlinked token is in no actor collection: its token, on its scene, says it */
export function droneInWorld(drone) {
  if (!drone) return false
  if (drone.isToken) return !!drone.token?.collection?.has?.(drone.token.id)
  return !!drone.collection?.has?.(drone.id)
}

// SR5 p. 202: in a crash, "les personnages [résistent] avec Constitution + Armure - PA 6". R5 p. 162 (SPP): its rating
// is added "à tout test de Résistance aux dégâts effectué par les passagers, dans le cas de dégâts dus à une collision
// ou à une action de conduite violente [...] à l'exception des attaques d'armes". R5 p. 157 (Cocon de rigger): "Son
// occupant bénéficie de +6 dés pour résister aux dégâts causés par les accidents ou les manœuvres violentes".
// The system knows no seat: a character is aboard the vehicles they drive themselves or jump into (arbitrage d'Hélène,
// 07/10, lot R8); the cocoon holds the rigger who jumps in. The gamemaster takes a modifier off in the dialog otherwise
export const CRASH_ARMOR_PENETRATION = -6
export const COCOON_CRASH_DICE = 6

/** What the crash's AP takes off a passenger's armor: -6, never more than the armor itself */
export function crashArmorPenetration(armor) {
  return -Math.min(-CRASH_ARMOR_PENETRATION, Math.max(0, Number(armor) || 0))
}

/** The dice a passenger adds to resist a crash, from the vehicles they are aboard ({items, controlMode}): the highest SPP,
 *  and the cocoon of a vehicle they jump into */
export function occupantCrashBonus(vehicles) {
  let protection = 0, cocoon = 0
  for (const vehicle of vehicles ?? []) {
    if (vehicle?.controlMode !== "manual" && vehicle?.controlMode !== "rigging") continue
    protection = Math.max(protection, fittedRating(vehicle.items, "passengerProtection"))
    if (vehicle.controlMode === "rigging" && fittedMods(vehicle.items, "riggerCocoon").length) cocoon = COCOON_CRASH_DICE
  }
  return {
    protection, cocoon
  }
}

// R5 p. 170 (Senseurs tactiles): "un rigger immergé dans un véhicule équipé de capteurs tactiles bénéficie d'un bonus de +2
// dés à tous les tests de Perception ou de Senseurs, et la Maniabilité du véhicule est augmentée de +1. Cependant [...]
// chaque fois que le véhicule subit des dégâts, le rigger subit un malus de –2 à ses tests de Résistance aux Dommages de
// biofeedback". Only while a rigger is jumped in
export const TACTILE_PERCEPTION_DICE = 2
export const TACTILE_HANDLING = 1
export const TACTILE_BIOFEEDBACK_DICE = -2

/** Whether a jumped-in rigger feels the vehicle through its tactile sensors */
export function tactileSensorsOn(items, controlMode) {
  return controlMode === "rigging" && fittedMods(items, "tactileSensors").length > 0
}

// R5 p. 169 (Camouflage de la signature): "À chaque fois qu'un attaquant tente de repérer le véhicule via un test de
// Senseurs, ou de le cibler à l'aide d'un verrouillage actif ou passif, l'Indice de masquage est appliqué comme malus au
// test de dés de l'attaquant, en plus des autres modificateurs de Signature"

/** The dice the signature masking of a vehicle takes off whoever locks on it: minus its rating, 0 for anyone else */
export function signatureMaskingPenalty(target) {
  if (target?.type !== "actorDrone") return 0
  return -fittedRating(target.items, "signatureMasking") || 0
}

// R5 p. 171 (Adaptation métahumaine): "Un ork ou un elfe pilotant un véhicule non ajusté subit un malus de –1 à tous ses
// tests de Pilotage. Un nain ou un troll non ajusté subit un malus de –2". The controls are under the pilot's hands in
// manual control only: remote and jumped in, nobody sits at them (arbitrage d'Hélène, 07/10, lot R8). Any adaptation
// fitted counts: the system does not read which metatype it was made for
const ADAPTATION_PENALTIES = {
  ork: -1, elf: -1, dwarf: -2, troll: -2
}

/** The dice a metahuman loses piloting a vehicle not adapted to them */
export function metahumanAdaptationPenalty(metatype, items, controlMode) {
  if (controlMode !== "manual") return 0
  const penalty = ADAPTATION_PENALTIES[metatype] ?? 0
  return penalty && !fittedMods(items, "metahumanAdaptation").length ? penalty : 0
}
