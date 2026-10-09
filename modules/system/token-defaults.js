/**
 * The token of what the system creates in play, family by family (lot 9, DjamZ, séance du 08/10).
 *
 * Spirits, sprites, IC, devices and hosts, drones and agents: the GM sets, for each family, the token the actor
 * is created with (size, disposition, bars, name and bars shown, vision). A field left on "As the system does"
 * keeps what the system gives (entityActor.js, _preCreate): the defaults are the behaviour of before.
 *
 * Applied once, when the actor is created: its prototype token carries it, and every token put on the map
 * after takes it from there. A token the GM laid on the actor himself is never touched afterwards, and the token
 * remembered when a spirit or sprite was dismissed (sideKickPrototypeToken) still wins over these defaults.
 *
 * For the modules (Matrice v1 lays IC): game.sr5.tokenDefaults.family(type, deviceType) and
 * game.sr5.tokenDefaults.prototypeChanges(family) give what to merge in an actor's creation data;
 * game.sr5.tokenDefaults.tokenChanges(family) the same for a token's own data.
 */

export const TOKEN_DEFAULTS_SETTING = "sr5TokenDefaults"
export const TOKEN_DEFAULTS_MENU = "sr5TokenDefaultsMenu"

// The families, in the order of the window
export const TOKEN_FAMILIES = ["spirit", "sprite", "ice", "device", "drone", "agent"]

/**
 * The family of an actor about to be created, or null when the system gives its token alone (characters,
 * grunts, storage).
 * @param {string} type actor type
 * @param {string} [deviceType] system.matrix.deviceType of a device ("ice", "host"...)
 */
export function tokenFamily(type, deviceType) {
  switch (type) {
    case "actorSpirit": return "spirit"
    case "actorSprite": return "sprite"
    case "actorDevice": return deviceType === "ice" ? "ice" : "device"
    case "actorDrone": return "drone"
    case "actorAgent": return "agent"
    default: return null
  }
}

// The bars a token may show: the actor's statusBars (an absent one shows nothing)
export const TOKEN_BAR_CHOICES = ["none", "statusBars.physical", "statusBars.stun", "statusBars.condition", "statusBars.matrix"]
export const TOKEN_DISPOSITION_CHOICES = ["SECRET", "HOSTILE", "NEUTRAL", "FRIENDLY"]
export const TOKEN_DISPLAY_CHOICES = ["NONE", "CONTROL", "OWNER_HOVER", "HOVER", "OWNER", "ALWAYS"]

/**
 * What each field accepts. "" everywhere = as the system does.
 * size: a number of squares (0.5 to 10); sightRange: metres (0 to 1000).
 */
export const TOKEN_FIELDS = {
  size: "number", disposition: TOKEN_DISPOSITION_CHOICES, displayName: TOKEN_DISPLAY_CHOICES,
  displayBars: TOKEN_DISPLAY_CHOICES, bar1: TOKEN_BAR_CHOICES, bar2: TOKEN_BAR_CHOICES,
  sight: ["on", "off"], sightRange: "number"
}

const NUMBER_LIMITS = {
  size: [0.5, 10], sightRange: [0, 1000]
}

/** A family's row, cleaned: unknown keys and values dropped, numbers kept in their limits, "" for unset. */
export function cleanTokenRow(row) {
  const clean = {
  }
  for (const [key, accepted] of Object.entries(TOKEN_FIELDS)) {
    const value = row?.[key]
    if (value === undefined || value === null || value === "") continue
    if (accepted === "number") {
      const number = Number(value)
      const [min, max] = NUMBER_LIMITS[key]
      if (Number.isFinite(number)) clean[key] = Math.min(max, Math.max(min, number))
    } else if (accepted.includes(String(value))) clean[key] = String(value)
  }
  return clean
}

/** Every family's row, cleaned: a family missing from the setting is "as the system does". */
export function cleanTokenDefaults(value) {
  return Object.fromEntries(TOKEN_FAMILIES.map(family => [family, cleanTokenRow(value?.[family])]))
}

/** The rows as saved in the world. */
export function currentTokenDefaults() {
  let value
  try {
    value = game.settings.get("sr5", TOKEN_DEFAULTS_SETTING)
  } catch (_err) {
    value = null
  }
  return cleanTokenDefaults(value)
}

/**
 * A row as token data: the fields a TokenDocument (or a prototype token) takes, flat.
 * @param {object} row a cleaned row
 * @param {object} consts CONST.TOKEN_DISPOSITIONS and CONST.TOKEN_DISPLAY_MODES (passed for the tests)
 */
export function tokenDataOf(row, consts = globalThis.CONST) {
  const data = {
  }
  if (row.size !== undefined) {
    data.width = row.size
    data.height = row.size
  }
  if (row.disposition) data.disposition = consts.TOKEN_DISPOSITIONS[row.disposition]
  if (row.displayName) data.displayName = consts.TOKEN_DISPLAY_MODES[row.displayName]
  if (row.displayBars) data.displayBars = consts.TOKEN_DISPLAY_MODES[row.displayBars]
  if (row.bar1) data["bar1.attribute"] = row.bar1 === "none" ? null : row.bar1
  if (row.bar2) data["bar2.attribute"] = row.bar2 === "none" ? null : row.bar2
  if (row.sight) data["sight.enabled"] = row.sight === "on"
  if (row.sightRange !== undefined) data["sight.range"] = row.sightRange
  return data
}

/** What to merge in a token's own data for this family (empty when nothing is set). */
export function tokenChanges(family) {
  if (!TOKEN_FAMILIES.includes(family)) return {
  }
  return tokenDataOf(currentTokenDefaults()[family])
}

/** The same, under "prototypeToken.", for an actor's creation data. */
export function prototypeChanges(family) {
  return Object.fromEntries(Object.entries(tokenChanges(family)).map(([key, value]) => [`prototypeToken.${key}`, value]))
}

/** The public face, for the modules: game.sr5.tokenDefaults */
export const SR5TokenDefaultsApi = Object.freeze({
  families: TOKEN_FAMILIES, family: tokenFamily, tokenChanges, prototypeChanges, current: currentTokenDefaults
})
