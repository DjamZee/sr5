// Blood magic (Street Grimoire p. 89-91, Forbidden Arcana p. 122-130). Pure rules, no Foundry.

function normalized(name){
  return String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

function namesOf(item){
  return [item?.name, item?.flags?.sr5?.nameVO].map(normalized).filter(Boolean)
}

// The metamagics, recognised by their name in French or in English: an item copied into a world before this lot carries
// no effect that would set the actor's key
const METAMAGIC_NAMES = {
  sacrifice: ["sacrifice"],
  cannibalize: ["cannibalisme", "cannibalize"],
}

export function bloodMetamagicKey(item){
  const names = namesOf(item)
  for (const [key, list] of Object.entries(METAMAGIC_NAMES)) if (names.some(n => list.includes(n))) return key
  return ""
}

// Forbidden Arcana p. 122-125: the spells with the Blood keyword, by their English name (flags.sr5.nameVO) or French one
const BLOOD_SPELLS = [
  ["sang bouillonnant", "boil blood"], ["explosion de cadavre", "corpse explosion"], ["embolie", "embolism"],
  ["crachat cramoisi", "giger spit"], ["veines de glace", "veine de glace", "ice veins"], ["feu pyro hematique", "pyrohemetics"],
  ["rupture"], ["coagulation", "clot"], ["partage des dommages", "share damage"], ["soins somatiques", "somatic healing"],
  ["represailles sympathiques", "sympathetic reprisal"], ["esclave du sang", "marionnette de sang", "blood puppet"],
  ["pointes cadaveriques", "corpse spikes"], ["tentacules cadaveriques", "corpse lash"], ["fouet de sang", "blood whip"],
  ["lame de sang", "blood blade"], ["toile de visceres", "viscera web"],
]
// p. 122-125: these three have the caster take 1P, which generates the Blood Magic Point they need
const SELF_COST_SPELLS = ["crachat cramoisi", "giger spit", "feu pyro hematique", "pyrohemetics", "fouet de sang", "blood whip"]

export function isBloodSpell(item){
  const names = namesOf(item)
  return BLOOD_SPELLS.some(list => list.some(n => names.includes(n)))
}

export function isSelfCostBloodSpell(item){
  return namesOf(item).some(n => SELF_COST_SPELLS.includes(n))
}

// Street Grimoire p. 90 (the French edition lacks the second rate, read in the English one): on a living creature
// without the Sapience power or a willing victim, 1 point per 3 boxes of Physical damage; on a sapient critter or an
// unwilling metahuman, 1 point per box
export const VICTIM_KINDS = ["unwilling", "willing"]

export function bloodPointsFor(boxes, kind){
  const n = Math.max(0, Math.floor(Number(boxes) || 0))
  return kind === "unwilling" ? n : Math.floor(n / 3)
}

// Forbidden Arcana p. 130: the magician wounds himself (martyr blood magic), as a willing victim: 1 point per 3 boxes.
// The three spells that cost 1P get their point from that first box (p. 122-125)
export function martyrPoints(boxes, selfCost = false){
  const n = Math.max(0, Math.floor(Number(boxes) || 0))
  if (selfCost && n > 0) return 1 + Math.floor((n - 1) / 3)
  return Math.floor(n / 3)
}

// The points of a sacrifice are lost after the following Combat Turn (Street Grimoire p. 90). A batch remembers the
// combat and the round it was gained in: it lasts that round and the next one. A batch gained outside a combat, or in a
// combat that has ended, lasts until the world clock has gone two Combat Turns (6 seconds, SR5 p. 160) past it
export const COMBAT_TURN_SECONDS = 3

export function batchExpired(batch, combat, worldTime){
  if (!batch || !(Number(batch.points) > 0)) return true
  if (batch.combatId && combat?.id === batch.combatId) return (Number(combat.round) || 0) > (Number(batch.round) || 0) + 1
  if (batch.combatId && combat?.id !== batch.combatId) return true
  return (Number(worldTime) || 0) - (Number(batch.time) || 0) > 2 * COMBAT_TURN_SECONDS
}

export function livingBatches(batches, combat, worldTime){
  return (Array.isArray(batches) ? batches : []).filter(b => !batchExpired(b, combat, worldTime))
}

export function availablePoints(batches, combat, worldTime){
  return livingBatches(batches, combat, worldTime).reduce((sum, b) => sum + (Number(b.points) || 0), 0)
}

// Spends the oldest points first; returns the batches left, the expired ones dropped
export function spendPoints(batches, spent, combat, worldTime){
  let left = Math.max(0, Math.floor(Number(spent) || 0))
  const kept = []
  for (const b of livingBatches(batches, combat, worldTime)) {
    const take = Math.min(left, Number(b.points) || 0)
    left -= take
    if ((Number(b.points) || 0) - take > 0) kept.push({
      ...b, points: (Number(b.points) || 0) - take
    })
  }
  return kept
}

// The three uses at casting (Street Grimoire p. 90): Force without Drain, Magic counted for the Drain type, Drain lowered.
// Martyr points are spent first (Forbidden Arcana p. 130: no addiction test for them), then the athame's (A2), then the
// sacrifice's. Each use is a whole number from 0; what is asked beyond the points at hand is taken off the last uses
export function bloodSpending({
  force = 0, drainMagic = 0, drain = 0, martyr = 0, athame = 0, pool = 0
}){
  const uses = {
    force: Math.max(0, Math.floor(Number(force) || 0)),
    drainMagic: Math.max(0, Math.floor(Number(drainMagic) || 0)),
    drain: Math.max(0, Math.floor(Number(drain) || 0)),
  }
  const at = {
    martyr: Math.max(0, Number(martyr) || 0), athame: Math.max(0, Number(athame) || 0), pool: Math.max(0, Number(pool) || 0)
  }
  let budget = at.martyr + at.athame + at.pool
  for (const key of ["force", "drainMagic", "drain"]) {
    uses[key] = Math.min(uses[key], budget)
    budget -= uses[key]
  }
  let total = uses.force + uses.drainMagic + uses.drain
  const fromMartyr = Math.min(total, at.martyr)
  total -= fromMartyr
  const fromAthame = Math.min(total, at.athame)
  total -= fromAthame
  return {
    ...uses, fromMartyr, fromAthame, fromPool: total
  }
}

// A Blood spell needs at least one point spent on it (Forbidden Arcana p. 122)
export function bloodSpellUnpaid(blood){
  if (!blood?.bloodSpell) return false
  return !((Number(blood.force) || 0) + (Number(blood.drainMagic) || 0) + (Number(blood.drain) || 0) > 0)
}

// The Drain once the points lower it (Street Grimoire p. 90): "to a minimum of 0", below the usual floor
export function bloodDrain(drainBeforeBlood, bloodPoints){
  return Math.max(0, (Number(drainBeforeBlood) || 0) - Math.max(0, Number(bloodPoints) || 0))
}

// Forbidden Arcana p. 130: a psychological addiction, rating = Magic, threshold 2, +1 if more points than the Magic are
// spent on a single effect. Martyr points never call for the test
export function bloodAddictionThreshold(uses, magic){
  const most = Math.max(0, ...["force", "drainMagic", "drain"].map(k => Number(uses?.[k]) || 0))
  return most > (Number(magic) || 0) ? 3 : 2
}
