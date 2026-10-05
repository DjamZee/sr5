// Drug phases: a drug taken is under its effect (the rise), then in its crash, "the negative effects that
// follow the effect of the drug" (Chrome Flesh p. 194).
// system.phase holds the state; isActive and wirelessTurnedOn, read everywhere for any item, are derived
// from it. Each custom effect of a drug says in which phase it applies: before, the "wireless" box of an
// effect stood for the crash, which authors took for what it says (Aisa, St. John's Wort)

export const DRUG_PHASES = ["", "rise", "crash"]

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

// Can run any number of times: a phase already set is kept, and wins over the former flags. A partial
// update that holds none of the three fields leaves the state alone
export function migrateDrugSource(source) {
  if (["phase", "isActive", "wirelessTurnedOn"].some(key => key in source)) {
    if (!DRUG_PHASES.includes(source.phase)) source.phase = phaseFromFlags(source.isActive, source.wirelessTurnedOn)
    Object.assign(source, drugPhaseFlags(source.phase))
  }
  if (source.customEffects && typeof source.customEffects === "object") {
    for (let customEffect of Object.values(source.customEffects)) {
      if (!customEffect || typeof customEffect !== "object") continue
      customEffect.phase = effectPhase(customEffect)
      customEffect.wifi = false
    }
  }
  return source
}
