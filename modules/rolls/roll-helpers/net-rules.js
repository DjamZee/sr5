// Nets (Run & Gun p. 25) and net guns (Run & Gun p. 28).
// "Sur une attaque réussie, même en cas d'effleurement (p. 175, SR5), le filet atterrit sur l'adversaire qui est alors
// considéré comme maîtrisé (p. 195, SR5)." To get free: a Complex action and a test of Unarmed Combat + Agility (not
// Strength) or Escape Artist + Agility, threshold = the attacker's net hits. An XL net on a target of normal size gives
// -2 Agility to get free, a standard net on a large target +2 (p. 28). "Le ShockNet a deux charges, la première s'active
// au contact, la seconde au début du tour de combat suivant" (p. 28).
// A subdued character "ne peut accomplir aucune action nécessitant un mouvement physique" and counts as prone for any
// attack against them (SR5 p. 195).

import {
  hasWeaponTrait
} from "../../entities/items/weaponTraits.js"

//The itemEffect types: the net itself, and the second charge of a ShockNet waiting for the next Combat Turn
export const NET_EFFECT = "netEntangled"
export const SHOCKNET_CHARGE = "shockNetCharge"
//The status shown on the token
export const NET_STATUS = "entanglement"
//The Agility modifier of a net of the wrong size (Run & Gun p. 28)
export const NET_SIZE_MODIFIER = 2

const normalize = text => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const NET_NAME = /\bfilets?\b|\bnets?\b|net ?gun|shocknet|shrednet/
const SHOCK_NAME = /shock ?net/
const XL_NAME = /\bxl\b/

/**
 * The net a weapon throws or fires: its trait (catalog keys "net", "netXL", "shockNet") or, for the compendium items that
 * carry none, its name in French or in English. Ranged weapons only.
 * @returns {{xl: boolean, shock: boolean}|null}
 */
export function netOf(item) {
  const data = item?.system
  if (!data || data.category !== "rangedWeapon") return null
  const name = normalize(item.name)
  const traitNet = hasWeaponTrait(data, "net") || hasWeaponTrait(data, "netXL") || hasWeaponTrait(data, "shockNet")
  if (!traitNet && !NET_NAME.test(name)) return null
  return {
    xl: hasWeaponTrait(data, "netXL") || XL_NAME.test(name),
    shock: hasWeaponTrait(data, "shockNet") || SHOCK_NAME.test(name),
  }
}

/** The net lands on a hit, a graze included (a tie, SR5 p. 175) */
export function netLands(netHits) {
  return Number.isFinite(netHits) && netHits >= 0
}

/** A target of large size, for the size of the net: a troll (Run & Gun p. 28 makes the standard model for "les métahumains, trolls exceptés") */
export function isLargeTarget(actor) {
  const metatype = actor?.system?.biography?.metatype || actor?.system?.biography?.characterMetatype
  return metatype === "troll"
}

/** The Agility modifier to get free: -2 in an XL net for a normal target, +2 in a standard net for a large one */
export function netSizeModifier(xl, large) {
  if (xl && !large) return -NET_SIZE_MODIFIER
  if (!xl && large) return NET_SIZE_MODIFIER
  return 0
}

/** The net effect the actor is caught in, or null */
export function netEffectOf(actor) {
  return actor?.items?.find?.(i => i.type === "itemEffect" && i.system?.type === NET_EFFECT) ?? null
}

/** Getting free: as many hits as the threshold, and at least one (a graze leaves a threshold of 0) */
export function netEscaped(hits, threshold) {
  return hits >= Math.max(Number(threshold) || 0, 1)
}

/** What a hit with a net does to the target's DV: a net without DV deals nothing; a graze deals only a contact charge */
export function netDamage({
  base, netHits, electric
}) {
  if (!(base > 0)) return 0
  if (netHits === 0) return electric ? base : 0
  return base + netHits
}
