// Reagents, three rule sets picked by the GM (world setting "sr5ReagentSystem"):
// - core: one stock of drachms (SR5 p. 319-321)
// - shadowSpells: raw, refined, radical and orichalcum stocks (Shadow Spells p. 18, Street Grimoire p. 209-211)
// - forbiddenArcana: the same stocks, each tier bringing its own bonus (Forbidden Arcana p. 180-184)
// The raw stock stays system.magic.reagents: the counters already filled in the worlds keep their value.

export const REAGENT_SYSTEMS = ["core", "shadowSpells", "forbiddenArcana"]

export const REAGENT_TIERS = {
  raw: "reagents",
  refined: "reagentsRefined",
  radical: "reagentsRadical",
  orichalcum: "orichalcum",
}

// Tiers spent in a roll dialog: orichalcum is a counter only, its uses stay in the GM's hands
export const SPENDABLE_TIERS = ["raw", "refined", "radical"]

export function reagentSystem(){
  try {
    const value = game.settings.get("sr5", "sr5ReagentSystem")
    return REAGENT_SYSTEMS.includes(value) ? value : "core"
  } catch {
    return "core"
  }
}

export function hasTiers(system = reagentSystem()){
  return system !== "core"
}

export function tierPath(tier){
  return `system.magic.${REAGENT_TIERS[tier] ?? REAGENT_TIERS.raw}`
}

