// What a body does to the Essence cost of an implant, beyond its grade. One place for the sheet
// (utilityItem.js _handleAugmentation) and for the shop (the cost shown to a buyer, the check at the till):
// the cost announced at the counter is the one the sheet takes.
//
// - Système sensible (SR5 p. 89): "Doublez toutes les pertes d'Essence causées par le cyberware. Le bioware,
//   quel que soit sa conception ou son type de culture, est rejeté par le corps du personnage."
// - Biocompatibilité (Chrome Flesh p. 56): "le coût en Essence des implants du type choisi est réduit de 10 %,
//   arrondi au dixième inférieur", on top of the grade ("un alphaware de 0,8 […] 0,72, arrondi à 0,7").
// - Adapsine (Chrome Flesh p. 165): "réduit le coût en Essence du cyberware implanté (mais pas du bioware) de 10 %
//   […] seulement dans le cas où vous avez déjà commencé le traitement", the percentages added to the grade's
//   (alphaware + Adapsine = -30 %). Only the implants marked "posé sous Adapsine" (underAdapsine) get it.
// - Lots d'augmentations (Chrome Flesh p. 96, optional rule, world setting): Essence × 0.9.
// Arbitrage de DjamZ (séance G, G17): (grade − 10 % Adapsine) × 0.9 Biocompatibilité, ONE rounding down to the
// tenth at the end; two decimals when neither Adapsine nor Biocompatibilité applies.
import {
  SR5ShopGrades
} from "../interface/shop-grades.js"

/** The `systemEffects` values a quality carries for this. */
export const IMPLANT_ESSENCE_EFFECTS = {
  sensitiveSystem: "doubleEssenceCost",
  biocompatibilityCyberware: "biocompatibilityCyberware",
  biocompatibilityBioware: "biocompatibilityBioware",
  adapsine: "adapsine",
  transhumanPrototype: "transhumanPrototype",
}

/** The world settings of the optional rules of Chrome Flesh (séance G, G20): off by default. */
export const ESSENCE_HOLE_SETTING = "sr5EssenceHole"
export const AUGMENTATION_BUNDLE_SETTING = "sr5AugmentationBundles"

