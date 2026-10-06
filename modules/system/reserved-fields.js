// The fields of an implant, a quality or a character that the gamemaster alone changes (séance G, G16, G19, H22):
// what an update would leave in them, read the way Foundry merges it. Every form counts: flat
// ("system.essence.holeAmount"), half-flat ({"system.essence": {…}}), nested, replaced ("==system", "==essence") and
// deleted ("-=holeAmount", which brings back the default). Comparing the values after the merge, rather than listing
// keys, leaves no form out.

/** The default of each reserved field, as the data models give it (a deleted field comes back to it). */
export const RESERVED_DEFAULTS = {
  underAdapsine: false,
  augmentationBundle: false,
  transhumanGift: false,
  transhumanEssence: 1,
  "essence.holeAmount": 0,
  "essence.holeBase": 0,
}

const DELETED = Symbol("deleted")

/** `path` read in `obj`, undefined when a step is missing. */
export function readPath(obj, path) {
  return String(path).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj)
}

/** An update with its dotted keys spread into objects, merged where two forms meet. */
export function expandChanges(changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return changes
  const out = {
  }
  for (const [key, value] of Object.entries(changes)) {
    const keys = key.split(".")
    let node = out
    for (const k of keys.slice(0, -1)) {
      if (!node[k] || typeof node[k] !== "object") node[k] = {
      }
      node = node[k]
    }
    const last = keys.at(-1)
    const expanded = expandChanges(value)
    if (expanded && typeof expanded === "object" && !Array.isArray(expanded) && node[last] && typeof node[last] === "object") {
      node[last] = mergeExpanded(node[last], expanded)
    } else node[last] = expanded
  }
  return out
}

function mergeExpanded(a, b) {
  const out = {
    ...a
  }
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" ? mergeExpanded(out[k], v) : v
  }
  return out
}

/** What `path` (from the document's root, "system.…") holds once `changes` are merged into `source`. */
export function valueAfterUpdate(source, changes, path) {
  let node = expandChanges(changes)
  let src = source
  const keys = String(path).split(".")
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    const rest = keys.slice(i + 1).join(".")
    if (!node || typeof node !== "object") return DELETED
    if (Object.hasOwn(node, `-=${k}`)) return DELETED
    if (Object.hasOwn(node, `==${k}`)) {
      const replaced = rest ? readPath(node[`==${k}`], rest) : node[`==${k}`]
      return replaced === undefined ? DELETED : replaced
    }
    if (!Object.hasOwn(node, k)) return readPath(src, keys.slice(i).join("."))
    if (i === keys.length - 1) return node[k]
    node = node[k]
    src = src?.[k]
  }
  return DELETED
}

/** The value of a reserved field, its default when missing or deleted. */
function settled(value, field) {
  return value === undefined || value === DELETED ? RESERVED_DEFAULTS[field] : value
}

/**
 * The reserved fields of `source` (a document's source, its `system` inside) that `changes` would change.
 * @param {string[]} fields paths inside `system` ("underAdapsine", "essence.holeAmount")
 * @returns {string[]}
 */
export function reservedChangedBy(source, changes, fields) {
  return (fields ?? []).filter(field => {
    const path = `system.${field}`
    return settled(valueAfterUpdate(source, changes, path), field) !== settled(readPath(source, path), field)
  })
}

/** The reserved values a document holds now, defaults filled in. */
export function reservedValues(system, fields) {
  return Object.fromEntries((fields ?? []).map(field => [field, settled(readPath(system, field), field)]))
}

/** The fields whose value differs from the one expected: what the gamemaster puts back. */
export function reservedMismatches(current, expected) {
  const out = {
  }
  for (const [field, value] of Object.entries(expected ?? {
  })) if (current?.[field] !== value) out[field] = value
  return out
}
