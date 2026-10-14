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

// Grimoire des Ombres p. 30 and p. 87 (the raised limit of an aligned count): the background count weighs on the magic used by an Awakened, i.e. here on the tests made with Magic. It follows the
// attribute in use: added when Magic is picked, removed when Magic gives way to another one.
// Astral combat and assensing carry it whatever the attribute, as on the sheet.
export const ALWAYS_BACKGROUND_COUNT = ["astralCombat", "assensing"]

export function backgroundCountApplies(skillKey, attributeKey){
  return attributeKey === "magic" || ALWAYS_BACKGROUND_COUNT.includes(skillKey)
}

// Grimoire des Ombres p. 87: an aligned background count raises the limit of every test linked to
// Magic (see p. 30). True when the skill already carries it among its limit modifiers, so that it
// is not added a second time.
export function backgroundCountInModifiers(bgCount, modifiers){
  return (bgCount?.modifiers || []).some(b => (modifiers || []).some(m => m.type === b.type && m.source === b.source))
}

// Remove the background count from the dice and the limit, then put it back if it applies:
// a penalty goes to the dice, a bonus to the limit (as utilityActor does for the sheet)
export function syncBackgroundCount(rollData, bgCount, apply){
  let mods = bgCount?.modifiers || []
  if (!mods.length) return rollData
  let isBg = m => mods.some(b => b.type === m.type && b.source === m.label)
  rollData.dicePool.modifiers = rollData.dicePool.modifiers.filter(m => !isBg(m))
  //getLimitModifiers keys a second modifier of the same type as "type_2", "type_3"...
  for (let b of mods){
    for (let [key, m] of Object.entries(rollData.limit.modifiers)){
      if ((key === b.type || key.startsWith(`${b.type}_`)) && m?.label === b.source) delete rollData.limit.modifiers[key]
    }
  }
  //The whole count added under one key by addBackgroundCountLimitModifiers goes too: it is put back below, once
  delete rollData.limit.modifiers.backgroundCount
  if (!apply) return rollData
  for (let b of mods){
    if (bgCount.value < 0) rollData.dicePool.modifiers.push({
      type: b.type, label: b.source, value: b.value
    })
    else rollData.limit.modifiers[b.type] = {
      label: b.source, value: b.value
    }
  }
  return rollData
}

// The window title of the roll dialog follows the pair in use
export function setDialogWindowTitle(element, title){
  let windowTitle = element?.closest?.('.application, .app')?.querySelector('.window-title')
  if (windowTitle) windowTitle.textContent = title
  return !!windowTitle
}

// A deleted knowledge skill takes its kept attribute with it
export async function forgetKnowledgeAttribute(item){
  let actor = item?.parent
  let key = skillAttributeFlagKey("knowledgeSkill", null, item)
  if (actor?.getFlag?.("sr5", SKILL_ATTRIBUTE_FLAG)?.[key] === undefined) return false
  await actor.unsetFlag("sr5", `${SKILL_ATTRIBUTE_FLAG}.${key}`)
  return true
}

// The key of the attribute the pool is built with: the one whose label is the source of its linkedAttribute share
export function linkedAttributeKey(composition, labels, localize){
  let share = (composition || []).find(m => m.type === "linkedAttribute")
  if (!share) return null
  return Object.keys(labels).find(key => localize(labels[key]) === share.source) ?? null
}

// A15 (arbitrage of Élise, 08/10, by SR5 p. 130, which the book applies itself: Gymnastics + Strength p. 137, Unarmed
// Combat + Agility to slip a net, Run & Gun): the attribute menu of a skill test, kept per character, on a test the
// system builds itself (attack, vehicle, ramming, palming, sensors, grapple, movement). Its default is the pair the
// test had; a test without an attribute share of the character (a drone's) is left as it is.
export function offerTestAttribute(rollData, actor, {
  flagKey, titleBase, labels, localize
}){
  if (!actor || actor.type === "actorDrone") return rollData
  let linked = linkedAttributeKey(rollData.dicePool.composition, labels, localize)
  if (!linked) return rollData
  rollData = prepareSkillAttribute(rollData, actor.system, actor.getFlag?.("sr5", SKILL_ATTRIBUTE_FLAG)?.[flagKey], {
    flagKey, linked, titleBase: titleBase ?? rollData.test.title, labels, localize
  })
  //Kept for this test, not for the skill
  if (rollData.skillAttribute) rollData.skillAttribute.keepLabel = "SR5.TestAttributeKeep"
  return rollData
}

// A15, a vehicle test or a ramming by a driven vehicle (manual, remote or jumped in; never the autopilot): the pool
// carries the driver's whole skill test as one share (Vehicle skill + Reaction, Rigger 5.0 p. 175 sq.). It is split
// into the skill and the driver's attribute, which the menu then changes; the choice is kept on the driver's sheet.
export function offerVehicleAttribute(rollData, vehicle, {
  flagKey, labels, localize, driver
}){
  let mode = vehicle?.system?.controlMode, skillKey = vehicle?.system?.pilotSkill
  if (!driver || !skillKey || !["manual", "remote", "rigging"].includes(mode)) return rollData
  let linked = driver.system?.skills?.[skillKey]?.linkedAttribute
  if (!linked || !labels[linked]) return rollData
  let share = rollData.dicePool.composition.find(m => m.type === mode)
  if (share) rollData.dicePool.composition = rollData.dicePool.composition.filter(m => m !== share)
  else {
    share = (rollData.dicePool.modifiers || []).find(m => m.type === mode)
    if (!share) return rollData
    rollData.dicePool.modifiers = rollData.dicePool.modifiers.filter(m => m !== share)
  }
  let linkedValue = attributeValue(driver.system, linked)
  rollData.dicePool.composition.push({
    source: share.source ?? share.label, type: "skillRating", value: (Number(share.value) || 0) - linkedValue
  }, {
    source: localize(labels[linked]), type: "linkedAttribute", value: linkedValue
  })
  rollData.dicePool.base = rollData.dicePool.composition.reduce((total, m) => total + m.value, 0)
  rollData = prepareSkillAttribute(rollData, driver.system, driver.getFlag?.("sr5", SKILL_ATTRIBUTE_FLAG)?.[flagKey], {
    flagKey, linked, titleBase: rollData.test.title, labels, localize
  })
  if (rollData.skillAttribute){
    rollData.skillAttribute.keepLabel = "SR5.TestAttributeKeep"
    //The attributes, and the kept choice, are the driver's, not the vehicle's
    rollData.skillAttribute.holderUuid = driver.uuid
  }
  return rollData
}

// Fill rollData.skillAttribute for the roll dialog and apply the kept attribute, if any
// `preferred`: the attribute a trait offers first (social-traits.js, Cutting Aces p. 150), when none is kept
export function prepareSkillAttribute(rollData, actorData, kept, {
  flagKey, linked, titleBase, alwaysInTitle, labels, localize, preferred = null
}){
  let choices = skillAttributeChoices(actorData, labels)
  if (!choices[linked]) return rollData
  let selected = selectedSkillAttribute(kept && choices[kept] ? kept : preferred, linked, choices)
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
