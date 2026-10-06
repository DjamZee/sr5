// Background count rules shared by the scene, the actor and the area templates.

// Aetherologie p. 34: the count runs from -24 to +24
export function clampBackgroundCount(value){
  return Math.max(-24, Math.min(24, Number(value) || 0))
}

// What a count weighs on one tradition. Below 0 (mana ebb or void) its absolute value is a penalty for
// everyone, alignment or not (Aetherologie p. 34); above 0 it helps the aligned tradition (Street
// Grimoire p. 30) and hinders the others.
export function backgroundCountFor(value, alignment, tradition){
  const count = clampBackgroundCount(value)
  if (count <= 0) return count
  return alignment && alignment === tradition ? count : -count
}

// Shadow Spells p. 25: the Mana Flux ritual raises a negative count by 1, Mana Ebb lowers a positive one
// by 1, each for [Force] hours. Recognised by the ritual's name, in French or in English.
export function manaShiftKind(name){
  const n = String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  if (/flux mana|mana flux/.test(n)) return "flux"
  if (/creux mana|mana ebb/.test(n)) return "ebb"
  return ""
}

// The ritual only succeeds where it can act (Shadow Spells p. 25, GM ruling of 05/10 on Mana Ebb, whose
// text contradicts itself): Flux on a negative count, Ebb on a positive one, never on a normal count.
export function manaShiftPossible(kind, baseCount){
  const base = clampBackgroundCount(baseCount)
  if (kind === "flux") return base < 0
  if (kind === "ebb") return base > 0
  return false
}

// Sources still running at the given world time
export function activeManaShifts(flags, now){
  return (flags?.backgroundCountSources ?? []).filter(s => (Number(s.expires) || 0) > now)
}

// The scene's count with its running rituals. They add up (GM ruling of 05/10), but never take the count
// past 0: their effect is "negated where the background count is normal".
export function effectiveSceneBackgroundCount(flags, now){
  const base = clampBackgroundCount(flags?.backgroundCountValue)
  if (base === 0) return 0
  let shift = 0
  for (const s of activeManaShifts(flags, now)){
    if (s.kind === "flux" && base < 0) shift += 1
    if (s.kind === "ebb" && base > 0) shift -= 1
  }
  return base < 0 ? Math.min(0, base + shift) : Math.max(0, base + shift)
}
