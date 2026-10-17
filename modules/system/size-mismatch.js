// Using gear not made for one's size (SR5 p. 423): « Si au contraire ils utilisent un objet qui n'est pas ajusté à la
// taille de leurs mains mais à celles d'un humain, les nains et les trolls subissent un modificateur de -2 dés. Ce
// modificateur s'applique aussi en sens inverse ». The lifestyle pays for the fitted gear, so nothing is unfitted by
// default: the box on the weapon or the gear says it is not made for its holder.
// Doigts délicats (The Complete Trog p. 179), trolls only: « Vous ne subissez pas le malus de –2 pour l'utilisation
// d'un équipement non adapté à votre taille de troll ».

/** The value the quality carries in its system effects (category "specialCase"). */
export const DELICATE_FINGERS_EFFECT = "delicateFingers"

/** The dice the box costs. */
export const SIZE_MISMATCH_PENALTY = -2

/** Whether one of the items is an active quality with Doigts délicats. */
export function hasDelicateFingers(items){
  for (const item of items ?? []){
    if (item?.system?.isActive === false) continue
    const effects = item?.system?.systemEffects
    const list = Array.isArray(effects) ? effects : Object.values(effects ?? {
    })
    if (list.some(e => e?.value === DELICATE_FINGERS_EFFECT)) return true
  }
  return false
}

/** The holder's metatype: 'metatype', or the legacy 'characterMetatype' of an actor not migrated yet. */
export function holderMetatype(actor){
  const biography = actor?.system?.biography
  return biography?.metatype || biography?.characterMetatype || ""
}

/**
 * The dice modifier of an item for its holder: 0 when the box is unticked, or when a troll (variants included, their
 * metatype stays "troll") has Doigts délicats; -2 otherwise.
 * @param {object} itemSystem the weapon's or the gear's system
 * @param {string} metatype the holder's metatype
 * @param {Iterable} items the holder's items
 */
export function sizeMismatchModifier(itemSystem, metatype, items){
  if (itemSystem?.notSizeAdapted !== true) return 0
  if (metatype === "troll" && hasDelicateFingers(items)) return 0
  return SIZE_MISMATCH_PENALTY
}
