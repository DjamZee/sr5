// Drug phases: a drug taken is under its effect (the rise), then in its crash, "the negative effects that
// follow the effect of the drug" (Chrome Flesh p. 194).
// system.phase holds the state; isActive and wirelessTurnedOn, read everywhere for any item, are derived
// from it. Each custom effect of a drug says in which phase it applies: before, the "wireless" box of an
// effect stood for the crash, which authors took for what it says (Aisa, St. John's Wort)

export const DRUG_PHASES = ["", "rise", "crash"]

// A duration or a speed of 1 takes the singular: "1 Minute", not "1 Minutes"
const SINGULAR_UNITS = {
  "SR5.Minutes": "SR5.Minute", "SR5.Hours": "SR5.Hour", "SR5.Days": "SR5.Day", "SR5.Weeks": "SR5.Week",
  "SR5.Months": "SR5.Month", "SR5.CombatTurns": "SR5.CombatTurn"
}
export function unitKey(key, value) {
  return (Number(value) === 1 && SINGULAR_UNITS[key]) || key
}

export function drugPhaseFlags(phase) {
  return {
    isActive: phase === "rise", wirelessTurnedOn: phase === "crash"
  }
}

export function phaseFromFlags(isActive, wirelessTurnedOn) {
  if (isActive) return "rise"
  if (wirelessTurnedOn) return "crash"
  return ""
}

// A click on the sheet moves one step: not taken, rise, crash, not taken
export function nextDrugPhase(phase) {
  return DRUG_PHASES[(DRUG_PHASES.indexOf(phase ?? "") + 1) % DRUG_PHASES.length]
}

// The phase of an effect not yet migrated follows the former convention. The "crash" box of the effect
// editor sends a boolean
export function effectPhase(customEffect) {
  if (customEffect.phase === "rise" || customEffect.phase === "crash") return customEffect.phase
  if (typeof customEffect.phase === "boolean") return customEffect.phase ? "crash" : "rise"
  return customEffect.wifi ? "crash" : "rise"
}

export function drugEffectApplies(customEffect, phase) {
  return !!phase && effectPhase(customEffect) === phase
}

// Can run any number of times. A rise or a crash already set wins over the flags; an empty phase does not:
// a flag turned on (an old source, a macro) says the drug is taken. A partial update that only turns flags
// off ({isActive: false} on a drug in its crash) carries no state and leaves it alone
export function migrateDrugSource(source) {
  const flagPhase = phaseFromFlags(source.isActive, source.wirelessTurnedOn)
  if (source.phase === "rise" || source.phase === "crash") Object.assign(source, drugPhaseFlags(source.phase))
  else if (flagPhase) Object.assign(source, {
    phase: flagPhase
  }, drugPhaseFlags(flagPhase))
  else if ("phase" in source) Object.assign(source, {
    phase: ""
  }, drugPhaseFlags(""))
  if (source.customEffects && typeof source.customEffects === "object") {
    for (let customEffect of Object.values(source.customEffects)) {
      if (!customEffect || typeof customEffect !== "object") continue
      customEffect.phase = effectPhase(customEffect)
      customEffect.wifi = false
    }
  }
  return source
}
