// The workshop of a vehicle or a drone (Chop Shop, B12): its slots, its mods by category, its cost, and the
// extended test that installs or removes a mod (Rigger 5.0 p. 153-154). Pure rules, read by the "Workshop" tab
// of the drone sheet and of the vehicle item, by the roll preparation and by the chat card.
import {
  isFactoryMod, modTakesSlots
} from "./vehicle-factory.js"

/** R5 p. 153-154: six categories, each with as many slots as the vehicle's Body */
export const MOD_CATEGORIES = ["powerTrain", "protection", "weapons", "body", "electromagnetic", "cosmetic"]

/** R5 p. 153: the tools a mod asks for, from the lightest to the heaviest */
export const TOOL_LEVELS = ["kit", "shop", "facility"]

const num = v => Math.max(0, Math.floor(Number(v) || 0))
const sys = m => m?.system ?? {
}

/** One gauge per category: the slots the fitted mods take up out of the vehicle's (factory ones free, R5 p. 191).
 *  "Il est strictement interdit de dépasser ce nombre d'emplacements" (R5 p. 154): over shows a vehicle
 *  modified before the refusal existed */
export function slotGauges(capacity, mods) {
  return MOD_CATEGORIES.map(key => {
    const total = num(capacity?.[key])
    const used = Array.from(mods ?? [])
      .filter(m => sys(m).type === key && modTakesSlots(sys(m), isFactoryMod(m)))
      .reduce((sum, m) => sum + num(sys(m).slots?.value), 0)
    return {
      key, used, total, free: Math.max(0, total - used),
      full: total > 0 && used >= total, over: used > total,
      percent: total > 0 ? Math.min(100, Math.round(100 * used / total)) : (used > 0 ? 100 : 0),
    }
  })
}

/** The mods of the vehicle by category, in the book's order; a mod without a category comes last */
export function modsByCategory(mods) {
  const groups = MOD_CATEGORIES.map(key => ({
    key, mods: []
  }))
  const other = {
    key: "", mods: []
  }
  for (const m of Array.from(mods ?? [])) (groups.find(g => g.key === sys(m).type) ?? other).mods.push(m)
  return other.mods.length ? [...groups, other] : groups
}

/** The price of a mod on this vehicle: a factory mod is paid with the vehicle (R5 p. 156, Q6 of DjamZ), and stays so
 *  once taken off (its parts are kept for this vehicle, R5 p. 154) */
export function modCost(mod) {
  return isFactoryMod(mod) || mod?.flags?.sr5?.wasFactory === true ? 0 : num(sys(mod).price?.value)
}

/** The bare vehicle, its mods (fitted or waiting to be), and the sum (Q8 of the rigging plan). `priceOf` prices a mod
 *  otherwise (the Modification Points of a drone, R5 p. 127) */
export function workshopCost(vehiclePrice, mods, priceOf = modCost) {
  const vehicle = num(vehiclePrice)
  const modsTotal = Array.from(mods ?? []).reduce((sum, m) => sum + priceOf(m), 0)
  return {
    vehicle, mods: modsTotal, total: vehicle + modsTotal
  }
}

/** R5 p. 153 with SR5 p. 148: tools below the level the mod asks for are Inadequate (-2), no tools at all
 *  Unavailable (-4). `available` is "none" or a TOOL_LEVELS key; a mod that names no tools asks for nothing */
export function toolsModifier(required, available) {
  const need = TOOL_LEVELS.indexOf(required)
  if (available === "none") return need < 0 ? {
    key: "", value: 0
  } : {
    key: "unavailable", value: -4
  }
  if (need < 0 || TOOL_LEVELS.indexOf(available) >= need) return {
    key: "", value: 0
  }
  return {
    key: "inadequate", value: -2
  }
}

/** R5 p. 153-154: an extended test of Mechanic + Logic [Logic], threshold of the mod, 1 hour; the removal asks for
 *  the same tools and skill, threshold halved (rounded up, SR5 p. 50) */
export function installPlan({
  threshold, removal = false
}) {
  const t = Math.max(1, num(threshold))
  return {
    threshold: removal ? Math.max(1, Math.ceil(t / 2)) : t,
    interval: "hour",
    multiplier: 1,
  }
}

/** What the card of the extended test says once rolled. R5 p. 153: "En cas d'échec critique, la tentative échoue
 *  automatiquement et les pièces sont irrémédiablement perdues" (the install only: a removal keeps them) */
export function installOutcome({
  hits, threshold, criticalGlitch, stillExtended, removal = false
}) {
  if (criticalGlitch) return removal ? "failed" : "partsLost"
  if (num(hits) >= Math.max(1, num(threshold))) return "done"
  return stillExtended ? "ongoing" : "unfinished"
}

/** Q9 of DjamZ: the vehicle's own picture, else a generic one. The asset library only holds the books'
 *  illustrations, which the system cannot ship: the generic picture is the system's own drone or vehicle icon */
const DEFAULT_IMAGES = ["icons/svg/mystery-man.svg", "systems/sr5/assets/img/actors/actorDrone.svg"]
const DRONE_CATEGORIES = ["microdrone", "minidrone", "smallDrone", "mediumDrone", "largeDrone", "hugeDrone"]
export function workshopImage(img, {
  type, category
} = {
}) {
  if (img && !DEFAULT_IMAGES.includes(img)) return img
  const drone = type === "drone" || DRONE_CATEGORIES.includes(category)
  return drone ? "systems/sr5/assets/img/items/itemDrone.svg" : "systems/sr5/assets/img/items/itemVehicle.svg"
}
