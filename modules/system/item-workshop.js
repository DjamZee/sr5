// The workshop of an item (lot 12, C9 of Adrore's feedback, the vision validated with DjamZ on 09/10): a place where
// an item is completed with its accessories, bought or taken from the inventory, priced as a whole. One name and one
// icon per family; the vehicles keep their own workshop (vehicle-workshop.js). Pure rules, read by
// item-workshop-apply.js and by the "Workshop" tab of the item sheet.
import {
  WEAPON_ACCESSORY_CATALOG
} from "../data/weaponAccessoryCatalog.js"

/** The families: the tab's label and icon, the vendor template whose banners head it (read in the Megapack's banner
 *  folder, never shipped with the system), and the shop shelf its button opens on. Labels agreed with Élise, 14/10 */
export const WORKSHOP_FAMILIES = {
  weapon: {
    label: "SR5.ItemWorkshop_weapon", icon: "fa-gun", banner: "gunsmithWorkshop", shelf: "weapons", sub: "weaponAccessory"
  },
  armor: {
    label: "SR5.ItemWorkshop_armor", icon: "fa-shirt", banner: "armorDealer", shelf: "armor", sub: ""
  },
  augmentation: {
    label: "SR5.ItemWorkshop_augmentation", icon: "fa-user-doctor", banner: "streetDoc", shelf: "cyberware", sub: ""
  },
  gear: {
    label: "SR5.ItemWorkshop_gear", icon: "fa-screwdriver-wrench", banner: "consumerElectronics", shelf: "gear", sub: ""
  },
}

const num = v => Math.max(0, Math.floor(Number(v) || 0))
const sys = i => i?.system ?? {
}

/** The family of an item, or null when it takes no accessory: a ranged weapon (the melee ones, the grenades and the
 *  accessories themselves take none, RG p. 67); an armor, an implant or a piece of gear with a Capacity (SR5 p. 418),
 *  not itself an accessory */
export function workshopFamily(item) {
  const s = sys(item)
  if (s.isAccessory) return null
  if (item?.type === "itemWeapon") return s.category === "rangedWeapon" ? "weapon" : null
  const capacity = num(s.capacity?.value ?? s.capacity?.base)
  if (!capacity) return null
  return {
    itemArmor: "armor", itemAugmentation: "augmentation", itemGear: "gear"
  }[item?.type] ?? null
}

/** RG p. 67: the slots of a weapon, from the top of the weapon to its stock */
export const WEAPON_SLOTS = ["top", "underneath", "side", "internal", "barrel", "stock"]

/** RG p. 67, table « Emplacements » (VF): the slots each kind of weapon has. `null`: the gamemaster's discretion (the
 *  special weapons; the bows and crossbows, which only take accessories made for them, SR5 p. 419). The VO prose of
 *  the same page gives the light pistols the top and barrel only: the table is followed */
const ALL = WEAPON_SLOTS
const PISTOL = ["top", "barrel", "stock", "internal"]
const WEAPON_SLOT_TABLE = {
  taser: ["top", "stock", "internal"],
  holdOut: [],
  lightPistol: PISTOL,
  heavyPistol: [...PISTOL, "underneath"],
  machinePistol: PISTOL,
  submachineGun: PISTOL,
  assaultRifle: ALL, sniperRifle: ALL, shotgun: ALL, lightMachineGun: ALL, mediumMachineGun: ALL, heavyMachineGun: ALL,
  assaultCannon: ALL, grenadeLauncher: ALL, missileLauncher: ALL,
}
export function weaponSlots(type) {
  return Object.hasOwn(WEAPON_SLOT_TABLE, type) ? WEAPON_SLOT_TABLE[type] : null
}

/** The slot an accessory takes, on its prepared copy (the item form) or its catalogue entry (the old form) */
export function accessorySlot(accessory) {
  return accessory?.slot || accessory?.system?.weaponAccessory?.slot || ""
}

/** The slots an accessory takes: one, or two joined by "+" (Hard Targets p. 183: the mounted crossbow takes the barrel
 *  and under the barrel, the underbarrel laser under the barrel and a side) */
export function accessorySlots(accessory) {
  return accessorySlot(accessory).split("+").filter(Boolean)
}

/** The kind of an accessory: an accessory, a modification, or a trait (RG p. 67); a catalogue entry (the old form)
 *  has its kind in the catalogue */
export function accessoryKind(accessory) {
  return accessory?.system?.weaponAccessory?.type || WEAPON_ACCESSORY_CATALOG[accessory?.key ?? accessory?.name]?.type || "accessory"
}

