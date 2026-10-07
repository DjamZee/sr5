// The optional Modification Points of drones (Rigger 5.0 p. 126-128, lot R13 of the rigging plan). Pure rules, read by
// the workshop, the dealership, the mod guards and the actor preparation when the world setting chooses them; the
// default stays the slots of the main rule (R5 p. 153). Vehicles always keep their slots: the points are for drones.
//
// R5 p. 126: "Chaque drone dispose d'un nombre de Points de Modifications égal à sa Structure", noted Structure X(Y)
// when the drone has fewer left (Y). R5 p. 127: "tout drone peut voir un de ses attributs augmenté de 1 (ou de 3 pour le
// Blindage) [...] sans consommer de Points de Modifications. Toute augmentation au-delà [...] coûte un nombre de Points
// de Modifications égal au montant de l'augmentation moins 1" (+2 Speed: 1 point). Lowering attributes gives back one
// point at most; lowering the Structure by 1 gives 2 points, a net gain of 1. "Un attribut de drone ne peut jamais
// dépasser le double de sa valeur initiale" (0 counts as 0.5). Armor goes up to 3 × Structure without penalty (p. 127-128).
//
// Readings the book leaves open, arbitrage de DjamZ (08/10):
// - the free +1 is one per drone ("un de ses attributs"), not one per attribute;
// - Armor counts by steps of 3 points (its free step is 3): +6 Armor costs 1 point, as +2 in another attribute;
// - the double cap is not applied to Armor, whose own cap is the penalty beyond 3 × Structure (example p. 128:
//   Armor 15 on Structure 3).

import {
  isFactoryMod, modTakesSlots
} from "./vehicle-factory.js"
import {
  modCost
} from "./vehicle-workshop.js"
import {
  replacedVehicleAttributeOf, vehicleModKind
} from "./vehicle-mods.js"

export const DRONE_MOD_SETTING = "sr5DroneModRules"
export const DRONE_MOD_RULES = {
  slots: "SR5.SETTINGS_DroneModRules_Slots", modPoints: "SR5.SETTINGS_DroneModRules_ModPoints"
}
export const MOD_POINTS_KEY = "modPoints"

/** The attributes a mod raises or lowers, as the book lists them (p. 127-128); Body is the Structure */
export const UPGRADABLE_ATTRIBUTES = ["handling", "speed", "acceleration", "armor", "sensor"]
const ARMOR_STEP = 3
const TARGET = /^system\.attributes\.(handling|speed|acceleration|armor|sensor|body)\.(augmented|natural)$/

const num = v => Number(v) || 0
const whole = v => Math.max(0, Math.floor(num(v)))
const sys = m => m?.system ?? m ?? {
}

/** Whether the Modification Points apply to this vehicle: the setting chosen, and a drone (R5 p. 126) */
export function usesModPoints(rule, vehicleType) {
  return rule === "modPoints" && vehicleType === "drone"
}

/** The setting, read without failing before the settings are registered (tests, early preparation) */
export function droneModRule() {
  try {
    return globalThis.game?.settings?.get("sr5", DRONE_MOD_SETTING) ?? "slots"
  } catch {
    return "slots"
  }
}

/** {body, modPoints, attributes} of a drone actor (its starting values) or of a vehicle item (plain numbers) */
export function vehicleStats(system) {
  const a = system?.attributes ?? {
  }
  const start = v => typeof v === "object" && v !== null ? num(v.natural?.base) : num(v)
  return {
    body: start(a.body), modPoints: system?.modPoints ?? null,
    attributes: Object.fromEntries(UPGRADABLE_ATTRIBUTES.map(k => [k, start(a[k])])),
  }
}

/** The attribute a Pilot or Sensor replacement stands in for (R5 p. 170-171) and its new value, {key, value}, read from
 *  its effect (ratingReplace, valueReplace) or else from its kind (chosen on its sheet, or told by its name); or null */
export function replacementOf(mod) {
  const s = sys(mod)
  for (const effect of Object.values(s.customEffects ?? {
  })) {
    const key = replacedVehicleAttributeOf(effect)
    if (key && !effect.transfer) return {
      key, value: effect.type === "ratingReplace" ? num(s.itemRating) : num(effect.value)
    }
  }
  const kind = vehicleModKind(mod?.system ? mod : {
    system: s
  })
  const key = kind === "autopilotReplacement" ? "pilot" : kind === "sensorReplacement" ? "sensor" : null
  return key ? {
    key, value: num(s.itemRating)
  } : null
}

/** The attribute a mod changes and by how much, read from its effects: {key, amount} or null. The off-road twins
 *  (speedOffRoad, handlingOffRoad) follow their attribute and are not counted again. A Sensor replacement is a raise of
 *  the Sensor to its rating (R5 p. 128: "Coût = Nouvelle valeur de Senseurs × 1 000 ¥"), its amount the rating less the
 *  drone's starting Sensor (`vehicle` = {attributes: {sensor}}; 0 without the drone) */
