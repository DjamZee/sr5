// A limit the roll keeps: 0 means none (rollDice keeps every hit, the card shows no limit).
// Radical reagents lift the limit (Forbidden Arcana p. 181): limit.unlimited
export function rollLimitValue(limit){
  if (limit?.unlimited) return 0
  const value = Number(limit?.value) || 0
  return value > 0 ? value : 0
}

// The active defenses whose hits an effect leaves unlimited (system.defenses.<key>.unlimited): the defense dialog
// lifts the Physical limit when one of them is picked
export const UNLIMITED_ACTIVE_DEFENSES = ["dodge", "block", "parryBlades", "parryClubs"]
export function defenseUnlimitedHits(defenses){
  return Object.fromEntries(UNLIMITED_ACTIVE_DEFENSES.map(key => [key, defenses?.[key]?.unlimited === true]))
}

// SR5 p. 58: Second Chance has no effect on limits. The new hits fill what the limit leaves;
// without a limit they all count. Returns null when nothing caps them
export function secondChanceLimit(limit, rollHits){
  const value = rollLimitValue(limit)
  if (!value) return null
  return Math.max(0, value - (Number(rollHits) || 0))
}