/** Whether a world setting is on; false while the settings are not ready (tests, early preparation). */
export function essenceSettingOn(key) {
  try {
    return globalThis.game?.settings?.get("sr5", key) === true
  } catch (_err) {
    return false
  }
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

/** The `systemEffects` of an item as a list. Raw creation data may still hold the indexed object the packs store. */
function effectsOf(item) {
  const raw = item?.system?.systemEffects
  return Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : []
}

/** Whether `item` carries the `systemEffects` value `value`, active or not. */
export function itemHasEffect(item, value) {
  return effectsOf(item).some(e => e?.value === value)
}

/**
 * Whether the item carrying an implant effect acts on the body. Each is part of the body once taken, with nothing to
 * switch on: Système sensible (SR5 p. 89), Biocompatibilité (Chrome Flesh p. 56) and Prototype de transhumain (p. 57)
 * are qualities, Adapsine a transgenic treatment already begun (p. 165). The item counts while it is on the sheet,
 * active or not, unless it is carried in a storage (décision d'Élise, 06/10).
 */
function effectOn(item) {
  return !item?.system?.storedIn
}

/** The effects of `items` that act on implants, with the name of the item carrying each. */
function activeEffects(items) {
  const found = []
  for (const item of listOf(items)) {
    const effects = effectsOf(item)
    if (!effects.length) continue
    for (const effect of effects) {
      if (Object.values(IMPLANT_ESSENCE_EFFECTS).includes(effect?.value) && effectOn(item)) found.push({
        value: effect.value, name: item.name
      })
    }
  }
  return found
}

/** Whether the body carrying `items` is under Adapsine (Chrome Flesh p. 165): an active item with the effect. */
export function hasAdapsine(items) {
  return activeEffects(items).some(e => e.value === IMPLANT_ESSENCE_EFFECTS.adapsine)
}

/**
 * What the body carrying `items` does to an implant of `augmentationType`.
 * @param {object} [implant] the implant itself
 * @param {boolean} [implant.underAdapsine] posé sous Adapsine (Chrome Flesh p. 165)
 * @param {boolean} [implant.bundle] part of a lot d'augmentations (Chrome Flesh p. 96), its world setting on
 * @returns {{multipliers: Array<{name: string, type: string, value: number}>, gradeReduction: number,
 *   roundDownTenth: boolean, rejectedBy: string|null}} `gradeReduction`: taken off the grade's multiplier
 */
export function implantEssenceEffects(items, augmentationType, {
  underAdapsine = false, bundle = false, reversibleEssence = false
} = {
}) {
  const family = implantFamily(augmentationType)
  const result = {
    multipliers: [], gradeReduction: 0, roundDownTenth: false, rejectedBy: null
  }
  // A Tatouage de mana gris is neither cyberware nor bioware: "à toutes fins utiles", 0.1 per rating (Better Than Bad
  // p. 140-141). Kept as cyberware for want of a category, it takes nothing from the body (decided with Isidore, 06/10)
  if (!family || reversibleEssence) return result
  // Added to the grade's percentage: alphaware 0.8 becomes 0.7 (Chrome Flesh p. 165)
  if (underAdapsine && family === "cyberware") {
    result.gradeReduction = 0.1
    result.roundDownTenth = true
  }
  if (bundle) result.multipliers.push({
    name: globalThis.game?.i18n?.localize("SR5.AugmentationBundle") ?? "augmentationBundle", type: "augmentationBundle",
    value: 0.9
  })
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

/**
 * The cost of an implant once graded (`gradedCost`), for the body whose `effects` these are.
 * @param {number} [gradeMultiplier] the grade's Essence multiplier, which Adapsine lowers
 */
export function implantEssence(gradedCost, effects, gradeMultiplier = 1) {
  let value = Number(gradedCost) || 0
  const reduction = effects?.gradeReduction ?? 0
  if (reduction && gradeMultiplier > 0) value = value * Math.max(0, gradeMultiplier - reduction) / gradeMultiplier
  for (const m of effects?.multipliers ?? []) value *= m.value
  return roundImplantEssence(value, effects)
}

/**
 * The Essence a buyer keeps after a purchase, read on the buyer's own items. A line: `{type, name, system,
 * grade, quantity}` — the item as sold and the grade chosen. The lines a sensitive body rejects are screened
 * out before (screenRejectedImplants); what is left here is installed. Accessories cost no Essence, as on the
 * sheet (entityActor.js).
 */
export function essenceAfterPurchase(essence, items, lines, {
  creation = false, hole = 0
} = {
}) {
  let left = Number(essence) || 0, bioware = 0, total = 0
  // A cyberware bought now is installed under the Adapsine the buyer already takes (Chrome Flesh p. 165)
  const underAdapsine = hasAdapsine(items)
  for (const line of lines ?? []) {
    if (line?.type !== "itemAugmentation" || line.system?.isAccessory) continue
    // A Tatouage de mana gris costs the Essence of its data, whatever grade (Better Than Bad p. 141)
    const fixed = line.system?.reversibleEssence === true
    const grade = fixed ? "standard" : line.grade ?? line.system?.grade
    const effects = implantEssenceEffects(items, line.system?.type, {
      underAdapsine, reversibleEssence: fixed
    })
    const graded = SR5ShopGrades.essence(line.system, grade)
    const cost = implantEssence(graded, effects, SR5ShopGrades.row(grade).essence) * Math.max(1, Math.floor(Number(line.quantity) || 1))
    total += cost
    if (implantFamily(line.system?.type) === "bioware") bioware += cost
  }
  // Prototype de transhumain: at creation, the bioware is free up to what is left of the point
  const gift = creation ? Math.min(bioware, transhumanGift(items)?.remaining ?? 0) : 0
  // Faille d'Essence (its world setting on): the new implants fill the hole first (Chrome Flesh p. 74)
  left -= Math.max(0, total - gift - Math.max(0, Number(hole) || 0))
  return {
    essence: Math.round(left * 100) / 100
  }
}

/**
 * Prototype de transhumain (Chrome Flesh p. 57): "vous pouvez choisir jusqu'à 1 point d'Essence de bioware […] ce
 * bioware ne vous coûte pas d'Essence", at character creation. Arbitrage de DjamZ (séance G, G19): a counter on the
 * quality (`transhumanEssence`, 1 by default, the gamemaster's), spent by the bioware installed while the shop's
 * creation mode is on (marked `transhumanGift` at the installation, entityItem.js), frozen once creation is over;
 * what is left then is lost. Derived from the implants: removing a gifted bioware gives its share back.
 * @returns {{name: string, points: number, used: number, remaining: number}|null} null without the quality
 */
export function transhumanGift(items) {
  const list = listOf(items)
  const quality = list.find(i => effectOn(i) &&
    effectsOf(i).some(e => e?.value === IMPLANT_ESSENCE_EFFECTS.transhumanPrototype))
  if (!quality) return null
  const points = Math.max(0, Number(quality.system.transhumanEssence ?? 1) || 0)
  let spent = 0
  for (const item of list) {
    if (item?.type !== "itemAugmentation" || !item.system?.transhumanGift || item.system.isAccessory) continue
    if (implantFamily(item.system.type) === "bioware") spent += Number(item.system.essenceCost?.value) || 0
  }
  const used = Math.round(Math.min(spent, points) * 100) / 100
  return {
    name: quality.name, points, used, remaining: Math.round((points - used) * 100) / 100
  }
}

/**
 * The Essence a removed implant took: "Quand de l'Essence est perdue, elle ne revient pas" (SR5 p. 53; arbitrage de
 * DjamZ, H22: the book, whatever the setting). Kept on the actor by the gamemaster at each removal (essence-hole.js):
 * the hole (`holeAmount`) and what the implants took right after it (`holeBase`).
 * Faille d'Essence (Chrome Flesh p. 74, optional rule, world setting): the hole "utilisée comme « crédit » pour tout
 * nouvel implant": what is installed beyond the base fills it. Without the rule, nothing fills it.
 * @param {{holeAmount: number, holeBase: number}} essence the actor's
 * @param {number} implantsTotal the Essence the implants take now (implantsEssenceLost)
 * @param {boolean} [fills] the Faille d'Essence rule is on
 */
export function essenceHole(essence, implantsTotal, fills = true) {
  const amount = Number(essence?.holeAmount) || 0
  if (amount <= 0) return 0
  if (!fills) return Math.round(amount * 100) / 100
  const filled = Math.max(0, (Number(implantsTotal) || 0) - (Number(essence?.holeBase) || 0))
  return Math.max(0, Math.round((amount - filled) * 100) / 100)
}

/**
 * The Essence the implants among `items` take, as the sheet counts it (entityActor.js: every implant but the
 * accessories), less what Prototype de transhumain gives. Read on prepared items.
 */
export function implantsEssenceLost(items) {
  const list = listOf(items)
  let total = 0
  for (const item of list) {
    if (item?.type === "itemAugmentation" && !item.system?.isAccessory) total += Number(item.system?.essenceCost?.value) || 0
  }
  return Math.round((total - (transhumanGift(list)?.used ?? 0)) * 100) / 100
}

/**
 * The fields the gamemaster alone changes once an item is installed (séance G, G16 and G19, H22): a player's update
 * that would change them is refused (entityItem.js, entityActor.js, reserved-fields.js) and the active GM puts back
 * what gets through (implant-register.js). Set at the installation from what the body has then, never from the data
 * a player sends.
 */
export const GM_ONLY_FIELDS = {
  itemAugmentation: ["underAdapsine", "augmentationBundle", "transhumanGift", "reversibleEssence"],
  itemQuality: ["transhumanEssence"],
  actor: ["essence.holeAmount", "essence.holeBase"],
}

/**
 * What an implant installed on `actor` carries from the body (séance G): posé sous Adapsine when the body already
 * takes it (G16, cyberware only), a bioware given by Prototype de transhumain while the shop's creation mode is on
 * and the point is not spent (G19). A player's data is never believed: the flags are worked out here. The
 * gamemaster's own flags are kept (an implant moved from another sheet), and he may change them afterwards.
 * @param {object} system the implant's system data
 * @returns {{underAdapsine: boolean, augmentationBundle: boolean, transhumanGift: boolean}}
 */
export function installationFlags(actor, system, {
  isGM = false, creation = false
} = {
}) {
  const family = implantFamily(system?.type)
  const installed = !system?.storedIn && !system?.isAccessory
  const adapsine = family === "cyberware" && installed && hasAdapsine(actor?.items)
  const gift = family === "bioware" && installed && creation && (transhumanGift(actor?.items)?.remaining ?? 0) > 0
  return {
    underAdapsine: (isGM && system?.underAdapsine === true) || adapsine,
    augmentationBundle: isGM && system?.augmentationBundle === true,
    transhumanGift: (isGM && system?.transhumanGift === true) || gift,
  }
}

/** The Essence `actor` lost to removed implants: filled by the implants installed since under the Faille d'Essence. */
export function currentEssenceHole(actor) {
  return essenceHole(actor?.system?.essence, implantsEssenceLost(actor?.items), essenceSettingOn(ESSENCE_HOLE_SETTING))
}

/**
 * What the body adds to the Essence its implants take: Prototype de transhumain's gift, less the hole. For
 * mentorMagic(), which works out the Magic before the actor's Essence is (updateEssence: KEEP IN STEP).
 */
export function essenceAdjustment(actor) {
  return (transhumanGift(actor?.items)?.used ?? 0) - currentEssenceHole(actor)
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

/** The Ossatures renforcées of the compendiums: sr5-compendiums fr_cyberware, then the Megapack (variants (NE) included). */
const BONE_LACING_SOURCES = [
  "Nj3jLafLvOphTlME", "ZSIXAd5KV3vdKQGU", "nwtmpWKzw69HUMEA",
  "QFTX44TmaAx5kpZb", "4fZI72EAOzZcSov8", "YXUnTc3aGHPeEfWp", "9DnyDIvH5TvK08Om", "RLnJVDeqiG0aB9aZ", "b8B5FzSIQUJvW7KM",
]

/**
 * Ossature renforcée (SR5 p. 458): "un seul type pouvant être installé à la fois". Told, in this order, by the
 * compendium it was taken from, by its name (French or English), then by what it does, for a copy renamed or made
 * by hand: the only cyberware that gives Armor and either changes the unarmed damage or adds to the damage
 * resistance. The copies already on sheets come in several shapes: sr5-compendiums up to 13.0.0-alpha.6 gives Armor
 * and resistance only, the Megapack before 2.0.16 its unarmed effect without damageType (Honoré's review). Dermal
 * armor gives Armor alone, the laser pointers touch the unarmed attacks without Armor, bone density is bioware.
 */
export function isBoneLacing(data) {
  if (data?.type !== "itemAugmentation" || data.system?.isAccessory || implantFamily(data.system?.type) !== "cyberware") return false
  // What it comes from first: the lacings of both compendiums, whatever the shape of the copy on the sheet
  const source = data._stats?.compendiumSource ?? data.flags?.core?.sourceId ?? ""
  if (BONE_LACING_SOURCES.some(id => source.endsWith(`.${id}`))) return true
  // Then its name, in French or English, accents and case aside
  const name = (data.name ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
  if (/^(ossature renforcee|bone lacing)\b/.test(name)) return true
  const raw = data.system?.customEffects
  const effects = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : []
  const unarmed = e => e?.category === "weaponEffectTargets" && e.target === "system.itemsProperties.weapon.damageValue" &&
    (e.damageType || e.type === "unarmedCombat")
  const resistance = e => e?.category === "characterResistances" && e.target === "system.resistances.physicalDamage"
  return effects.some(e => e?.category === "itemArmor") && effects.some(e => unarmed(e) || resistance(e))
}

/**
 * The bone lacing `actor` already has switched on, other than `item`: the one a second must not join (SR5 p. 458).
 * Switching one on is where two lacings installed before the screening, or kept by the gamemaster, would add up.
 */
export function activeBoneLacing(actor, item) {
  return listOf(actor?.items).find(i => i !== item && !(i.id && i.id === item?.id) && isInstalled(i) && i.system?.isActive && isBoneLacing(i)) ?? null
}

/**
 * Système sensible (SR5 p. 89): the implants `actor`'s body rejects among `incoming`, looked for BEFORE anything
 * moves — a transfer that deletes first and creates afterwards would lose them on both sides. The qualities among
 * `incoming` count, as they arrive with the same batch. A second Ossature renforcée is refused the same way
 * (SR5 p. 458, decision H5 of DjamZ). A player is told and the implants are left out; the gamemaster is asked, in
 * his own window, and may keep them.
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
  // Ossature renforcée (SR5 p. 458): one installed already, or earlier in the same batch, and a second is refused
  const lacings = listOf(actor?.items).filter(i => isInstalled(i) && isBoneLacing(i)).map(i => i.name)
  const rejected = []
  for (const data of incoming ?? []) {
    if (!isInstalled(data)) continue
    const quality = implantEssenceEffects(body, data.system?.type).rejectedBy
    if (quality) rejected.push({
      data, quality
    })
    else if (isBoneLacing(data)) {
      if (lacings.length) rejected.push({
        data, lacing: lacings[0]
      })
      else lacings.push(data.name)
    }
  }
  if (!rejected.length) return {
    refused: [], confirmed: false
  }
  if (isGM) {
    const escape = text => foundry.utils.escapeHTML?.(text ?? "") ?? text
    const paragraph = (key, list, data) => list.length ? `<p>${game.i18n.format(key, {
      actor: escape(actor?.name), names: list.map(r => escape(r.data.name)).join(", "), ...data
    })}</p>` : ""
    const bioware = rejected.filter(r => r.quality), bones = rejected.filter(r => r.lacing)
    const kept = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize(bioware.length ? "SR5.ImplantRejectedConfirmTitle" : "SR5.BoneLacingConfirmTitle")
      },
      content: paragraph("SR5.ImplantRejectedConfirmText", bioware, {
        quality: bioware[0]?.quality
      }) + paragraph("SR5.BoneLacingConfirmText", bones, {
        lacing: escape(bones[0]?.lacing)
      }),
      rejectClose: false,
    }) === true
    if (kept) return {
      refused: [], confirmed: true
    }
  } else {
    for (const r of rejected) {
      if (r.quality) warn("SR5.WARN_ImplantRejected", {
        name: r.data.name, actor: actor?.name, quality: r.quality
      })
      else warn("SR5.WARN_BoneLacingSecond", {
        name: r.data.name, actor: actor?.name, lacing: r.lacing
      })
    }
  }
  return {
    refused: rejected.map(r => r.data), confirmed: false
  }
}