/** One line per slot of the weapon: the accessories on it, whether the weapon has it, `over` when two share it
 *  ("Chaque emplacement ne peut accueillir qu'un accessoire ou qu'une modification", RG p. 67). An accessory built
 *  into the weapon with no slot named takes none (SR5 p. 419) */
export function slotLines(type, accessories) {
  const available = weaponSlots(type)
  return WEAPON_SLOTS.map(key => {
    const on = Array.from(accessories ?? []).filter(a => accessorySlots(a).includes(key))
    const exists = available === null || available.includes(key)
    return {
      key, exists, names: on.map(a => a.name), used: on.length, over: on.length > 1, missing: !exists && on.length > 0,
    }
  })
}

/** Why an accessory cannot go on this weapon: "trait" (a feature of the weapon from the factory, never added, RG
 *  p. 67), "noSlot" (the weapon does not have the slot), "slotTaken", or null */
export function slotRefusal(type, accessories, added) {
  if (accessoryKind(added) === "trait") return "trait"
  const slots = accessorySlots(added)
  if (!slots.length) return null
  const available = weaponSlots(type)
  if (available !== null && slots.some(slot => !available.includes(slot))) return "noSlot"
  if (Array.from(accessories ?? []).some(a => accessorySlots(a).some(slot => slots.includes(slot)))) return "slotTaken"
  return null
}

/** RG p. 67, step 2: a kit for the top, the sides and under the barrel; a workshop for the internal, barrel and stock
 *  slots and for any modification */
export function toolsFor(accessory) {
  const slots = accessorySlots(accessory)
  return accessoryKind(accessory) === "modification" || slots.some(slot => ["internal", "barrel", "stock"].includes(slot)) ? "shop" : "kit"
}

/** RG p. 67: an accessory on the top, a side or under the barrel goes on in five minutes, without a test; one on the
 *  stock, the barrel or inside, and any modification, asks for an extended Armorer + Logic [Mental] test */
export function installNeedsTest(accessory) {
  return toolsFor(accessory) === "shop"
}

/** The Capacity gauge of an armor, an implant or a piece of gear (SR5 p. 418: "le nombre maximum d'emplacements"):
 *  `taken` the Capacity each accessory takes */
export function capacityGauge(capacity, taken) {
  const total = num(capacity)
  const used = Array.from(taken ?? []).reduce((sum, v) => sum + num(v), 0)
  return {
    used, total, free: Math.max(0, total - used), full: total > 0 && used >= total, over: used > total,
    percent: total > 0 ? Math.min(100, Math.round(100 * used / total)) : (used > 0 ? 100 : 0),
  }
}

/** The Capacity an accessory would take past the host's: {needed, free} or null */
export function capacityRefusal(capacity, taken, needed) {
  const gauge = capacityGauge(capacity, taken)
  const want = num(needed)
  return want > gauge.free ? {
    needed: want, free: gauge.free
  } : null
}

const LEGALITY_RANK = {
  "": 0, R: 1, F: 2
}

/** The figures of the whole: the item and its accessories. `hostIncludes` when the host's price already counts its
 *  accessories (a weapon's, utilityItem.js). The availability is the highest (RG p. 99: "la Disponibilité la plus
 *  haute entre celle de la protection et celle de la personnalisation s'applique"), the legality the strictest */
export function workshopTotals(host, accessories, {
  hostIncludes = false
} = {
}) {
  const list = Array.from(accessories ?? [])
  const added = list.filter(a => !a.free).reduce((sum, a) => sum + num(a.price), 0)
  const hostPrice = num(host?.price)
  const total = hostIncludes ? hostPrice : hostPrice + added
  const all = [host ?? {
  }, ...list]
  const availability = all.reduce((best, l) => Math.max(best, num(l.availability)), 0)
  const legality = all.map(l => l.legality ?? "").reduce((worst, l) => (LEGALITY_RANK[l] ?? 0) > (LEGALITY_RANK[worst] ?? 0) ? l : worst, "")
  return {
    host: hostIncludes ? hostPrice - added : hostPrice, accessories: added, total, availability, legality
  }
}

/** SR5 p. 435, the external smartgun: "un test étendu d'Armurerie + Logique (4, 1 heure)", the one figure the books
 *  print for fitting a weapon accessory; RG p. 67 leaves the threshold to the general rules (SR5 p. 50). The dialog
 *  starts on it and the tester may change it */
export const DEFAULT_INSTALL = {
  threshold: 4, interval: "hour"
}
