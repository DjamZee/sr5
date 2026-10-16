// Skill power (Aetherology p. 39): "an active skill in place of a power", never one linked to the Matrix nor of the
// Conjuring, Enchanting or Resonance groups. Pure rules, no Foundry dependency.

export const SKILL_POWER_KEY = "skill"

// Matrix skills (SR5 p. 147-148: Computer, Cybercombat, Electronic Warfare, Hacking, Software, and the Hardware of the
// Electronics group); Conjuring (Summoning, Binding, Banishing) and Enchanting (Alchemy, Artificing, Disenchanting)
export const SKILL_POWER_EXCLUDED = ["computer", "cybercombat", "electronicWarfare", "hacking", "software", "hardware",
  "summoning", "binding", "banishing", "alchemy", "artificing", "disenchanting"]

// skills: {key: label}; resonanceSkills: {key: label} of the Resonance group
export function grantableSkills(skills, resonanceSkills = {
}){
  return Object.fromEntries(Object.entries(skills || {
  }).filter(([key]) => !SKILL_POWER_EXCLUDED.includes(key) && !(key in resonanceSkills)))
}

export function isSkillPower(item){
  return item?.type === "itemPower" && Object.values(item.system?.systemEffects ?? {
  }).some(e => e?.category === "spiritPower" && e.value === SKILL_POWER_KEY)
}

// The skills a spirit has from its Skill powers: [key], those allowed only
export function skillsFromPowers(items){
  const keys = new Set()
  for (const item of items || []) {
    const key = item?.system?.grantedSkill
    if (isSkillPower(item) && key && !SKILL_POWER_EXCLUDED.includes(key)) keys.add(key)
  }
  return [...keys]
}
