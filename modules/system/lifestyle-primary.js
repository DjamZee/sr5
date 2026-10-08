// The main lifestyle of a character (Adrore's feedback C4, DjamZ, 08/10): a character may hold several lifestyles,
// one of them is the main one, the one the starting nuyen are rolled for (SR5 p. 97: "déterminé par le style de vie
// acheté"; the archetypes of p. 110 sq. print it as "Style de vie principal"). Plain rules with no Foundry in them.

/**
 * The main lifestyle among a character's items: the one marked, or the only one when none is; null when there are
 * several and none is marked (the gamemaster or the player picks it on the sheet).
 * @param {Array} items  the actor's items
 * @return {Object|null}
 */
export function primaryLifestyle(items){
  const lifestyles = Array.from(items ?? []).filter(i => i?.type === "itemLifestyle")
  return lifestyles.find(i => i.system?.isPrimary === true) ?? (lifestyles.length === 1 ? lifestyles[0] : null)
}

/**
 * The updates that make one lifestyle the main one: it is marked, every other mark is taken off. A click on the main
 * lifestyle takes its mark off.
 * @param {Array} items  the actor's items
 * @param {String} id    the lifestyle clicked
 * @return {Array} [{_id, "system.isPrimary"}]
 */
export function primaryLifestyleUpdates(items, id){
  const lifestyles = Array.from(items ?? []).filter(i => i?.type === "itemLifestyle")
  const clicked = lifestyles.find(i => (i.id ?? i._id) === id)
  if (!clicked) return []
  const marking = clicked.system?.isPrimary !== true
  return lifestyles
    .filter(i => (marking && i === clicked) !== (i.system?.isPrimary === true))
    .map(i => ({
      _id: i.id ?? i._id, "system.isPrimary": marking && i === clicked
    }))
}
