//Effects that REPLACE a value instead of adding to it (valueReplace, ratingReplace, hitsReplace, netHitsReplace).
//Animal Sense and Eyes of the Pack (Street Grimoire p. 106) make the net hits the Limit of Perception; the No Future
//instruments (No Future p. 152) give the Limit of Performance.

export function isReplaceEffectType(type){
  return typeof type === "string" && type.endsWith("Replace")
}

//The value an effect gave in place of the computed one, read from the modifiers, or undefined. Two of them (two
//instruments) keep the highest
export function replacedValue(modifiers){
  if (!Array.isArray(modifiers)) return undefined
  const values = modifiers.filter(m => m?.replace).map(m => Number(m.value) || 0)
  return values.length ? Math.max(...values) : undefined
}

//The modifier a replacing effect leaves on its target. A target whose base is a number (an attribute, the Limit of a
//sense) keeps "− base + value", so that base + modifiers gives the value; a skill Limit has the KEY of its linked Limit
//as base ("socialLimit"), a text: its modifier is the value itself, read by replacedValue()
export function replaceModifierValue(base, value){
  if (typeof base !== "number") return value
  return -Math.max(base, 0) + value
}
