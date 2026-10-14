// Increase Noise and Decrease Noise (Street Grimoire p. 113-114). Pure rules, no Foundry.

function normalized(name){
  return String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

// Recognised by the spell's name, in French or in English (flags.sr5.nameVO of the compendiums)
export function noiseSpellKind(item){
  const names = [item?.name, item?.flags?.sr5?.nameVO].map(normalized)
  if (names.some(n => /^(augmentation du bruit|increase noise)$/.test(n))) return "increase"
  if (names.some(n => /^(diminution du bruit|decrease noise)$/.test(n))) return "decrease"
  return ""
}

// p. 113: "the threshold of the Spellcasting test depends on the grid affected: public grid 2, local grid 4,
// global grid 6"
export const NOISE_GRID_THRESHOLDS = {
  public: 2, local: 4, global: 6
}

export function noiseGridThreshold(grid){
  return NOISE_GRID_THRESHOLDS[grid] ?? NOISE_GRID_THRESHOLDS.public
}

// p. 114: "each net hit raises or lowers the Noise by 1 in the area of effect". The Noise is kept as a positive
// rating (a malus once a matrix test reads it): Decrease Noise gives a negative one
export function noiseSpellValue(kind, hits, threshold){
  const net = Math.max(0, (Number(hits) || 0) - (Number(threshold) || 0))
  if (kind === "increase") return net
  if (kind === "decrease") return -net
  return 0
}

// p. 114: the Overwatch Score of every hacker affected rises by 1D6 per minute for each net hit beyond 4
export function noiseOverwatchDice(netHits){
  return Math.max(0, (Number(netHits) || 0) - 4)
}

// A lowered Noise only takes Noise away (SR5 p. 232, like the Noise Reduction): the actor's own noise, when it is a
// bonus (Decrease Noise), never gives more dice than the range and the scene take. Malus are negative numbers
export function actorNoiseModifier(personalNoise, rangeMod, sceneNoise){
  const personal = Number(personalNoise) || 0
  if (personal <= 0) return personal
  return Math.min(personal, Math.max(0, -((Number(rangeMod) || 0) + (Number(sceneNoise) || 0))))
}
