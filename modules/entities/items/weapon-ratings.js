/**
 * A weapon whose DV or AP follows its bearer's ratings: the engulf of a spirit or an entity, VD (Magie x 2) and
 * PA -(Magie) (SR5 p. 399), and the natural weapons of the extraplanar entities, "VD (FOR + 2)P, PA -FOR" or
 * "PA -Puissance" (Howling Shadows p. 128 and following, the Erinye p. 138). A spirit's Magic is its Force.
 *
 * Read on the bearer at every preparation, never written into the weapon: a Force chosen again, or a Strength
 * raised by a power, changes the weapon at once.
 *
 * @param {object} itemData The weapon's system data
 * @param {object} actorData The bearer's system data
 * @param {boolean} astral True when the weapon is wielded in the astral, where Charisma stands for Strength
 * @returns {{target: string, label: string, value: number}[]} Modifiers for damageValue and armorPenetration
 */
export function weaponRatingModifiers(itemData, actorData, astral = false) {
  const modifiers = []
  const magic = Number(actorData?.specialAttributes?.magic?.augmented?.value) || 0
  const strength = Number(actorData?.attributes?.[astral ? "charisma" : "strength"]?.augmented?.value) || 0
  const strengthLabel = astral ? "SR5.Charisma" : "SR5.Strength"

  const multiplier = Number(itemData?.damageValue?.magicMultiplier) || 0
  if (multiplier > 0 && magic) modifiers.push({
    target: "damageValue", label: "SR5.Magic", value: magic * multiplier
  })

  switch (itemData?.armorPenetration?.linkedAttribute) {
    case "strength":
      if (strength) modifiers.push({
        target: "armorPenetration", label: strengthLabel, value: -strength
      })
      break
    case "magic":
      if (magic) modifiers.push({
        target: "armorPenetration", label: "SR5.Magic", value: -magic
      })
      break
  }
  return modifiers
}