export function attributeChange(system, vehicle) {
  const s = sys(system)
  const replaced = replacementOf(system)
  if (replaced?.key === "sensor") {
    const amount = replaced.value - num(vehicle?.attributes?.sensor)
    return amount > 0 ? {
      key: "sensor", amount
    } : null
  }
  const changes = {
  }
  for (const effect of Object.values(s.customEffects ?? {
  })) {
    const key = TARGET.exec(effect?.target ?? "")?.[1]
    if (!key || effect.transfer) continue
    //A "rating" effect is worth the item's rating, whatever its value (utilityActor.js, customEffect.value = itemRating)
    const value = effect.type === "rating" ? num(s.itemRating) : effect.type === "value" ? num(effect.value) : 0
    const multiplier = Number(effect.multiplier)
    changes[key] = (changes[key] ?? 0) + value * (Number.isFinite(multiplier) && multiplier ? multiplier : 1)
  }
  const key = Object.keys(changes).find(k => changes[k] !== 0)
  return key ? {
    key, amount: changes[key]
  } : null
}

/** The points of a weapon mount on a drone, table "Monture d'armes" (R5 p. 128): Micro 0, Mini 1, Petite 2, Standard 3,
 *  Grande 4, Énorme 5, Lourde 6. "Une monture standard escamotable coûtera 4 PM au lieu de 3": a hidden mount (internal
 *  or concealed) is the pop-up one, +1; the ejectable panels cost no point, and the book gives none to the flexibility or
 *  the control. The vehicle "light" mount is not in the drone table: read as the Petite (2). The slots of the vehicles
 *  (utilityItem._handleWeaponMounted) are not touched; null when the size is unknown, the mod's own slots then stand */
export const WEAPON_MOUNT_POINTS = {
  micro: 0, mini: 1, small: 2, light: 2, standard: 3, large: 4, huge: 5, heavy: 6
}
export function weaponMountPoints(system) {
  const s = sys(system)
  if (!s.isWeaponMounted) return null
  const points = WEAPON_MOUNT_POINTS[s.weaponMount?.size]
  if (points === undefined) return null
  return points + (["internal", "concealed"].includes(s.weaponMount?.visibility) ? 1 : 0)
}

/** What one mod asks of the drone: an attribute raised (in steps, Armor by 3), an attribute lowered, or points (a weapon
 *  mount by the drone table, any other mod its slots). `vehicle` = {attributes}: the drone, for a Sensor replacement */
export function modPointsDemand(system, vehicle) {
  const change = attributeChange(system, vehicle)
  if (change && change.amount > 0 && change.key !== "body") return {
    kind: "upgrade", key: change.key, steps: change.key === "armor" ? Math.ceil(change.amount / ARMOR_STEP) : change.amount
  }
  if (change && change.amount < 0) return {
    kind: "downgrade", key: change.key, amount: -change.amount
  }
  //A Sensor replacement no higher than the drone's own Sensor raises nothing: no point
  if (replacementOf(system)?.key === "sensor") return {
    kind: "points", points: 0
  }
  return {
    kind: "points", points: weaponMountPoints(system) ?? whole(sys(system).slots?.value)
  }
}

/** The points a mod shows on its own line: an upgrade its steps less the free one, as if alone (R5 p. 127) */
export function modPointsOf(system, vehicle) {
  const d = modPointsDemand(system, vehicle)
  if (d.kind === "upgrade") return Math.max(0, d.steps - 1)
  if (d.kind === "downgrade") return 0
  return d.points
}

/** The points of each line of a drone's mods, the free +1 taken once per drone (arbitrage de DjamZ, 08/10): by the first
 *  upgrade that takes its points (`takesPoints`), or the first upgrade of the list when none does yet. The lines that
 *  take their points then add up to `used` (review 40). `vehicle` = {attributes}: the drone, for a Sensor replacement */
export function modPointsLines(mods, takesPoints = takesModPoints, vehicle = null) {
  const list = Array.from(mods ?? [])
  const demands = list.map(m => modPointsDemand(m, vehicle))
  const upgrades = demands.map((d, i) => d.kind === "upgrade" ? i : -1).filter(i => i >= 0)
  const freeAt = upgrades.find(i => takesPoints(list[i])) ?? upgrades[0]
  return demands.map((d, i) => {
    if (d.kind === "upgrade") return Math.max(0, d.steps - (i === freeAt ? 1 : 0))
    return d.kind === "downgrade" ? 0 : d.points
  })
}

/** The drone's points: `total` its Y (or its Structure) plus what the downgrades give back, `used` what the mods take.
 *  `vehicle` = {body, modPoints}: the Structure and the Y the gamemaster wrote, null when they are the same */
