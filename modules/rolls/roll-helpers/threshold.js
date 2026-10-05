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

//Whether the threshold a test carries is its own. Not for the damage resistance card, whose threshold only travels to
//the "catch fire" test that follows (raised there, once), nor for the resistance to a social skill, an opposed test
//carrying the opponent's hits (SR5 p. 141-143)
export function hasOwnThreshold(test){
  return !test?.isOpposedResistance && test?.type !== "resistanceCard"
}

//A bare threshold raised for this character: the extended tests rolled outside the roll dialog (search for a buyer,
//lock picking, anti-tamper) read it there
export function raisedThreshold(value, actorData){
  return applyThresholdModifier({
    value
  }, thresholdModifierOf(actorData)).value
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
