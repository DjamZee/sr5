// Dispelling (SR5 p. 298): each net hit reduces the net hits of the targeted spell, which "can reduce the
// spell's effectiveness" (the visibility modifier of Darkness). Only what the hits gave goes down: an effect
// of a fixed value (or of the item rating) keeps it until the spell ends at 0 hits

const READS_HITS = ["hits", "netHits"]

/**
 * The transfer entry of the source item that gave this effect: same target (and category when both have one)
 * @param {object} entries the source item's customEffects or itemEffects
 * @param {string} target the effect's target key (customEffects) or label (itemEffects, through labelOf)
 * @param {string} [category]
 * @param {function} [labelOf] key -> label, when the effect only keeps the label
 */
export function sourceEntryOf(entries, target, category, labelOf = k => k) {
  const list = Object.values(entries ?? {
  }).filter(e => e?.transfer && labelOf(e.target) === target)
  return list.find(e => !category || !e.category || e.category === category) ?? null
}

/**
 * The value an effect keeps once its spell lost `reduction` hits; null when it does not change
 * @param {object|null} entry the source entry (sourceEntryOf)
 * @param {number} value the effect's current value
 * @param {number} reduction the dispelling net hits
 */
export function dispelledValue(entry, value, reduction) {
  if (!entry || !(reduction > 0)) return null
  const base = String(entry.type ?? "").replace("Replace", "")
  if (!READS_HITS.includes(base)) return null
  //A negative multiplier (Decrease Attribute, -1 per net hit) gives a malus: it goes back up toward 0, never past it
  const lost = Math.floor(reduction * (entry.multiplier || 1))
  const current = Number(value) || 0
  const next = current < 0 ? Math.min(0, current - lost) : Math.max(0, current - lost)
  return next === current ? null : next
}
