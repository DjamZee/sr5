// The Essence printed in a grunt's profile (SR5 p. 381), typed on the grunt sheet (essence.hbs).
// Relecture djamz.17: the field had no bounds (emptied gave 0, -2 gave -2, 9 gave 9, "4,5" gave NaN).
// Kept between 0 and 6, the French decimal comma read, and an emptied field back to 6, as the help says ("laissez 6").

export const GRUNT_PROFILE_ESSENCE_MAX = 6
export const GRUNT_PROFILE_ESSENCE_FIELD = "system.essence.base"

/** The profile's Essence from what was typed: a number or a text such as "4,5". Unreadable keeps the previous value. */
export function gruntProfileEssence(raw, previous = GRUNT_PROFILE_ESSENCE_MAX) {
  let value = raw
  if (typeof raw === "string") value = raw.trim() === "" ? GRUNT_PROFILE_ESSENCE_MAX : Number(raw.trim().replace(",", "."))
  if (value === null || value === undefined) value = GRUNT_PROFILE_ESSENCE_MAX
  if (!Number.isFinite(value)) value = Number.isFinite(previous) ? previous : GRUNT_PROFILE_ESSENCE_MAX
  return Math.min(GRUNT_PROFILE_ESSENCE_MAX, Math.max(0, value))
}

/** The sheet's submitted data, its Essence read from the field as typed (the Number cast loses "4,5") */
export function gruntEssenceFromForm(form, data, previous) {
  const field = form?.elements?.[GRUNT_PROFILE_ESSENCE_FIELD]
  if (!field) return data
  const essence = gruntProfileEssence(String(field.value ?? ""), previous)
  if (GRUNT_PROFILE_ESSENCE_FIELD in data) data[GRUNT_PROFILE_ESSENCE_FIELD] = essence
  else foundry.utils.setProperty(data, GRUNT_PROFILE_ESSENCE_FIELD, essence)
  return data
}
