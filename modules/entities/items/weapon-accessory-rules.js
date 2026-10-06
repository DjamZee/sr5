// Weapon accessories whose effect depends on the other accessories of the weapon or on the range of the shot.
// Pure helpers, kept apart from the item preparation so the tests can reach them.
//
// An accessory is either a catalog entry (a.name is its key, no a.system) or an item dropped on the weapon (a.system,
// a.name is the item's name). Compendium items carry no key for most of them (Mégapack: no specialEffect on the red dot,
// the tripod or the gyro mount), so they are recognised by their specialEffect when it is set, else by their name, in
// French or in English.

const NAME_PATTERNS = {
  redDotSight      : /point rouge|red ?dot/,
  laserSight       : /visee laser|laser sight/,
  holographicSight : /holograph/,
  imagingScope     : /lunette de visee|imaging scope/,
  periscope        : /periscope/,
  bipod            : /bipied|bipod/,
  foregrip         : /poignee avant|foregrip/,
  gyroMount        : /gyrostab|gyro mount/,
  tripod           : /trepied|tripod/,
  barrelWeight     : /lest de canon|barrel weight/,
  foldingStock     : /crosse pliable|folding stock/,
  hipPad           : /hanche|hip pad/,
  shockPad         : /crosse rembourree|rembourrage antichoc|shock pad|padded stock/,
}

const SMARTGUN_KEYS = ["smartgunSystemInternal", "smartgunSystemExternal", "smartgunInternal", "smartgunExternal"]

const normalize = text => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function accessoryList(weaponData) {
  let accessories = weaponData?.accessory
  if (!accessories) return []
  if (!Array.isArray(accessories)) accessories = Object.values(accessories)
  return accessories.filter(Boolean)
}

/** Is this accessory the one the key names (catalog key, specialEffect, or the item's name)? */
export function isAccessoryKind(a, key) {
  if (!a) return false
  if (!a.system) return a.name === key
  if (a.system.weaponAccessory?.specialEffect === key) return true
  const pattern = NAME_PATTERNS[key]
  return pattern ? pattern.test(normalize(a.name)) : false
}

function isSmartgun(a) {
  return SMARTGUN_KEYS.some(key => a?.name === key || a?.system?.weaponAccessory?.specialEffect === key)
}

/**
 * The Capacity an accessory offers vision enhancements: the one written on it, else the book's for an accessory it
 * names, imaging scope and periscope "une Capacité de 3", a smartgun's camera "une Capacité de 1" (SR5 p. 434-435).
 */
export function accessoryCapacity(a) {
  const written = Math.max(0, Math.floor(Number(a?.system?.weaponAccessory?.capacity)) || 0)
  if (written) return written
  if (isAccessoryKind(a, "imagingScope") || isAccessoryKind(a, "periscope")) return 3
  if (isSmartgun(a)) return 1
  return 0
}

/** The Capacity the mounted enhancements take (each enhancement's [Capacity], SR5 p. 447) */
export function capacityTaken(enhancements) {
  let list = enhancements ?? []
  if (!Array.isArray(list)) list = Object.values(list)
  return list.reduce((sum, e) => sum + Math.max(0, Number(e?.system?.capacityTaken?.value ?? e?.system?.capacityTaken?.base) || 0), 0)
}

/** Whether an enhancement fits in what is left of the accessory's Capacity */
export function enhancementFits(a, enhancement) {
  return capacityTaken(a?.system?.weaponAccessory?.visionEnhancements) + capacityTaken([enhancement]) <= accessoryCapacity(a)
}

/**
 * What the vision enhancements mounted in the weapon's accessories give its shots (SR5 p. 434, 447). Arbitrage de
 * DjamZ (06/10), as for the weapon flashlight: they only count for a shot with that weapon, when the weapon, the
 * accessory and the enhancement are active. Read on the actor's own items (`getItem(id)`), not on the copies.
 * @returns {{lowLight: boolean, thermographic: boolean, glare: number, zoom: boolean}}
 */
