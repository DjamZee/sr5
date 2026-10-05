import {
  SR5_SpiritTypes
} from "../entities/items/spirit-types.js"

// Forbidden Arcana p. 50 (Necro Summoning): "each spirit that is under the control of the necro mage
// reduces the effective Magic Rating of the mage by 1". Every necro spirit on the mage's sheet counts,
// bound or not (GM ruling of 05/10). The necro spirits are custom spirit types of the "Types d'esprit"
// compendium; the menu writes their key as SR5_SpiritTypes.keyOf registers it (a slug), so the keys
// below are compared once normalised the same way.
export const NECRO_SPIRIT_TYPES = ["necroCarcass", "necroCorpse", "necroRot", "necroPalefire", "necroDetritus"]

const normalised = (key) => SR5_SpiritTypes.keyOf({
  system: {
    key
  }
})

export function isNecroSpirit(type){
  if (!type) return false
  const key = normalised(type)
  return NECRO_SPIRIT_TYPES.some(k => normalised(k) === key)
}
