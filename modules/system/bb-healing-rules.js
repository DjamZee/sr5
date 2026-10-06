// Optional healing rules of Bullets & Bandages (VF "Balles et Pansements"), "Soins sous le feu ennemi" p. 14-16 and
// "Règles avancées de médikits et autodocs" p. 16-19. Each block is a world setting, off by default: the core
// rulebook (SR5 p. 206-209) then applies unchanged. Pure functions here, the clock and the cards in bb-healing.js

export const BB_UNDER_FIRE = "sr5BBUnderFireRules"
export const BB_ADVANCED_MEDKITS = "sr5BBAdvancedMedkits"
export const BB_LEDGER = "sr5BBHealingLedger"

// BB p. 14: an attack that deals 5 Physical boxes or more makes the wound worse. "Subit": the boxes taken, after the
// damage resistance test (arbitrage de DjamZ, 2026-10-05)
export const BB_WOUND_THRESHOLD = 5

// BB p. 15, diagnosis: +2 dice on success, +1 on a glitch, -2 on a critical glitch
export function diagnosisBonus(roll, threshold){
  if (roll?.criticalGlitchRoll) return -2
  if ((Number(roll?.hits) || 0) < Math.max(1, Number(threshold) || 0)) return 0
  return roll?.glitchRoll ? 1 : 2
}

// BB p. 15, diagnosis thresholds for wounds: 1-2 boxes 1, 3-5 boxes 2, 6-9 boxes 3, 10+ boxes 5. The GM sets the
// threshold (an illness has its own row): this is only the value offered to him
export const DIAGNOSIS_THRESHOLDS = [1, 2, 3, 5]
export function woundDiagnosisThreshold(boxes){
  const n = Number(boxes) || 0
  if (n >= 10) return 5
  if (n >= 6) return 3
  if (n >= 3) return 2
  return 1
}

// Physical boxes taken by one update, overflow included
export function physicalTotal(system){
  const m = system?.conditionMonitors ?? {
  }
  return (Number(m.physical?.actual?.value) || 0) + (Number(m.overflow?.actual?.value) || 0)
}

// BB p. 14: only a character with a Physical monitor bleeds (a grunt's single monitor is left to the GM)
export function canBleed(system){
  return !!system?.conditionMonitors?.physical && !!system?.conditionMonitors?.overflow
}

// A new wound of 5+ starts the bleeding: one bleeding per patient, a second wound does not add another
// (arbitrage de DjamZ, 2026-10-05). A stabilized patient wounded again bleeds again
export function ledgerAfterWound(ledger, uuid, body){
  const next = foundry.utils.deepClone(ledger ?? {
  })
  const entry = next[uuid] ?? {
  }
  if (entry.bleeding) return next
  const every = Math.max(1, Number(body) || 1)
  next[uuid] = {
    ...entry, bleeding: {
      every, left: every
    }, stabilized: null
  }
  return next
}

// A new Combat Turn for the actors of the combat: the counters go down, those at 0 are due one box and start again
export function ledgerAfterRound(ledger, uuids){
  const next = foundry.utils.deepClone(ledger ?? {
  })
  const due = []
  for (const uuid of uuids){
    const b = next[uuid]?.bleeding
    if (!b) continue
    b.left = (Number(b.left) || b.every) - 1
    if (b.left <= 0){
      due.push(uuid)
      b.left = b.every
    }
  }
  return {
    ledger: next, due
  }
}

// BB p. 14-15: the threshold of the stabilization test is the total of Physical boxes, overflow included.
// Damage that does not bleed, Stun included: one test, threshold the sum of both monitors. The VO
// ("total of both monitors") wins over the VF ("un test par moniteur"): the VO is the original text
// (arbitrage de DjamZ, 2026-10-05)
export function stabilizationThreshold(system, bleeding){
  const m = system?.conditionMonitors ?? {
  }
  const physical = physicalTotal(system)
  if (bleeding) return physical
  return physical + (Number(m.stun?.actual?.value) || 0)
}

