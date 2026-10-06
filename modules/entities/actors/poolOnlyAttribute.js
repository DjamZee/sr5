//Attribute Boost (SR5 p. 312) "only affects dice pools: the Physical limit and the Initiative attribute
//do not change". Its modifier on the augmented attribute is marked poolOnly (applyCustomEffects);
//the derived values the boost must not move (Physical limit, Physical condition monitor) read this.
//The rating without the marked modifiers, never above the real one (the augmentation cap may already
//have cut the boost).
export function limitAttributeValue(attribute) {
  const augmented = attribute?.augmented
  if (!augmented) return 0
  const modifiers = augmented.modifiers ?? []
  if (!modifiers.some(m => m.poolOnly)) return augmented.value
  const withoutBoost = (augmented.base ?? 0) + modifiers
    .filter(m => !m.poolOnly && !m.isMultiplier && m.type !== "augmentationCap")
    .reduce((sum, m) => sum + (Number(m.value) || 0), 0)
  return Math.min(augmented.value, withoutBoost)
}
