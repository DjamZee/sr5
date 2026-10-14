//A called shot technique that only eases some attacks: the effect on system.itemsProperties.martialArts.<key>.modifier
//may carry a "skills" field, the combat skills (a weapon's weaponSkill.category) whose attacks it eases.
//"armed" stands for every attack made with a weapon, that is with any skill but Unarmed Combat.
//Without the field, the technique eases every attack, as before.
export const ARMED_ATTACKS = "armed"

const MARTIAL_ARTS_MODIFIER = /^system\.itemsProperties\.martialArts\.[A-Za-z]+\.modifier$/

export function isMartialArtsModifierTarget(target){
  return typeof target === "string" && MARTIAL_ARTS_MODIFIER.test(target)
}

//The skills of an effect, a list or a comma-separated string; null when it names none (every attack)
export function calledShotSkillsOf(effect){
  let skills = effect?.skills
  if (typeof skills === "string") skills = skills.split(",")
  if (!Array.isArray(skills)) return null
  skills = skills.map(s => String(s).trim()).filter(Boolean)
  return skills.length ? skills : null
}

export function calledShotSkillMatches(skills, weaponSkill){
  if (!skills) return true
  if (skills.includes(weaponSkill)) return true
  return skills.includes(ARMED_ATTACKS) && !!weaponSkill && weaponSkill !== "unarmedCombat"
}

//The value the effect gives, as the usual types read it
export function calledShotEffectValue(effect, itemSystem){
  if (effect?.type === "rating") return Number(itemSystem?.itemRating) || 0
  if (effect?.type === "hits") return Number(itemSystem?.hits) || 0
  return Number(effect?.value) || 0
}

//The technique modifier for an attack made with this skill: its total, less what the techniques kept for other skills give
export function calledShotModifierFor(modifier, weaponSkill){
  let value = Number(modifier?.value) || 0
  for (const m of modifier?.modifiers ?? []) {
    if (m?.skills && !calledShotSkillMatches(m.skills, weaponSkill)) value -= Number(m.value) || 0
  }
  return value
}
