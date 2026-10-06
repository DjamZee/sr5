import {
  SR5, AUGMENTATION_GRADE_TABLE
} from '../config.js'

/**
 * Implant grades at the counter.
 *
 * The figures live in `AUGMENTATION_GRADE_TABLE`, which the item itself also
 * reads: the shop only decides which grades are on offer and what a compendium
 * entry costs once regraded. Pure functions, no DOM: the shop window (lot B)
 * and the gamemaster's shop (lot C) call them as they are.
 */
export class SR5ShopGrades {

  /** The book's grades, in the order of the table (SR5 p. 454). */
  static CORE = ['used', 'standard', 'alphaware', 'betaware', 'deltaware']

  /** "Seules les gammes standard, alphaware et d'occasion sont disponibles lors de la création" (SR5 p. 454). */
  static CREATION = ['used', 'standard', 'alphaware']

  /** Augmentation types the grade table applies to: cyberware and bioware (SR5 p. 454). */
  static GRADED_TYPES = ['cyberware', 'bioware', 'culturedBioware']

  /** Is this item sold in grades at all? */
  static isGraded(type, system) {
    return type === 'itemAugmentation' && SR5ShopGrades.GRADED_TYPES.includes(system?.type)
  }

  /**
   * The grades offered for an augmentation.
   *
   * @param {object} options
   * @param {string} options.augmentationType `system.type` of the implant
   * @param {boolean} options.creation the shop's creation mode
   * @param {boolean} options.gamma world option, Chrome Flesh p. 74
   * @param {boolean} options.greyware world option, Better Than Bad p. 142
   * @param {boolean} options.all the gamemaster's Equip mode: every grade
   */
  static available({
    augmentationType, creation = false, gamma = false, greyware = false, all = false
  } = {
  }) {
    if (!SR5ShopGrades.GRADED_TYPES.includes(augmentationType)) return ['standard']
    // The gamemaster's Equip mode places every grade the book knows, whatever the world
    // options; greyware stays cyberware only even there (BTB p. 142)
    if (all) return [...SR5ShopGrades.CORE, 'gamma', ...(augmentationType === 'cyberware' ? ['greyware'] : [])]
    const grades = [...(creation ? SR5ShopGrades.CREATION : SR5ShopGrades.CORE)]
    // Gamma ware is a prototype: never at creation (DjamZ's ruling, 2026-10-05)
    if (gamma && !creation) grades.push('gamma')
    // "La GreyWare est disponible à la création", and "seule la cybernétique
    // peut être achetée en version GreyWare" (BTB p. 142)
    if (greyware && augmentationType === 'cyberware') grades.push('greyware')
    return grades
  }

  /** The table row of a grade, standard when unknown. */
  static row(grade) {
    return AUGMENTATION_GRADE_TABLE[grade] ?? AUGMENTATION_GRADE_TABLE.standard
  }

  /**
   * The unit price of `system` once regraded to `grade`.
   *
   * A compendium entry has already been priced at its own grade, so that grade
   * is taken back out before the new one goes in.
   */
  static price(system, grade) {
    const value = Number(system?.price?.value ?? system?.price?.base ?? 0) || 0
    const from = SR5ShopGrades.row(system?.grade).price
    return Math.round(value / from * SR5ShopGrades.row(grade).price)
  }

  /** The availability rating of `system` once regraded to `grade`. */
  static availability(system, grade) {
    const value = Number(system?.availability?.value ?? system?.availability?.base ?? 0) || 0
    if (!value) return 0
    const from = SR5ShopGrades.row(system?.grade).availability
    return Math.max(0, value - from + SR5ShopGrades.row(grade).availability)
  }

  /**
   * The regraded availability as the books print it: the rating, then the
   * legality letter — `5R`, `12P`, or a bare number for legal gear.
   */
  static availabilityLabel(system, grade) {
    const letter = SR5.legalTypesShort[system?.legality]
    return `${SR5ShopGrades.availability(system, grade)}${letter ? game.i18n.localize(letter) : ''}`
  }

  /**
   * The Essence cost of `system` once regraded to `grade`, rounded as the item
   * itself rounds it (`SR5_EntityHelpers.updateValue`, two decimals): the cost
   * announced at the counter is the one the sheet will show.
   */
  static essence(system, grade) {
    const value = Number(system?.essenceCost?.value ?? system?.essenceCost?.base ?? 0) || 0
    const from = SR5ShopGrades.row(system?.grade).essence
    const standard = from === 1 ? value : value / from
    return Math.round(standard * SR5ShopGrades.row(grade).essence * 100) / 100
  }

  /**
   * Greyware on an Awakened character: "en plus de la perte de Magie due à la
   * réduction d'Essence, les personnages Éveillés perdent un point de Magie
   * supplémentaire ainsi qu'une réduction d'un point de leur maximum de Magie,
   * par implant GreyWare installé" (BTB p. 142). DjamZ's ruling (2026-10-05):
   * the shop asks for confirmation first, and the Magic point is taken by the
   * actor's own computation (`updateSpecialAttributes`). The system keeps no
   * Magic maximum, so that half of the penalty is announced, not applied.
   * Natural Magic first: once the penalty is in, augmented Magic may read 0.
   */
  static isAwakened(actor) {
    const magic = actor?.system?.specialAttributes?.magic
    return Number(magic?.natural?.value ?? magic?.augmented?.value ?? 0) > 0
  }

  /**
   * Magic points lost to greyware, BTB p. 142: one per greyware implant
   * installed. Accessories go uncounted, as they are for Essence
   * (`entityActor.js`): they share their host's grade and are not a second implant.
   */
  static greywareMagicPenalty(items) {
    let count = 0
    for (const item of items ?? []) {
      if (item.type === 'itemAugmentation' && item.system?.grade === 'greyware' && !item.system?.isAccessory) count++
    }
    return count
  }
}
