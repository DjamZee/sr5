// Explosives, Run & Gun p. 183-208 over SR5 p. 438 (a supplement completes and corrects the core book). Pure rules,
// without Foundry: the window and the card live in system/explosive-charge.js.

// RG p. 202 (table of explosives), SR5 p. 438, RG errata p. 190 (dynamite 3, nitroglycerin 6, TNT 5). A rating range
// is the one the buyer chooses; a fixed rating is the compound's. A linear cutting charge is always tamped (RG p. 205),
// a litre of liquid explosive or of nitroglycerin counts as a kilo (RG p. 205-206)
export const EXPLOSIVE_TYPES = {
  commercial: {
    min: 5, max: 5
  },
  foam: {
    min: 6, max: 25
  },
  plastic: {
    min: 6, max: 25
  },
  anfo: {
    min: 6, max: 6
  },
  linearCharge: {
    min: 1, max: 25, tamped: true
  },
  dynamite: {
    min: 3, max: 3
  },
  liquid: {
    min: 1, max: 25
  },
  ammoniumNitrate: {
    min: 4, max: 4
  },
  nitroglycerin: {
    min: 6, max: 6
  },
  tnt: {
    min: 5, max: 5
  },
}

// RG p. 188-189: the charge loose, placed against what it must destroy (x2), or tamped (x4, replaces x2)
export const PLACEMENTS = {
  free: 1, placed: 2, tamped: 4
}

// RG p. 188, SR5 p. 438: blast of a circular explosion, and of a directional one (cone of 60 degrees at most)
export const BLAST_FALLOFF = {
  circular: -2, directional: -1
}
export const DIRECTIONAL_ANGLE = 60
// RG p. 188, SR5 p. 438: the armor penetration of the blast for what stands near the epicenter
export const NEAR_AP = -2
// RG p. 189: a gas leak or fuel set alight adds 20P
export const GAS_LEAK_DV = 20
// RG p. 189: the gamemaster's secret change to a homemade explosive, never more than 15 either way
export const HOMEMADE_MAX_OFFSET = 15

export function typeRange(type) {
  return EXPLOSIVE_TYPES[type] ?? null
}

/** The rating of a compound clamped into its range (RG p. 202): 0 when it is no explosive */
export function baseRating(type, rating) {
  const range = typeRange(type)
  if (!range) return 0
  const n = Math.round(Number(rating) || 0)
  return Math.min(range.max, Math.max(range.min, n))
}

/**
 * The effective rating (RG p. 189): the compound's, each hit of the Demolitions + Logic [Mental] test raising or
 * lowering it by 1 as the expert chooses (`hits` signed), and the gamemaster's secret change of a homemade lot.
 * 0 or less: it does not explode
 */
export function effectiveRating(rating, {
  hits = 0, offset = 0
} = {
}) {
  const change = Math.max(-HOMEMADE_MAX_OFFSET, Math.min(HOMEMADE_MAX_OFFSET, Math.round(Number(offset) || 0)))
  return Math.max(0, Math.round(Number(rating) || 0) + Math.round(Number(hits) || 0) + change)
}

/**
 * The Damage Value of a charge (RG p. 188): effective rating x square root of the kilos, rounded UP. Its table reads
 * so (rating 2, 2 kg: 3P); SR5 p. 438 rounded the root down, the supplement corrects it
 */
export function explosiveDV(rating, kilos) {
  const r = Number(rating) || 0, kg = Number(kilos) || 0
  if (r <= 0 || kg <= 0) return 0
  return Math.ceil(r * Math.sqrt(kg) - 1e-9)
}

/** RG p. 190: 1 point of background count from 35P, +1 for every 20 more, 3 at most for ordinary explosives */
export function explosionBackgroundCount(dv) {
  const v = Number(dv) || 0
  if (v < 35) return 0
  return Math.min(3, 1 + Math.floor((v - 35) / 20))
}

/** Whether a measured distance lies outside a blast of fixed radius (a radius of 0 is one the fall-off alone ends) */
export function outsideBlast(distance, radius) {
  const r = Number(radius) || 0
  return r > 0 && (Number(distance) || 0) > r
}

/**
 * RG p. 206-207: a detonator of rating 1 fails on 1-2 on a D6, of rating 2 on a 1; from rating 3 it does not fail.
 * A detonator without rating (pressure, tension, blasting cap, electric) is not concerned
 */
export function detonatorFails(rating, d6) {
  const r = Number(rating) || 0
  if (r === 1) return d6 <= 2
  if (r === 2) return d6 <= 1
  return false
}

// RG p. 191: the DV a charge must reach to make a 1 m hole in a material, or cut through it
export const MATERIAL_THRESHOLDS = {
  fragile: 2, cheap: 3, average: 6, heavy: 9, reinforced: 13, structural: 16, heavyStructural: 20, armored: 23, hardened: 28,
}
// RG p. 191: the DV that destroys an ordinary vehicle
export const VEHICLE_THRESHOLDS = {
  boat: 18, motorcycle: 9, car: 14, limousine: 22, truck: 26,
}

/**
 * Everything a charge does once set (RG p. 188-190, SR5 p. 438):
 * - dv: the blast at its epicenter for everyone, gas leak included; the placement multiplier is not in it
 * - targetDV: the DV against what it is placed on or tamped against (x2 or x4), its armor halved
 * - falloff, radius (meters, where the blast falls to 0), ap for what stands near
 * - backgroundCount and its radius (the base DV in meters, RG p. 190)
 */
export function chargeOutcome({
  type, rating, kilos, hits = 0, offset = 0, placement = "free", shape = "circular", gasLeak = false
} = {
}) {
  const range = typeRange(type)
  const effective = range ? effectiveRating(baseRating(type, rating), {
    hits, offset
  }) : 0
  const base = explosiveDV(effective, kilos)
  const dv = base > 0 ? base + (gasLeak ? GAS_LEAK_DV : 0) : 0
  const place = range?.tamped ? "tamped" : (PLACEMENTS[placement] ? placement : "free")
  const falloff = BLAST_FALLOFF[shape] ?? BLAST_FALLOFF.circular
  return {
    effective, dv, placement: place, multiplier: PLACEMENTS[place],
    targetDV: dv * PLACEMENTS[place],
    falloff, shape: BLAST_FALLOFF[shape] ? shape : "circular",
    radius: dv > 0 ? Math.ceil(dv / Math.abs(falloff)) : 0,
    ap: NEAR_AP,
    backgroundCount: explosionBackgroundCount(dv),
    backgroundRadius: dv,
  }
}
