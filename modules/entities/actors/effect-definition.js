// The effects a player's spell (or complex form, power) transfers are defined on her own sheet: their type,
// value, multiplier and target, and whether the spell is resisted at all. When they go to an actor she does not
// own, the GM compares them with the reference item (the compendium it came from, else one of the same name) and
// sees, before anything is applied, what will be: the sheet's word is never taken for it

/**
 * The value an effect entry gives (applyExternalEffect)
 * @param {object} e the entry: type, value, multiplier
 * @param {object} roll hits and netHits
 * @param {number} rating the item rating
 */
export function entryValue(e, roll, rating) {
  const base = String(e?.type ?? "").replace("Replace", "")
  const m = e?.multiplier || 1
  if (base === "hits") return Math.floor((roll?.hits ?? 0) * m)
  if (base === "netHits") return Math.floor((roll?.netHits ?? 0) * m)
  if (base === "value") return Math.floor((Number(e.value) || 0) * m)
  if (base === "rating") return Math.floor((Number(rating) || 0) * m)
  return undefined
}

/** The transferred entries of an effects list, reduced to what decides what is applied */
export function transferEntries(list) {
  return Object.values(list ?? {
  }).filter(e => e?.transfer).map(e => ({
    target: e.target ?? "", category: e.category ?? "", type: e.type ?? "",
    value: Number(e.value) || 0, multiplier: Number(e.multiplier) || 1,
  }))
}

const keyOf = e => `${e.category}|${e.target}`
const sameEntry = (a, b) => a.type === b.type && a.multiplier === b.multiplier &&
  (!String(a.type).startsWith("value") || a.value === b.value)

/**
 * How a sheet's definition differs from the reference
 * @param {object} sheet {resisted, entries} of the item on the sheet
 * @param {object|null} reference the same, of the reference item; null when none was found
 * @returns {{resistedDiffers: boolean, added: object[], missing: object[], changed: object[][]}}
 */
export function compareDefinitions(sheet, reference) {
  const out = {
    resistedDiffers: false, added: [], missing: [], changed: []
  }
  if (!reference) return out
  out.resistedDiffers = !!sheet.resisted !== !!reference.resisted
  const refs = new Map(reference.entries.map(e => [keyOf(e), e]))
  const seen = new Set()
  for (const e of sheet.entries) {
    const r = refs.get(keyOf(e))
    if (!r) out.added.push(e)
    else {
      seen.add(keyOf(e))
      if (!sameEntry(e, r)) out.changed.push([e, r])
    }
  }
  for (const r of reference.entries) if (!seen.has(keyOf(r))) out.missing.push(r)
  return out
}

/** Nothing differs */
export function definitionsMatch(diff) {
  return !diff.resistedDiffers && !diff.added.length && !diff.missing.length && !diff.changed.length
}