// BB p. 15: each hit over the threshold lowers the wound modifiers by 1, for (First Aid of the medic) hours
export function stabilizationReduction(hits, threshold){
  return Math.max(0, (Number(hits) || 0) - (Number(threshold) || 0))
}

// A Stabilize or Heal spell and a first aid on a bleeding patient (BB p. 15-16) stabilize without lowering the
// wound modifiers: their labels then leave the "-0" out
export function stabilizationLabelKey(key, reduction){
  return (Number(reduction) || 0) > 0 ? key : `${key}NoReduction`
}

// BB p. 16: on a stabilized patient each net hit heals 2 boxes, the hits counted capped by the higher of First Aid
// and the medkit rating. The rest of the core rule stays (arbitrage de DjamZ, 2026-10-05): a full armor halves the
// hits first (SR5 p. 207)
export function stabilizedTreatmentBoxes(hits, threshold, skill, medkitRating, fullArmor){
  let net = Math.max(0, (Number(hits) || 0) - (Number(threshold) || 0))
  if (fullArmor) net = Math.ceil(net / 2)
  return 2 * Math.min(net, Math.max(Number(skill) || 0, Number(medkitRating) || 0))
}

// One box of bleeding applied: counted, for the Drain of the Stabilize spell
export function ledgerAfterBleedBox(ledger, uuid){
  const next = foundry.utils.deepClone(ledger ?? {
  })
  const b = next[uuid]?.bleeding
  if (b) b.boxes = (Number(b.boxes) || 0) + 1
  return next
}

// The Stabilize spell, known by its name in English or French: the item has no other mark
export function isStabilizeSpell(name){
  const n = String(name ?? "").trim().toLowerCase()
  return n === "stabilize" || n === "stabilisation" || n === "stabilization"
}

// The Heal spell, known by its name in English or French
export function isHealSpell(name){
  const n = String(name ?? "").trim().toLowerCase()
  return n === "heal" || n === "soins"
}

// BB p. 15-16, which spell cast on the patient stabilizes him. Stabilize: a Force at least the boxes of bleeding and
// overflow, on a patient who bleeds or is in the overflow. Heal: stabilizes of itself out of the overflow
export function spellStabilizes(spellName, force, entry, overflow){
  const over = Number(overflow) || 0
  if (isStabilizeSpell(spellName)){
    if (!entry?.bleeding && over <= 0) return false
    return (Number(force) || 0) >= (Number(entry?.bleeding?.boxes) || 0) + over
  }
  if (isHealSpell(spellName)) return !!entry?.bleeding && over <= 0
  return false
}

// The hits the GM believes on a card: never more than the dice rolled, the pool times the rolls of an extended test
export function believedHits(hits, dicePool, rolls = 1){
  const cap = Math.max(0, Number(dicePool) || 0) * Math.max(1, Number(rolls) || 1)
  return Math.max(0, Math.min(Number(hits) || 0, cap))
}

// BB p. 15: the reduction of the wound modifiers, from the believed hits and the patient's threshold now
export function believedStabilizationReduction(roll, dicePool, rolls, threshold){
  return stabilizationReduction(believedHits(roll?.hits, dicePool, rolls), threshold)
}

// BB p. 15, Stabilize spell: the VO gives a Drain of (boxes of bleeding + overflow) / 2 rounded up, which the VF
// leaves out; the VO is the original text and wins (arbitrage de DjamZ, 2026-10-05). The Drain floor of SR5 p. 284
// still applies
export function stabilizeSpellDrain(bleedBoxes, overflow, floor = 2){
  return Math.max(floor, Math.ceil(((Number(bleedBoxes) || 0) + (Number(overflow) || 0)) / 2))
}

// The wound modifier reduction still running at "now", 0 once over
export function penaltyReduction(entry, now){
  const s = entry?.stabilized
  if (!s || !(Number(s.reduction) > 0)) return 0
  if (Number.isFinite(s.until) && now >= s.until) return 0
  return Number(s.reduction)
}