export function modPointsUsage(vehicle, mods) {
  const body = whole(vehicle?.body)
  const own = vehicle?.modPoints
  const capacity = own === null || own === undefined || own === "" ? body : whole(own)
  let steps = 0, points = 0, downgraded = false, bodyGain = 0
  for (const m of Array.from(mods ?? [])) {
    const d = modPointsDemand(m, vehicle)
    if (d.kind === "upgrade") steps += d.steps
    else if (d.kind === "points") points += d.points
    else if (d.key === "body") bodyGain += d.amount
    else downgraded = true
  }
  // R5 p. 127: the Structure goes no lower than half its value, rounded up (Structure 3: "pas à 1 (car 1 < 1,5)"):
  // no point beyond that
  const gain = Math.min(bodyGain, body - Math.ceil(body / 2)) + (downgraded ? 1 : 0)
  const total = capacity + gain
  const used = points + Math.max(0, steps - 1)
  return {
    total, used, free: Math.max(0, total - used), full: total > 0 && used >= total, over: used > total,
    percent: total > 0 ? Math.min(100, Math.round(100 * used / total)) : (used > 0 ? 100 : 0),
  }
}

/** The single gauge the workshop shows under the points, shaped as a slot gauge */
export function modPointsGauge(vehicle, mods) {
  return {
    key: MOD_POINTS_KEY, ...modPointsUsage(vehicle, mods)
  }
}

/** The highest an attribute may reach, twice its starting value, 0 counting as 0.5 (R5 p. 127) */
export function attributeCap(base) {
  return Math.floor(2 * Math.max(0.5, num(base)))
}

/** Whether fitting `after` in place of `before` among the drone's fitted `mods` is refused: {needed, free} when the
 *  points run out, {attribute, cap} when an attribute would pass twice its start, else null. A change that asks no more
 *  is never refused, even on a drone already over. `vehicle` = {body, modPoints, attributes: {key: starting value}} */
export function modPointsRefusal(vehicle, mods, before, after) {
  if (!after) return null
  const others = Array.from(mods ?? []).filter(m => m !== before && (before?.id === undefined || m?.id !== before.id))
  const was = modPointsUsage(vehicle, before ? [...others, before] : others)
  const will = modPointsUsage(vehicle, [...others, after])
  if (will.used > was.used && will.used > will.total) return {
    needed: will.used - was.used, free: Math.max(0, was.total - was.used)
  }
  const change = attributeChange(after, vehicle)
  if (change && change.amount > 0 && change.key !== "armor" && change.key !== "body") {
    const base = num(vehicle?.attributes?.[change.key])
    const raised = [...others, after].map(m => attributeChange(m, vehicle)).filter(c => c?.key === change.key && c.amount > 0)
      .reduce((sum, c) => sum + c.amount, 0)
    const cap = attributeCap(base)
    const previous = before ? attributeChange(before, vehicle) : null
    const held = previous?.key === change.key && previous.amount > 0 ? previous.amount : 0
    if (base + raised > cap && change.amount > held) return {
      attribute: change.key, cap
    }
  }
  return null
}

/** The price of an attribute upgrade on this drone (R5 p. 127-128), or null for any other mod (its own price stands).
 *  `vehicle` = {body, attributes: {key: starting value}}; a Structure of 0 counts as 0.5 */
export function modPointsPrice(system, vehicle) {
  const d = modPointsDemand(system, vehicle)
  if (d.kind !== "upgrade") return null
  const change = attributeChange(system, vehicle)
  const body = Math.max(0.5, num(vehicle?.body))
  const value = num(vehicle?.attributes?.[d.key]) + change.amount
  switch (d.key) {
    case "handling": return Math.round(value * body * 200)
    case "speed": return Math.round(value * body * 2 * 200)
    case "acceleration": return Math.round(value * body * 200)
    case "armor": return Math.round(value * body * 200)
    case "sensor": return Math.round(value * 1000)
    default: return null
  }
}

/** The price of a mod on a drone under the points: the factory ones stay free (Q6), an attribute upgrade costs what
 *  the book says (p. 127-128), any other mod its own price */
export function modPointsCost(mod, vehicle) {
  if (isFactoryMod(mod) || mod?.flags?.sr5?.wasFactory === true) return 0
  return modPointsPrice(sys(mod), vehicle) ?? modCost(mod)
}

/** The mods that take their points: fitted, or from the factory (R5 p. 156, Q6 of DjamZ) */
export function modsTakingPoints(mods) {
  return Array.from(mods ?? []).filter(takesModPoints)
}

function takesModPoints(mod) {
  return modTakesSlots(sys(mod), isFactoryMod(mod))
}

/** R5 p. 127-128: beyond 3 × Structure of Armor, -1 Handling and -1 Speed every 3 points, -1 Acceleration every 6 */
export function armorOverload(armor, body) {
  const over = Math.max(0, num(armor) - 3 * whole(body))
  return {
    handling: 0 - Math.floor(over / 3), speed: 0 - Math.floor(over / 3), acceleration: 0 - Math.floor(over / 6)
  }
}
