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
 * The source entry an effect held up by an item came from: the entry its flag names (applyExternalEffect), else, for
 * an older effect, the entry of its target. Read the same way by the player who dispels and by the GM who checks
 * @param {object} source the source item's system
 * @param {object} effect the effect's system
 * @param {string} [sourceKey] the effect's flags.sr5.sourceEntry
 * @param {function} [labelOf] key -> label, for an effect on an item (itemEffects keep the label only)
 */
export function linkedEntryOf(source, effect, sourceKey, labelOf = k => k) {
  const custom = Object.values(effect?.customEffects ?? {
  })
  const listed = source?.[custom.length ? "customEffects" : "itemEffects"]?.[sourceKey]
  if (listed?.transfer) return listed
  return custom.length ? sourceEntryOf(source?.customEffects, custom[0]?.target, custom[0]?.category) :
    sourceEntryOf(source?.itemEffects, effect?.target, null, labelOf)
}

/**
 * The value an effect keeps once its spell lost `reduction` hits; null when it does not change
 * @param {object|null} entry the source entry (sourceEntryOf)
 * @param {number} value the effect's current value
 * @param {number} reduction the dispelling net hits
 * @param {number|null} [hits] the hits the effect stands on now (effectHits), or at least (the GM's guard). The fewest
 *   hits that give its value are a floor too: the higher of the two is taken, never more than the true hits, so the
 *   GM's bound is exact when his own flags tell, and never lets an effect go further than the card allows
 */
export function dispelledValue(entry, value, reduction, hits = null) {
  if (!entry || !(reduction > 0)) return null
  const kind = String(entry.type ?? "").replace("Replace", "")
  if (!READS_HITS.includes(kind)) return null
  const m = Number(entry.multiplier) || 1
  const current = Number(value) || 0
  //The value is worked out again from the hits left, as applyExternalEffect did: a multiplier of 0.5 rounds the same
  //way (4 hits give 2, 3 hits give 1). A negative multiplier (Decrease Attribute) goes back up toward 0
  const fewest = fewestHits(current, m)
  const known = Number.isFinite(hits) ? hits : null
  if (fewest === null && known === null) return null
  const from = Math.max(fewest ?? 0, known ?? 0)
  const next = Math.floor(Math.max(0, from - reduction) * m) + 0
  return next === current ? null : next
}

//The fewest hits that give this value through the multiplier (applyExternalEffect rounds down); null when none does
function fewestHits(value, m) {
  for (let h = 0; h <= 200; h++) if (Math.floor(h * m) === value) return h
  return null
}

/**
 * The hits an effect stands on now: those it was made from (flags.sr5.sourceBase, applyExternalEffect), less what its
 * spell lost since (flags.sr5.sourceHits against the spell's hits before this card). null for an older effect
 * @param {object} flags the effect's flags.sr5
 * @param {number} spellHits the spell's hits before this dispelling
 */
export function effectHits(flags, spellHits) {
  const base = Number(flags?.sourceBase), atCast = Number(flags?.sourceHits)
  if (!Number.isFinite(base) || !Number.isFinite(atCast)) return null
  return Math.max(0, base - Math.max(0, atCast - (Number(spellHits) || 0)))
}