// The ledger once the patient is stabilized: no more bleeding, the reduction kept if higher (the medic can carry on
// the test to lower the modifiers further, BB p. 15)
export function ledgerAfterStabilization(ledger, uuid, reduction, until){
  const next = foundry.utils.deepClone(ledger ?? {
  })
  const entry = next[uuid] ?? {
  }
  const old = entry.stabilized
  const keep = old && Number(old.reduction) > reduction && Number.isFinite(old.until) && old.until > until
  next[uuid] = {
    ...entry, bleeding: null, stabilized: keep ? old : {
      reduction, until
    }
  }
  return next
}

// BB p. 15: the diagnosis bonus goes to the next stabilization or treatment test of that patient
export function ledgerWithDiagnosis(ledger, uuid, bonus){
  const next = foundry.utils.deepClone(ledger ?? {
  })
  next[uuid] = {
    ...(next[uuid] ?? {
    }), diagnosis: bonus
  }
  return next
}

// The dice the diagnosis adds to a care chosen in the dialog: stabilization and treatment only
export function bbModeDiagnosisDice(mode, diagnosis){
  if (mode !== "treatment" && mode !== "stabilization") return 0
  return Number(diagnosis) || 0
}

export function ledgerWithoutDiagnosis(ledger, uuid){
  const next = foundry.utils.deepClone(ledger ?? {
  })
  if (next[uuid]) delete next[uuid].diagnosis
  return next
}

// Entries left with nothing are dropped, so the ledger does not grow with every patient. A stabilized patient stays
// stabilized (BB p. 16, the treatment heals him 2 boxes a hit) until a new wound of 5+: only his reduction runs out
export function ledgerCleaned(ledger, now){
  const next = {
  }
  for (const [uuid, entry] of Object.entries(ledger ?? {
  })){
    const stabilized = entry?.stabilized ? {
      ...entry.stabilized, reduction: penaltyReduction(entry, now)
    } : null
    if (entry?.bleeding || stabilized || entry?.diagnosis) next[uuid] = {
      ...entry, stabilized
    }
  }
  return next
}

// BB p. 18: the medkit rating is only bonus dice; without supplies left the -3 of "no supplies" comes back
// (BB p. 18-19), the rating still added. Supplies are the item's charge
export function advancedMedkitDice(rating, charge){
  return (Number(rating) || 0) + ((Number(charge) || 0) > 0 ? 0 : -3)
}

// Improvised supplies. Core rules: -1 (SR5 p. 208). Bullets & Bandages p. 18 (optional rule, with the advanced
// medkits): a Complex Action of First Aid + Intuition, each hit taking 1 off the -3 of "no supplies", down to 0.
// The hits come from the player's own improvising roll, capped at 3
export const IMPROVISED_BASE = -3
export function improvisedSuppliesDice(hits, advanced){
  if (!advanced) return -1
  const kept = Math.min(-IMPROVISED_BASE, Math.max(0, Math.floor(Number(hits) || 0)))
  return IMPROVISED_BASE + kept
}

/* -------------------------------------------- */
// Registered with the other settings (utilitySystem.js): nothing imported here, so no cycle with the runtime

export function registerBBHealingSettings(){
  game.settings.register("sr5", BB_UNDER_FIRE, {
    name: "SR5.SETTINGS_BBUnderFire_T",
    hint: "SR5.SETTINGS_BBUnderFire_D",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    requiresReload: true
  })
  game.settings.register("sr5", BB_ADVANCED_MEDKITS, {
    name: "SR5.SETTINGS_BBAdvancedMedkits_T",
    hint: "SR5.SETTINGS_BBAdvancedMedkits_D",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    requiresReload: true
  })
  game.settings.register("sr5", BB_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
    },
    //Every client prepares again the patients of the ledger: their wound modifiers follow the stabilization
    onChange: (value) => refreshPatients(value),
  })
}

export function refreshPatients(ledger){
  for (const uuid of Object.keys(ledger ?? {
  })){
    const actor = globalThis.fromUuidSync?.(uuid)
    if (!actor) continue
    actor.reset?.()
    if (actor.sheet?.rendered) actor.sheet.render()
  }
}