// A stock is a count of drachms: never negative, never text
export function tierStock(magic, tier){
  const value = Number(magic?.[REAGENT_TIERS[tier] ?? REAGENT_TIERS.raw])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

// Drachms a roll can spend: the raw stock alone in the core rules, every spendable tier otherwise
export function spendableStock(magic, system = reagentSystem()){
  if (!hasTiers(system)) return tierStock(magic, "raw")
  return SPENDABLE_TIERS.reduce((sum, tier) => sum + tierStock(magic, tier), 0)
}

export function normalizeTier(tier, system = reagentSystem()){
  if (!hasTiers(system)) return "raw"
  return SPENDABLE_TIERS.includes(tier) ? tier : "raw"
}

export const TIER_LABELS = {
  raw: "SR5.ReagentRaw",
  refined: "SR5.ReagentRefined",
  radical: "SR5.ReagentRadical",
  orichalcum: "SR5.Orichalcum",
}

// What the roll dialog offers: the spendable tiers and their stock
export function reagentChoices(magic, system = reagentSystem()){
  return {
    hasTiers: hasTiers(system),
    tiers: (hasTiers(system) ? SPENDABLE_TIERS : ["raw"]).map(key => ({
      key, label: TIER_LABELS[key], stock: tierStock(magic, key)
    })),
  }
}

// What the test kind is, for the Drain each tier takes off
export function reagentTestKind(test){
  if (test?.type === "spell" || test?.type === "ritual") return test.type
  return test?.typeSub ?? ""
}

// The limit a roll gets from its reagents. Core rule (SR5 p. 320): the drachms spent replace the limit,
// except in a ritual and a binding, where they do something else. Forbidden Arcana adds its tier bonus on top
// (arbitrage de DjamZ, 2026-10-05), a ritual and a binding included: the bonus applies to every test using Magic
export function reagentLimit({
  system = reagentSystem(), test, tier, effective, spent, baseLimit, magic
}){
  const replaces = test?.type !== "ritual" && test?.typeSub !== "binding"
  const base = replaces ? effective : baseLimit
  if (removesLimit({
    system, tier, spent
  })) return {
    base, bonus: 0, unlimited: true
  }
  return {
    base, bonus: limitBonus({
      system, tier, spent, magic
    }), unlimited: false
  }
}

// A reagent of another tradition works at half its Power (SR5 p. 320)
export function effectiveDrachms(spent, foreign = false){
  const value = Math.max(0, Math.floor(Number(spent) || 0))
  return foreign ? Math.floor(value / 2) : value
}

// Spending never brings a stock under 0
export function stockAfterSpending(stock, spent){
  return Math.max(0, (Number(stock) || 0) - Math.max(0, Number(spent) || 0))
}

// Harvesting: Alchemy + Magic [Mental] after an hour of astral perception (SR5 p. 320).
// One drachm per 2 hits in an area suited to the tradition, per 4 elsewhere; an area already
// harvested gives one per 4 hits, per 6 outside the tradition (Forbidden Arcana p. 181)
export const HARVEST_ZONES = {
  tradition: 2,
  other: 4,
  overharvested: 4,
  overharvestedOther: 6,
}

export function harvestZones(system = reagentSystem()){
  const zones = ["tradition", "other"]
  if (system === "forbiddenArcana") zones.push("overharvested", "overharvestedOther")
  return zones
}

export function harvestYield(hits, zone){
  const step = HARVEST_ZONES[zone] ?? HARVEST_ZONES.tradition
  return Math.floor(Math.max(0, Number(hits) || 0) / step)
}

// Refining: 10 drachms of a tier make 1 drachm of the next one, Alchemy + Magic [Astral] (3).
// A failure eats one drachm per missing hit, a critical glitch all ten (Street Grimoire p. 211)
export const REFINE_FROM = {
  raw: "refined",
  refined: "radical",
}
export const REFINE_COST = 10
export const REFINE_THRESHOLD = 3

export function refineOutcome(hits, criticalGlitch = false){
  hits = Math.max(0, Number(hits) || 0)
  if (criticalGlitch) return {
    success: false, consumed: REFINE_COST, gained: 0
  }
  if (hits >= REFINE_THRESHOLD) return {
    success: true, consumed: REFINE_COST, gained: 1
  }
  return {
    success: false, consumed: REFINE_THRESHOLD - hits, gained: 0
  }
}

// The stock changes a harvest or a refining card brings, by tier: {raw: +3} or {raw: -10, refined: +1}
export function reagentWorkChanges({
  type, hits, criticalGlitch, zone, from
}){
  if (type === "reagentHarvest") {
    const gained = harvestYield(hits, zone)
    return gained ? {
      raw: gained
    } : {
    }
  }
  if (type === "reagentRefine" && REFINE_FROM[from]) {
    const outcome = refineOutcome(hits, criticalGlitch)
    const changes = {
      [from]: -outcome.consumed
    }
    if (outcome.gained) changes[REFINE_FROM[from]] = outcome.gained
    return changes
  }
  return {
  }
}

// The actor update for those changes: a stock never goes under 0
export function reagentWorkUpdate(magic, changes){
  const update = {
  }
  for (const [tier, delta] of Object.entries(changes)) {
    update[tierPath(tier)] = Math.max(0, tierStock(magic, tier) + delta)
  }
  return update
}

// Forbidden Arcana p. 181: the Drain each tier takes off, by the test it is spent on.
// Sorcery: spellcasting, ritual spellcasting, counterspelling. Conjuring: summoning, binding, banishing.
// The radical tier does not stack with the refined one: a roll spends a single tier.
export const SORCERY_TESTS = ["spell", "ritual", "counterspelling"]
export const CONJURING_TESTS = ["summoning", "binding", "banishing"]

export function tierDrainReduction(tier, testKind){
  const sorcery = SORCERY_TESTS.includes(testKind)
  const conjuring = CONJURING_TESTS.includes(testKind)
  switch (tier){
    case "raw":
      return testKind === "ritual" ? 1 : 0
    case "refined":
      if (sorcery) return 2
      if (testKind === "binding") return 1
      return 0
    case "radical":
      if (sorcery) return 4
      if (conjuring) return 2
      return 0
    default:
      return 0
  }
}

// Forbidden Arcana p. 181: +1 limit for raw reagents, +5 for refined ones, no limit at all for radical ones.
// Arbitrage de DjamZ (2026-10-05): the bonus counts once per test, not per drachm, and it comes on top
// of the core rule (limit = drachms spent): 6 raw drachms give a limit of 7
export const TIER_LIMIT_BONUS = {
  raw: 1,
  refined: 5,
}

export function limitBonus({
  system = reagentSystem(), tier, spent, magic
}){
  if (system !== "forbiddenArcana" || !(Number(spent) > 0)) return 0
  const cap = Math.max(0, Number(magic) || 0)
  return Math.min(TIER_LIMIT_BONUS[tier] ?? 0, cap)
}

export function removesLimit({
  system = reagentSystem(), tier, spent
}){
  return system === "forbiddenArcana" && tier === "radical" && Number(spent) > 0
}

// The bonuses together never exceed the user's Magic (Forbidden Arcana p. 181): the Drain reduction
// gets what the limit bonus left
export function drainReduction({
  system = reagentSystem(), tier, testKind, spent, magic, limitBonusUsed = 0
}){
  if (system !== "forbiddenArcana" || !(Number(spent) > 0)) return 0
  const reduction = tierDrainReduction(tier, testKind)
  const cap = Math.max(0, (Number(magic) || 0) - Math.max(0, Number(limitBonusUsed) || 0))
  return Math.min(reduction, cap)
}

// Takes the tier's reduction off a Drain on a card, and shows it among the Drain modifiers.
// The Drain floor (2) is applied after, by the card
export function applyReagentDrainReduction(magic, reduction, tier){
  reduction = Number(reduction) || 0
  if (!magic?.drain || reduction <= 0) return
  magic.drain.value -= reduction
  magic.drain.modifiers ??= {
  }
  magic.drain.modifiers.reagentTier = {
    value: -reduction,
    label: game.i18n.localize(TIER_LABELS[tier] ?? "SR5.Reagents"),
  }
}

// Spirit binding costs (Force x 25) drachms (SR5 p. 304)
export function bindingCost(force){
  return Math.max(0, Number(force) || 0) * 25
}
