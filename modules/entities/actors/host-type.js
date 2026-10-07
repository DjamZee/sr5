// Host types (Kill Code p. 48-52). Each type gives its own attribute array, which replaces the usual
// rating / +1 / +2 / +3 (DjamZ's ruling of 07/10); an attribute the book would put at 0 or below goes to 1.
// Part of an array is "at the gamemaster's choice": those values are dealt to the free attributes, and the
// gamemaster rearranges them by swapping attributes on the sheet. The behavior of each type (ICE, alert, direct
// connections) is left to the Matrice v1 module: only the data and the attributes live here.
// A nested host (KC p. 51) has the attributes of the type it imitates: it is not a type of its own.

export const HOST_ATTRIBUTES = ["attack", "sleaze", "dataProcessing", "firewall"]

// Book page of each type, for the bubble
export const HOST_TYPE_PAGES = {
  data: 49, industrial: 49, destination: 50, obsolete: 52, offline: 52, rogue: 52,
}

const atLeastOne = value => Math.max(1, value)

/**
 * The attribute array of a host type.
 * fixed: the attributes the type sets, with their offset from the rating;
 * free: the offsets dealt to the other attributes, in the default order of `freeKeys`;
 * transfer: the points a rogue host may move between its attributes, the sum staying the same (KC p. 52).
 */
export function hostTypeLayout(type) {
  switch (type) {
    case "data":
    case "industrial":
      // KC p. 49: no change
      return {
        fixed: {
        }, freeKeys: HOST_ATTRIBUTES, free: [0, 1, 2, 3], transfer: 0
      }
    case "destination":
      // KC p. 50: Data Processing +3, then -2 / -3 / +2 at the gamemaster's choice
      return {
        fixed: {
          dataProcessing: 3
        }, freeKeys: ["attack", "sleaze", "firewall"], free: [-2, -3, 2], transfer: 0
      }
    case "obsolete":
    case "offline":
      // KC p. 52: Data Processing -3, Firewall -2, then +1 / +2 at the gamemaster's choice
      return {
        fixed: {
          dataProcessing: -3, firewall: -2
        }, freeKeys: ["attack", "sleaze"], free: [2, 1], transfer: 0
      }
    case "rogue":
      // KC p. 52: up to 3 points moved to any attribute, the sum staying the same
      return {
        fixed: {
        }, freeKeys: HOST_ATTRIBUTES, free: [0, 1, 2, 3], transfer: 3
      }
    default:
      return null
  }
}

const sortedNumbers = values => [...values].sort((a, b) => a - b)

// Is the assignment the gamemaster stored for the free attributes still one the type allows at this rating?
function isValidFreeAssignment(stored, expected, transfer) {
  if (stored.some(v => !Number.isInteger(v) || v < 1)) return false
  const got = sortedNumbers(stored), want = sortedNumbers(expected)
  if (!transfer) return got.every((v, i) => v === want[i])
  // A rogue host: same sum, and no more than `transfer` points moved (the sorted pairing is the cheapest one)
  const sum = list => list.reduce((total, v) => total + v, 0)
  if (sum(got) !== sum(want)) return false
  return got.reduce((moved, v, i) => moved + Math.max(0, v - want[i]), 0) <= transfer
}

/**
 * The matrix attributes of a host of this type and rating.
 * stored: the attribute values saved on the actor ({attack, sleaze, dataProcessing, firewall}); the free ones are kept
 * when they still fit the type, otherwise the default order is dealt.
 * Returns null for no type (the attributes stay as entered), else
 * {values, fixed: [keys], free: [keys], collection: [the free values, ascending], reset: bool}.
 */
export function resolveHostAttributes(type, rating, stored = {
}) {
  const layout = hostTypeLayout(type)
  if (!layout) return null
  const values = {
  }
  for (const [key, offset] of Object.entries(layout.fixed)) values[key] = atLeastOne(rating + offset)
  const expected = layout.free.map(offset => atLeastOne(rating + offset))
  const kept = layout.freeKeys.map(key => Number(stored[key]))
  const reset = !isValidFreeAssignment(kept, expected, layout.transfer)
  layout.freeKeys.forEach((key, i) => values[key] = reset ? expected[i] : kept[i])
  return {
    values,
    fixed: Object.keys(layout.fixed),
    free: [...layout.freeKeys],
    collection: sortedNumbers(expected),
    reset,
  }
}

/**
 * A host with no type that the gamemaster never arranged (the four attributes at 0, no value of the collection placed)
 * gets the array of SR5 p. 248 in the default order: rating, +1, +2, +3 for Attack, Sleaze, Data Processing, Firewall.
 * Otherwise null: what the gamemaster placed stays as entered.
 */
export function untypedHostDefaults(rating, stored = {
}, anyPlaced = false) {
  if (anyPlaced || HOST_ATTRIBUTES.some(key => Number(stored[key]) > 0)) return null
  return Object.fromEntries(HOST_ATTRIBUTES.map((key, i) => [key, atLeastOne((Number(rating) || 0) + i)]))
}

// The offset from the rating, as the bubble shows it ("rating + 3", "rating - 2")
export function hostTypeOffsetLabel(value, rating) {
  const offset = value - rating
  if (offset === 0) return "+0"
  return offset > 0 ? `+${offset}` : `${offset}`
}
