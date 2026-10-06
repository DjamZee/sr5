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
