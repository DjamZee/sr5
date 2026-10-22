/**
 * The key of the game effect a lifestyle option shows in its tooltip. The three increases (Run Faster p. 210: one level
 * more of Comforts, Security or Neighborhood) are named "SR5.LifeStyleAdd…", the other options "SR5.LifeStyleOption…":
 * built the same way, the increases showed their raw key.
 */
export function lifestyleOptionEffectKey(name) {
  const nameString = name.charAt(0).toUpperCase() + name.slice(1)
  return name.startsWith("add") ? `SR5.LifeStyle${nameString}_GE` : `SR5.LifeStyleOption${nameString}_GE`
}
