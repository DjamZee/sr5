// Cyberlimbs (SR5 p. 459-460): a cyberlimb has its own Strength and Agility, its base (3, or more when customized)
// raised by the Strength and Agility enhancements installed in it, one of each type. "Quand un membre en particulier
// est utilisé pour un test (tel que porter une attaque avec un bras cybernétique), les attributs de ce membre sont
// utilisés": a weapon held by a cyberlimb attacks with its Agility and hits with its Strength. Averaging the limbs for
// a whole-body test, and the weakest limb for fine coordination, stay with the gamemaster: the actor's attributes
// are left as they are, as in the book's stat blocks (Fragmentation p. 34: AGI 4 (8)).
import {
  situationalValue
} from "../rolls/roll-helpers/situational.js"

export const LIMB_ATTRIBUTES = ["strength", "agility"]
const ENHANCEMENT_TARGET = /^system\.attributes\.(strength|agility)\.augmented$/

export const isLimbAttributeTarget = target => typeof target === "string" && ENHANCEMENT_TARGET.test(target)

const effectsOf = system => Object.values(system?.customEffects ?? {
})

// The attribute an enhancement raises and by how much, for each of its effects aimed at Strength or Agility
export function enhancementBonuses(system){
  const bonuses = []
  for (const effect of effectsOf(system)){
    const attribute = effect?.target?.match?.(ENHANCEMENT_TARGET)?.[1]
    if (!attribute) continue
    //A wireless bonus with the wireless off counts no more in the limb than on the body (applyCustomEffects)
    if (effect.wifi && !system?.wirelessTurnedOn) continue
    const value = situationalValue(effect, system)
    if (value) bonuses.push({
      attribute, value
    })
  }
  return bonuses
}

export const isCyberlimb = item => item?.type === "itemAugmentation" && item.system?.category === "cyberlimbs"

const accessoryList = system => {
  const list = system?.accessory ?? []
  return Array.isArray(list) ? list : Object.values(list)
}

// The augmentations plugged into a cyberlimb, read from the actor (their rating may have changed since), else
// from the copy the limb keeps
export function limbAccessories(limb, actorItems){
  return accessoryList(limb?.system).map(copy => {
    const live = copy?._id ? actorItems?.get?.(copy._id) : null
    return live ?? copy
  }).filter(a => a?.type === "itemAugmentation")
}

// A cyberlimb's Strength and Agility, with the enhancements that count: one of each type (SR5 p. 460), the highest
export function limbAttributes(limb, actorItems){
  const own = limb?.system?.cyberlimbs ?? {
  }
  const result = {
  }
  for (const attribute of LIMB_ATTRIBUTES){
    const data = own[attribute] ?? {
    }
    const base = (Number(data.base) || 0) + (Number(data.customization) || 0)
    let enhancement = null
    for (const accessory of limbAccessories(limb, actorItems)){
      //An enhancement switched off raises nothing, as any augmentation off (entityActor.js)
      if (!accessory.system?.isActive) continue
      for (const bonus of enhancementBonuses(accessory.system)){
        if (bonus.attribute === attribute && (!enhancement || bonus.value > enhancement.value)) enhancement = {
          value: bonus.value, name: accessory.name
        }
      }
    }
    result[attribute] = {
      base, enhancement, value: base + (enhancement?.value ?? 0)
    }
  }
  return result
}

// Whether an augmentation is plugged into one of the actor's cyberlimbs: its Strength and Agility then belong to
// that limb, not to the whole body
export function hostLimb(itemId, actorItems){
  for (const item of actorItems ?? []){
    if (!isCyberlimb(item)) continue
    if (accessoryList(item.system).some(a => a?._id === itemId)) return item
  }
  return null
}

// The names of the enhancements plugged into any of the actor's cyberlimbs
export function limbEnhancementNames(actorItems){
  const names = new Set()
  for (const item of actorItems ?? []){
    if (!isCyberlimb(item)) continue
    for (const accessory of limbAccessories(item, actorItems)){
      if (enhancementBonuses(accessory.system).length) names.add(accessory.name)
    }
  }
  return names
}

// The active cyberlimb a weapon is held by, or null (held by the body, or the limb gone or switched off)
export function weaponLimb(weaponSystem, actorItems){
  const id = weaponSystem?.heldByLimb
  if (!id) return null
  const limb = actorItems?.get?.(id)
  return isCyberlimb(limb) && limb.system.isActive ? limb : null
}

// The Strength or Agility a weapon uses: its limb's when it is held by one, else the actor's augmented attribute
export function weaponAttribute(attribute, weaponSystem, actor){
  const limb = weaponLimb(weaponSystem, actor?.items)
  if (limb) return limbAttributes(limb, actor.items)[attribute].value
  return actor?.system?.attributes?.[attribute]?.augmented?.value ?? 0
}

// A weapon's dice pool modifiers with the actor's Agility swapped for its limb's. New objects: the list shares the
// actor's skill modifiers. The label stays the attribute's, which the roll dialog matches its boxes against
export function withLimbAgility(modifiers, agilityLabel, value){
  return (modifiers ?? []).map(m => (m?.type === "linkedAttribute" && m.source === agilityLabel ? {
    ...m, value
  } : m))
}

// The cyberlimbs a weapon can be held by: the actor's active ones
export function limbChoices(actorItems){
  const choices = {
  }
  for (const item of actorItems ?? []){
    if (isCyberlimb(item) && item.system.isActive) choices[item.id] = item.name
  }
  return choices
}
