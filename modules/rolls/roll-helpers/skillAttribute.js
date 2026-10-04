// SR5 p. 130: a skill is not always used with its linked attribute; the gamemaster picks the pair
// (Gymnastics + Strength to climb, p. 137; Computer + Intuition for a matrix perception, p. 237).
// The limit stays the one of the action, not of the attribute (Perception + Charisma keeps the
// Social limit, p. 143; Swimming + Willpower keeps the Physical one, p. 138).
// Arbitrage de DjamZ: the attribute picked in the roll dialog can be kept for that skill of that
// actor, in an actor flag, and is then preselected on the next rolls until it is unchecked.

export const SKILL_ATTRIBUTE_FLAG = "skillAttributes"

const BASE_ATTRIBUTES = ["body", "agility", "reaction", "strength", "willpower", "logic", "intuition", "charisma"]
const SPECIAL_ATTRIBUTES = ["magic", "resonance", "depth"]

// Key under which a choice is kept: the skill key, or the item id for a knowledge skill
export function skillAttributeFlagKey(rollType, rollKey, item){
  if (rollType === "knowledgeSkill") return `knowledge-${item?.id}`
  return rollKey
}

// The attributes the actor can roll with: the eight physical and mental ones, plus Magic,
// Resonance or Depth when it has them (Edge is never paired with a skill)
export function skillAttributeChoices(actorData, labels){
  let choices = {
  }
  for (let key of BASE_ATTRIBUTES){
    if (actorData?.attributes?.[key]) choices[key] = labels[key]
  }
  for (let key of SPECIAL_ATTRIBUTES){
    if (actorData?.specialAttributes?.[key]?.augmented?.value > 0) choices[key] = labels[key]
  }
  return choices
}

export function attributeValue(actorData, key){
  if (SPECIAL_ATTRIBUTES.includes(key)) return actorData?.specialAttributes?.[key]?.augmented?.value || 0
  return actorData?.attributes?.[key]?.augmented?.value || 0
}

// The skill's share of the pool (rating, skill group, the -1 for defaulting, SR5 p. 55) with
// the given attribute in place of the linked one
export function swapLinkedAttribute(composition, source, value){
  return [{
    source, type: "linkedAttribute", value
  }].concat(composition.filter(m => m.type !== "linkedAttribute"))
}

// The attribute to preselect: the kept one if still available, else the linked one
export function selectedSkillAttribute(kept, linked, choices){
  if (kept && choices[kept]) return kept
  return linked
}

// Title of the test with the attribute in use. A knowledge skill names its attribute only
// when it is not the linked one, as before.
export function skillAttributeTitle(choice, localize){
  if (choice.selected === choice.linked && !choice.alwaysInTitle) return choice.titleBase
  return `${choice.titleBase} + ${localize(choice.choices[choice.selected])}`
}

// Fill rollData.skillAttribute for the roll dialog and apply the kept attribute, if any
export function prepareSkillAttribute(rollData, actorData, kept, {
  flagKey, linked, titleBase, alwaysInTitle, labels, localize
}){
  let choices = skillAttributeChoices(actorData, labels)
  if (!choices[linked]) return rollData
  let selected = selectedSkillAttribute(kept, linked, choices)
  rollData.skillAttribute = {
    flagKey, linked, selected, choices, titleBase, alwaysInTitle, keep: !!(kept && choices[kept])
  }
  if (selected !== linked){
    rollData.dicePool.composition = swapLinkedAttribute(rollData.dicePool.composition, localize(choices[selected]), attributeValue(actorData, selected))
    rollData.dicePool.base = rollData.dicePool.composition.reduce((total, m) => total + m.value, 0)
  }
  rollData.test.title = skillAttributeTitle(rollData.skillAttribute, localize)
  return rollData
}