export function scopeVision(weaponData, getItem) {
  const result = {
    lowLight: false, thermographic: false, glare: 0, zoom: false
  }
  if (!weaponData?.isActive) return result
  for (const a of accessoryList(weaponData)) {
    if (!a.isActive) continue
    const live = a._id ? getItem(a._id) : null
    const accessory = live ?? a
    //The imaging scope's zoom takes a row off range for this weapon only (SR5 p. 434: "inclut une micro-caméra et un zoom")
    if (accessory.system?.weaponAccessory?.specialEffect === "imagingScope" || isAccessoryKind(accessory, "imagingScope")) result.zoom = true
    let mounted = accessory.system?.weaponAccessory?.visionEnhancements ?? []
    if (!Array.isArray(mounted)) mounted = Object.values(mounted)
    for (const copy of mounted) {
      const gear = copy?._id ? getItem(copy._id) : null
      if (!gear?.system?.isActive) continue
      for (const effect of Object.values(gear.system.customEffects ?? {
      })) {
        if (effect?.target === "system.visions.lowLight.augmented" && String(effect.value) === "true") result.lowLight = true
        if (effect?.target === "system.visions.thermographic.augmented" && String(effect.value) === "true") result.thermographic = true
        if (effect?.target === "system.itemsProperties.environmentalMod.glare") result.glare = Math.min(result.glare, Number(effect.value) || 0)
      }
    }
  }
  return result
}

/**
 * Red dot sight (Street Lethal p. 49): "Les viseurs à point rouges ne sont pas compatibles avec les systèmes smartlink,
 * les viseurs laser, les viseurs holographiques ou toute autre forme de zoom." Whether the weapon carries an active red
 * dot sight that may work: none of those mounted and active (a smartgun only counts when the shooter has a smartlink).
 */
export function redDotSightWorks(weaponData, hasSmartlink = false) {
  const active = accessoryList(weaponData).filter(a => a.isActive)
  if (!active.some(a => isAccessoryKind(a, "redDotSight"))) return false
  if (hasSmartlink && active.some(isSmartgun)) return false
  return !active.some(a => ["laserSight", "holographicSight", "imagingScope"].some(key => isAccessoryKind(a, key)))
}

/**
 * Red dot sight (Street Lethal p. 49): +1 Accuracy and +1 die at short range, +1 Accuracy only at medium range, nothing
 * at long and extreme range.
 */
export function redDotSightBonus(range, works = true) {
  if (!works) return {
    accuracy: 0, dice: 0
  }
  if (range === "short") return {
    accuracy: 1, dice: 1
  }
  if (range === "medium") return {
    accuracy: 1, dice: 0
  }
  return {
    accuracy: 0, dice: 0
  }
}

/** The non-cumulative Accuracy bonus the weapon's other accessories already give: the red dot's competes with it */
export function nonCumulativeAccessoryAccuracy(weaponData) {
  return Math.max(0, ...(weaponData?.accuracy?.modifiers ?? []).filter(m => m.nonCumulative && m.type === "weaponAccessory").map(m => Number(m.value) || 0))
}

/**
 * What a red dot sight adds to a ranged attack at this range: the die, and the Accuracy beyond the other
 * non-cumulative bonuses. The roll dialog and the GM's check of the card (attack-card.js) both use it.
 */
export function redDotAttackBonus(weaponData, hasSmartlink, range) {
  if (!redDotSightWorks(weaponData, hasSmartlink)) return {
    accuracy: 0, dice: 0
  }
  const bonus = redDotSightBonus(range)
  return {
    dice: bonus.dice, accuracy: Math.max(0, bonus.accuracy - nonCumulativeAccessoryAccuracy(weaponData))
  }
}

/**
 * Recoil compensation that does not stack (Run & Gun p. 71): within each group, only one accessory compensates; the same
 * system mounted twice does not double either. Bipod, foregrip, gyro mount, tripod and barrel weight are all mutually
 * exclusive; so are folding stock, hip pad and padded stock (shock pad).
 */
export const RECOIL_GROUPS = [
  ["bipod", "foregrip", "gyroMount", "tripod", "barrelWeight"],
  ["foldingStock", "hipPad", "shockPad"],
]

export function recoilGroupOf(a) {
  return RECOIL_GROUPS.findIndex(group => group.some(key => isAccessoryKind(a, key)))
}

/**
 * The accessories whose recoil compensation is ignored: in each group, every active member but the one that compensates
 * the most (the first of them when two are equal). `recoilOf(a)` gives the compensation an accessory brings.
 * @returns {Set<object>}
 */
export function ignoredRecoilAccessories(weaponData, recoilOf) {
  const best = new Map()
  for (const a of accessoryList(weaponData)) {
    if (!a.isActive) continue
    const group = recoilGroupOf(a)
    if (group < 0) continue
    const value = Number(recoilOf(a)) || 0
    const kept = best.get(group)
    if (!kept || value > kept.value) best.set(group, {
      a, value
    })
  }
  const ignored = new Set()
  for (const a of accessoryList(weaponData)) {
    const group = recoilGroupOf(a)
    if (group >= 0 && a.isActive && best.get(group)?.a !== a) ignored.add(a)
  }
  return ignored
}
