// What a body does to the Essence cost of an implant, beyond its grade. One place for the sheet
// (utilityItem.js _handleAugmentation) and for the shop (the cost shown to a buyer, the check at the till):
// the cost announced at the counter is the one the sheet takes.
//
// - Système sensible (SR5 p. 89): "Doublez toutes les pertes d'Essence causées par le cyberware. Le bioware,
//   quel que soit sa conception ou son type de culture, est rejeté par le corps du personnage."
// - Biocompatibilité (Chrome Flesh p. 56): "le coût en Essence des implants du type choisi est réduit de 10 %,
//   arrondi au dixième inférieur", on top of the grade ("un alphaware de 0,8 […] 0,72, arrondi à 0,7").
//
// Adapsine (Chrome Flesh p. 165) and Prototype de transhumain (p. 57) wait for the gamemaster's ruling.
import {
  SR5ShopGrades
} from "../interface/shop-grades.js"

/** The `systemEffects` values a quality carries for this. */
export const IMPLANT_ESSENCE_EFFECTS = {
  sensitiveSystem: "doubleEssenceCost",
  biocompatibilityCyberware: "biocompatibilityCyberware",
  biocompatibilityBioware: "biocompatibilityBioware",
}

/**
 * Cyberware or bioware, as the qualities read it. Nanocybernetics "suivent les règles" of cyberware
 * (Chrome Flesh p. 155); cultured bioware is bioware ("quel que soit […] son type de culture", SR5 p. 89).
 * Genetech, nanoware and symbionts are neither.
 */
export function implantFamily(augmentationType) {
  if (augmentationType === "cyberware" || augmentationType === "nanocyber") return "cyberware"
  if (augmentationType === "bioware" || augmentationType === "culturedBioware") return "bioware"
  return null
}

/** The active effects of `items` that touch implants, with the name of the item carrying each. */
function activeEffects(items) {
  const found = []
  for (const item of items ?? []) {
    const effects = item?.system?.systemEffects
    if (!Array.isArray(effects) || !effects.length || !item.system.isActive) continue
    for (const effect of effects) {
      if (Object.values(IMPLANT_ESSENCE_EFFECTS).includes(effect?.value)) found.push({
        value: effect.value, name: item.name
      })
    }
  }
  return found
}

/**
 * What the body carrying `items` does to an implant of `augmentationType`.
 * @returns {{multipliers: Array<{name: string, type: string, value: number}>, roundDownTenth: boolean,
 *   rejectedBy: string|null}}
 */
export function implantEssenceEffects(items, augmentationType) {
  const family = implantFamily(augmentationType)
  const result = {
    multipliers: [], roundDownTenth: false, rejectedBy: null
  }
  if (!family) return result
  for (const {
    value, name
  } of activeEffects(items)) {
    if (value === IMPLANT_ESSENCE_EFFECTS.sensitiveSystem) {
      if (family === "cyberware") result.multipliers.push({
        name, type: value, value: 2
      })
      else result.rejectedBy ??= name
    }
    if ((value === IMPLANT_ESSENCE_EFFECTS.biocompatibilityCyberware && family === "cyberware") ||
      (value === IMPLANT_ESSENCE_EFFECTS.biocompatibilityBioware && family === "bioware")) {
      // "Ne peut être choisi qu'une fois": a second copy does not stack
      if (!result.multipliers.some(m => m.type === value)) result.multipliers.push({
        name, type: value, value: 0.9
      })
      result.roundDownTenth = true
    }
  }
  return result
}

/** The final rounding: down to the tenth under Biocompatibilité, two decimals otherwise (as the sheet always did). */
export function roundImplantEssence(value, effects) {
  const hundredths = Math.round((Number(value) || 0) * 100)
  if (!effects?.roundDownTenth) return hundredths / 100
  return Math.floor(hundredths / 10) / 10
}

/** The cost of an implant once graded (`gradedCost`), for the body whose `effects` these are. */
export function implantEssence(gradedCost, effects) {
  let value = Number(gradedCost) || 0
  for (const m of effects?.multipliers ?? []) value *= m.value
  return roundImplantEssence(value, effects)
}

/**
 * The Essence a buyer keeps after a purchase, read on the buyer's own items, and the lines a sensitive
 * body rejects. A line: `{type, name, system, grade, quantity}` — the item as sold and the grade chosen.
 * Accessories cost no Essence, as on the sheet (entityActor.js).
 */
export function essenceAfterPurchase(essence, items, lines) {
  let left = Number(essence) || 0
  const rejected = []
  for (const line of lines ?? []) {
    if (line?.type !== "itemAugmentation" || line.system?.isAccessory) continue
    const effects = implantEssenceEffects(items, line.system?.type)
    if (effects.rejectedBy) {
      rejected.push(line.name)
      continue
    }
    const graded = SR5ShopGrades.essence(line.system, line.grade ?? line.system?.grade)
    left -= implantEssence(graded, effects) * Math.max(1, Math.floor(Number(line.quantity) || 1))
  }
  return {
    essence: Math.round(left * 100) / 100, rejected
  }
}
