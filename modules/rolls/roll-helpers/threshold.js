//Threshold modifier carried by the character: Bliss (SR5 p. 412) and Purple Orchid (Chrome Flesh p. 190) give
//"+1 to all thresholds". It raises the threshold of every test that has one, and leaves a test without threshold alone.

//The modifier and its sources, read from the actor (specialProperties.thresholdModifier)
export function thresholdModifierOf(actorData){
  const property = actorData?.specialProperties?.thresholdModifier
  const modifiers = (property?.modifiers || []).filter(m => Number(m.value))
  const value = modifiers.reduce((sum, m) => sum + Number(m.value), 0)
  return {
    value, sources: modifiers.map(m => ({
      source: m.source, value: Number(m.value)
    }))
  }
}

//The threshold of the test once the modifier is added: a test without threshold (0) keeps none, and a raised
//or lowered threshold never falls under 1, a test with a threshold keeping one
export function applyThresholdModifier(threshold, modifier){
  if (!threshold || !(threshold.value > 0) || !modifier?.value) return threshold
  return {
    ...threshold,
    base: threshold.value,
    modifier: modifier.value,
    modifierSources: modifier.sources,
    value: Math.max(1, threshold.value + modifier.value),
  }
}
