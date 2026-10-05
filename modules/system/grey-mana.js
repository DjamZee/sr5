// Grey mana (Better Than Bad p. 140-141). An armor integration (rating 1-6) or a tattoo (rating 1-3) give
// their rating to "system.magic.greyMana" through a custom effect; they do not add up, only the higher
// rating counts. It adds dice against any targeted or area magic; the armor's also against beneficial
// spells, the tattoo's not. An Awakened wearer loses that many dice on every test using Magic, and the
// spells they sustain lose 1 Force and 1 hit (applied at the cast, GM ruling of 05/10).

// { rating, fromArmor } from the modifiers the items left. On a tie the armor wins: its effect is the
// wider one, and the armor is worn either way.
export function greyManaOf(modifiers){
  let rating = 0, fromArmor = false
  for (const m of modifiers ?? []){
    const value = Number(m.value) || 0
    const armor = m.type === "itemArmor"
    if (value > rating || (value === rating && value > 0 && armor)) {
      rating = value
      fromArmor = armor
    }
  }
  return {
    rating, fromArmor
  }
}

export function isAwakened(actorData){
  return (actorData?.specialAttributes?.magic?.augmented?.value ?? 0) > 0
}

// Better Than Bad p. 140: the dice count against spells and targeted magical powers. A weapon focus
// (isMagical weapon) deals magical damage but stays a physical attack: no dice against it (review of Tess).
export function greyManaAppliesTo(damage){
  if (damage?.resistanceType?.startsWith("directSpell")) return true
  return damage?.source === "magical" && !damage?.weaponFocus
}

// Dice against magic: always against harmful magic, against a beneficial spell only for the armor.
// `beneficial` is never set yet: the armor's effect against beneficial spells (Better Than Bad p. 140)
// waits for a resistance test against beneficial spells, which the system does not have.
export function greyManaResistanceDice(greyMana, beneficial = false){
  if (!greyMana?.value) return 0
  if (beneficial && !greyMana.fromArmor) return 0
  return greyMana.value
}

// Sustained spell cast while wearing grey mana: Force and hits each lose 1
export function greyManaSustainedPenalty(actorData, duration){
  if (duration !== "sustained" || !isAwakened(actorData)) return 0
  return actorData?.magic?.greyMana?.value > 0 ? 1 : 0
}

// Called once the items have left their modifiers and Magic is known
export function updateGreyMana(actor, label){
  const greyMana = actor.system.magic?.greyMana
  if (!greyMana) return
  const {
    rating, fromArmor
  } = greyManaOf(greyMana.modifiers)
  greyMana.value = rating
  greyMana.fromArmor = fromArmor
  if (!rating || !isAwakened(actor.system)) return
  //The penalty on every test linked to Magic, read when the roll is prepared (roll-helpers/situational.js)
  if (!actor.situationalEffects) actor.situationalEffects = []
  actor.situationalEffects.push({
    source: label, value: -rating, when: "", situational: false, scope: "magic"
  })
}

// Adds the resistance dice to a roll against magic
export function addGreyManaResistance(rollData, actor, label, beneficial = false){
  const dice = greyManaResistanceDice(actor?.system?.magic?.greyMana, beneficial)
  if (!dice) return rollData
  rollData.dicePool.modifiers.push({
    type: "greyMana", label, value: dice
  })
  return rollData
}
