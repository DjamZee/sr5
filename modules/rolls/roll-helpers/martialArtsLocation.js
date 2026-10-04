//Run & Gun p. 127-128: the locations of a specific target called shot
export const MARTIAL_ARTS_LOCATIONS = ["ankle", "ear", "eye", "foot", "forearm", "genitals", "gut", "hand", "hip", "jaw", "knee", "neck", "shin", "shoulder", "sternum", "thigh"]

//"knee" -> "locationKnee", the key of the technique modifier in itemsProperties.martialArts
export function martialArtsLocationKey(location){
  return `location${location.charAt(0).toUpperCase()}${location.slice(1)}`
}

//Run & Gun p. 148-151: a technique lowers by its modifier the penalty of the locations it covers
//(Dim Mak: arm or leg, Choquer: eyes, ears, sternum, Randori: eyes), only for a specific target called shot
export function martialArtsLocationBonus(martialArtsModifiers, calledShot, location){
  if (calledShot !== "specificTarget" || !location) return 0
  return martialArtsModifiers?.[martialArtsLocationKey(location)] ?? 0
}
