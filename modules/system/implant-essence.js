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

/** The items of an actor as a list: an embedded collection, a Map or an array. */
function listOf(items) {
  if (Array.isArray(items)) return items
  if (Array.isArray(items?.contents)) return items.contents
  return typeof items?.values === "function" ? [...items.values()] : []
}

/** The active effects of `items` that touch implants, with the name of the item carrying each. */
function activeEffects(items) {
  const found = []
  for (const item of listOf(items)) {
    // Raw creation data may still hold the indexed object the packs store ({"0": {...}})
    const raw = item?.system?.systemEffects
    const effects = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : []
    if (!effects.length || !item.system.isActive) continue
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
 * The Essence a buyer keeps after a purchase, read on the buyer's own items. A line: `{type, name, system,
 * grade, quantity}` — the item as sold and the grade chosen. The lines a sensitive body rejects are screened
 * out before (screenRejectedImplants); what is left here is installed. Accessories cost no Essence, as on the
 * sheet (entityActor.js).
 */
export function essenceAfterPurchase(essence, items, lines) {
  let left = Number(essence) || 0
  for (const line of lines ?? []) {
    if (line?.type !== "itemAugmentation" || line.system?.isAccessory) continue
    const effects = implantEssenceEffects(items, line.system?.type)
    const graded = SR5ShopGrades.essence(line.system, line.grade ?? line.system?.grade)
    left -= implantEssence(graded, effects) * Math.max(1, Math.floor(Number(line.quantity) || 1))
  }
  return {
    essence: Math.round(left * 100) / 100
  }
}

/**
 * The creation option a gamemaster's confirmation travels with: the implant was screened before it moved, and
 * the gamemaster chose to keep it. Honoured for a gamemaster only (entityItem.js _preCreateOperation).
 */
export const IMPLANT_REJECTION_CONFIRMED = "sr5ImplantRejectionConfirmed"

/** An implant put in a storage (a stash, a vendor's counter) is carried, not installed: no body rejects it. */
function isInstalled(data) {
  return data?.type === "itemAugmentation" && !data.system?.storedIn
}

/**
 * Système sensible (SR5 p. 89): the implants `actor`'s body rejects among `incoming`, looked for BEFORE anything
 * moves — a transfer that deletes first and creates afterwards would lose them on both sides. The qualities among
 * `incoming` count, as they arrive with the same batch. A player is told and the implants are left out; the
 * gamemaster is asked, in his own window, and may keep them.
 * @param {Actor} actor the receiving body, read on the client that runs the transfer
 * @param {Array<{type: string, name: string, system: object}>} incoming
 * @param {object} [options]
 * @param {boolean} [options.isGM] whether the gamemaster decides
 * @param {Function} [options.warn] how a refusal is told (key, data)
 * @returns {Promise<{refused: object[], confirmed: boolean}>} `refused`: entries of `incoming` to leave out;
 *   `confirmed`: the gamemaster kept rejected implants, pass IMPLANT_REJECTION_CONFIRMED with the creation
 */
export async function screenRejectedImplants(actor, incoming, {
  isGM = game.user?.isGM, warn = (key, data) => ui.notifications?.warn(game.i18n.format(key, data))
} = {
}) {
  const body = [...listOf(actor?.items), ...(incoming ?? [])]
  const rejected = (incoming ?? []).map(data => ({
    data, quality: isInstalled(data) ? implantEssenceEffects(body, data.system?.type).rejectedBy : null
  })).filter(r => r.quality)
  if (!rejected.length) return {
    refused: [], confirmed: false
  }
  if (isGM) {
    const kept = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("SR5.ImplantRejectedConfirmTitle")
      },
      content: `<p>${game.i18n.format("SR5.ImplantRejectedConfirmText", {
        actor: foundry.utils.escapeHTML?.(actor?.name ?? "") ?? actor?.name,
        names: rejected.map(r => foundry.utils.escapeHTML?.(r.data.name ?? "") ?? r.data.name).join(", "),
        quality: rejected[0].quality,
      })}</p>`,
      rejectClose: false,
    }) === true
    if (kept) return {
      refused: [], confirmed: true
    }
  } else {
    for (const r of rejected) warn("SR5.WARN_ImplantRejected", {
      name: r.data.name, actor: actor?.name, quality: r.quality
    })
  }
  return {
    refused: rejected.map(r => r.data), confirmed: false
  }
}
