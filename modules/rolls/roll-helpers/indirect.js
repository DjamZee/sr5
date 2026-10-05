// Indirect effects: an effect an actor carries that changes the rolls of OTHER actors. Two reaches:
// - "targeter": whoever designates the bearer as the target of a roll (e.g. a GM-made "Rascal" quality,
//   -2 dice to the matrix tests aimed at its bearer; Concealment, SR5 p. 398, -Magic dice to Perception);
// - "aura": whoever rolls within a radius in meters of the bearer's token, everyone, allies or enemies
//   (by token disposition), the bearer included unless the aura is for enemies.
// Nothing is written on the affected actor: the effects are worked out when the roll is prepared, and
// offered in the roll dialog as boxes ticked beforehand, that the player can untick.

export const APPLY_SELF = "self"
export const APPLY_TARGETER = "targeter"
export const APPLY_AURA = "aura"

export const INDIRECT_ROLLS = ["all", "attack", "rangedAttack", "meleeAttack", "spell", "matrix", "perception", "social"]
export const AURA_WHO = ["all", "allies", "enemies"]

const MATRIX_TYPES = ["matrixAction", "iceAttack", "complexForm", "resonanceAction"]
// The rolls aimed at a target. A defense or a resistance is not: its "target" is the attacker
const AIMED_TYPES = ["attack", "spell", "preparation", "skillDicePool", "grappleClinch", "ramming", "pickpocket", "sensorTarget", "spritePower", ...MATRIX_TYPES]

// On the item sheet, such an effect has the category "indirectEffects" and a target
// "indirect.<rolls concerned>.<test|limit>"; who it reaches is picked below it (whoever targets me by default)
export const INDIRECT_PREFIX = "indirect."

export function isIndirect(customEffect){
  return typeof customEffect?.target === "string" && customEffect.target.startsWith(INDIRECT_PREFIX)
}

// The effect as kept on its bearer, or null when its target is not a known one
export function indirectEffectOf(customEffect, source, value){
  let [rolls, on] = customEffect.target.slice(INDIRECT_PREFIX.length).split(".")
  if (!INDIRECT_ROLLS.includes(rolls) || !["test", "limit"].includes(on)) return null
  return {
    source, value, when: customEffect.when || "", rolls, kind: on === "limit" ? "limit" : "dicePool",
    applyTo: customEffect.applyTo === APPLY_AURA ? APPLY_AURA : APPLY_TARGETER,
    range: customEffect.auraRange, who: AURA_WHO.includes(customEffect.auraWho) ? customEffect.auraWho : "all",
  }
}

// The kinds of roll a prepared test belongs to, for the "rolls concerned" filter
export function rollKinds(test, socialSkills = {
}){
  let kinds = new Set(["all"])
  let type = test?.type, typeSub = test?.typeSub
  if (AIMED_TYPES.includes(type)) kinds.add("aimed")
  if (type === "attack"){
    kinds.add("attack")
    // typeSub is the weapon's category; a grenade is thrown, a ranged attack (SR5 p. 183)
    if (typeSub === "rangedWeapon" || typeSub === "grenade") kinds.add("rangedAttack")
    if (typeSub === "meleeWeapon") kinds.add("meleeAttack")
  }
  if (type === "spell") kinds.add("spell")
  if (MATRIX_TYPES.includes(type)) kinds.add("matrix")
  if (type === "skillDicePool"){
    if (typeSub === "perception") kinds.add("perception")
    if (typeSub && Object.hasOwn(socialSkills, typeSub)) kinds.add("social")
  }
  return kinds
}

export function rollMatches(effect, kinds){
  return kinds.has(effect.rolls || "all")
}

// Whether a roller is reached by an aura: in range, and of the side the aura is for.
// Dispositions are Foundry's: 1 friendly, 0 neutral, -1 hostile, -2 secret
export function auraReaches(effect, distanceInMeters, bearerDisposition, rollerDisposition, isBearer){
  let range = parseFloat(effect.range)
  if (Number.isFinite(range) && range > 0 && !(distanceInMeters <= range)) return false
  switch (effect.who || "all"){
    // A neutral (or secret) token is nobody's ally and nobody's enemy
    case "allies": return isBearer || (Math.abs(bearerDisposition) === 1 && bearerDisposition === rollerDisposition)
    case "enemies": return !isBearer && bearerDisposition * rollerDisposition === -1
    default: return true
  }
}

// The boxes an indirect effect becomes in the roll dialog.
// display: "name" (the source and its bearer), "neutral" (a plain label), "hidden" (no box, applied as is).
// An effect a player's character carries is always shown with its name: neither setting may let a player
// slip an unseen modifier into the GM's rolls
export function indirectOffer(effect, bearerName, index, display, labels, playerOwned = false){
  if (playerOwned) display = "name"
  let reach = effect.applyTo === APPLY_AURA ? labels.aura : labels.targeter
  let label = display === "name" ? `${effect.source} (${reach} : ${bearerName})` : labels.neutral
  return {
    key: `indirect_${effect.kind}_${index}`, kind: effect.kind, label, when: effect.when || "",
    value: effect.value, isMalus: effect.value < 0, checked: true, hidden: display === "hidden", indirect: true
  }
}

// Every box a roll gets from other actors' effects.
// target: the targeted actor's {name, effects, playerOwned} (null when no actor is targeted)
// auras: one {key (the actor), name, effects, distance (meters), disposition, isBearer, playerOwned} per token
// on the scene. An actor with several tokens counts once, by its nearest token
export function gatherIndirectOffers({
  kinds, target, auras = [], rollerDisposition, display = "name", labels
}){
  let offers = [], index = 0
  for (let effect of kinds.has("aimed") ? target?.effects || [] : []){
    if (effect.applyTo !== APPLY_TARGETER || !rollMatches(effect, kinds)) continue
    offers.push(indirectOffer(effect, target.name, index++, display, labels, target.playerOwned))
  }
  let seen = new Set()
  for (let source of [...auras].sort((a, b) => (b.isBearer - a.isBearer) || (a.distance - b.distance))){
    if (source.key !== undefined){
      if (seen.has(source.key)) continue
      seen.add(source.key)
    }
    for (let effect of source.effects || []){
      if (effect.applyTo !== APPLY_AURA || !rollMatches(effect, kinds)) continue
      if (!auraReaches(effect, source.distance, source.disposition, rollerDisposition, source.isBearer)) continue
      offers.push(indirectOffer(effect, source.name, index++, display, labels, source.playerOwned))
    }
  }
  return offers
}

// Ticked beforehand: the modifier is already in the pool or on the limit, under the box's key
export function applyOffer(rollData, offer){
  if (offer.kind === "limit"){
    rollData.limit.modifiers = rollData.limit.modifiers || {
    }
    rollData.limit.modifiers[offer.key] = {
      label: offer.label, value: offer.value
    }
  } else {
    rollData.dicePool.modifiers = rollData.dicePool.modifiers || []
    rollData.dicePool.modifiers.push({
      type: offer.key, label: offer.label, value: offer.value
    })
  }
}
