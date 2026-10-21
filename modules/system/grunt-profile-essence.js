// The Essence printed in a grunt's profile (SR5 p. 381), typed on the grunt sheet (essence.hbs).
// Relecture djamz.17: the field had no bounds (emptied gave 0, -2 gave -2, 9 gave 9, "4,5" gave NaN).
// Kept between 0 and 6, the French decimal comma read, and an emptied field back to 6, as the help says ("laissez 6").
// Relecture du 21/10, D7 (rule read by Élise): a creature with the power Essence Drain has a maximum Essence of twice
// the book's (Dark Terrors p. 169: « un vampire ayant une Essence maximale de 12 »), +1 per grade of Initiation with
// the metamagic Essence Expansion (Expansion d'Essence). The bound is then 12 (+ those grades), not 6.

export const GRUNT_PROFILE_ESSENCE_MAX = 6
// Dark Terrors p. 169: twice the maximum Essence, for a creature with Essence Drain
export const ESSENCE_DRAIN_MAX = 2 * GRUNT_PROFILE_ESSENCE_MAX
export const GRUNT_PROFILE_ESSENCE_FIELD = "system.essence.base"

const ESSENCE_EXPANSION_NAMES = ["expansion d'essence", "essence expansion"]
const normalized = name => String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'").toLowerCase().trim()

/** The metamagic Essence Expansion (Dark Terrors p. 169) is known: the actor's key, or the item by its name, FR or VO */
export function knowsEssenceExpansion(actor) {
  if (actor?.system?.magic?.metamagics?.essenceExpansion === true) return true
  return [...(actor?.items ?? [])].some(i => i?.type === "itemMetamagic" &&
    [i.name, i.flags?.sr5?.nameVO].map(normalized).some(n => ESSENCE_EXPANSION_NAMES.includes(n)))
}

/**
 * The highest Essence a grunt's profile may hold: 6; with Essence Drain, 12, +1 per grade of Initiation when the
 * metamagic Essence Expansion is known (Dark Terrors p. 169)
 */
export function gruntEssenceMax(actor) {
  if (!actor?.system?.specialProperties?.essenceDrain) return GRUNT_PROFILE_ESSENCE_MAX
  const grades = knowsEssenceExpansion(actor) ? Math.max(0, Math.floor(Number(actor.system?.magic?.initiationGrade) || 0)) : 0
  return ESSENCE_DRAIN_MAX + grades
}

/**
 * The profile's Essence from what was typed: a number or a text such as "4,5". Unreadable keeps the previous value.
 * @param {number} [max] the actor's bound (gruntEssenceMax): 6 by default
 */
export function gruntProfileEssence(raw, previous = GRUNT_PROFILE_ESSENCE_MAX, max = GRUNT_PROFILE_ESSENCE_MAX) {
  const bound = Number.isFinite(max) && max > 0 ? max : GRUNT_PROFILE_ESSENCE_MAX
  let value = raw
  if (typeof raw === "string") value = raw.trim() === "" ? GRUNT_PROFILE_ESSENCE_MAX : Number(raw.trim().replace(",", "."))
  if (value === null || value === undefined) value = GRUNT_PROFILE_ESSENCE_MAX
  if (!Number.isFinite(value)) value = Number.isFinite(previous) ? previous : GRUNT_PROFILE_ESSENCE_MAX
  return Math.min(bound, Math.max(0, value))
}

/** The sheet's submitted data, its Essence read from the field as typed (the Number cast loses "4,5") */
export function gruntEssenceFromForm(form, data, previous, max = GRUNT_PROFILE_ESSENCE_MAX) {
  const field = form?.elements?.[GRUNT_PROFILE_ESSENCE_FIELD]
  if (!field) return data
  const essence = gruntProfileEssence(String(field.value ?? ""), previous, max)
  if (GRUNT_PROFILE_ESSENCE_FIELD in data) data[GRUNT_PROFILE_ESSENCE_FIELD] = essence
  else foundry.utils.setProperty(data, GRUNT_PROFILE_ESSENCE_FIELD, essence)
  return data
}
