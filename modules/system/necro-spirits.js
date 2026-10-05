// Forbidden Arcana p. 49-50 (Necro Summoning): each necro spirit under a mage's control lowers the mage's
// effective Magic by 1, for as long as the spirit is there (GM ruling of 05/10). The necro spirits are
// custom spirit types of the "Types d'esprit" compendium, known by their keys.
export const NECRO_SPIRIT_TYPES = ["necroCarcass", "necroCorpse", "necroRot", "necroPalefire", "necroDetritus"]

export function isNecroSpirit(type){
  return NECRO_SPIRIT_TYPES.includes(type)
}
