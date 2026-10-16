// Adept powers of Better Than Bad p. 143: pure rules, no Foundry dependency.

// Mystic Aptitude: "Magic + (level in this power)" stands in for a single Physical Attribute chosen on activation, in
// dice pools, limits, Strength-based DVs and Initiative. The level is carried per attribute by the power's custom
// effect (system.specialProperties.mysticAptitude<Attribute>); the attribute with the highest level is the one chosen.
export const MYSTIC_APTITUDE_ATTRIBUTES = ["body", "agility", "reaction", "strength"]

export const mysticAptitudeKey = attribute => `mysticAptitude${attribute.charAt(0).toUpperCase()}${attribute.slice(1)}`

export function mysticAptitudeChoice(levels){
  let choice = null
  for (const attribute of MYSTIC_APTITUDE_ATTRIBUTES) {
    const level = Math.max(0, Math.floor(Number(levels?.[attribute]) || 0))
    if (level > 0 && (!choice || level > choice.level)) choice = {
      attribute, level
    }
  }
  return choice
}

// "Power foci do not raise your Magic for this power": the Magic without the bonus of a power focus (type itemFocus)
export function magicWithoutPowerFocus(magic){
  const focus = (magic?.modifiers || []).filter(m => m?.type === "itemFocus" && !m.isMultiplier)
    .reduce((sum, m) => sum + (Number(m.value) || 0), 0)
  return Math.max(0, (Number(magic?.value) || 0) - focus)
}

export function mysticAptitudeValue(magic, level){
  return magicWithoutPowerFocus(magic) + Math.max(0, Number(level) || 0)
}

// Purity State: bare-handed attacks deal (Magic + Strength), Physical or Stun as the adept chooses, AP -(Magic x 0.5),
// rounded up (SR5 p. 50)
export function purityStateArmorPenetration(magic){
  return -Math.ceil(Math.max(0, Number(magic) || 0) / 2)
}
