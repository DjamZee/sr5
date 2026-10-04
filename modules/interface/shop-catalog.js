import {
  SR5ShopGrades
} from './shop-grades.js'

/**
 * The shop window's catalogue: shelves, filters, creation limits and the
 * odds dot of a row. Pure functions over index entries, no DOM and no game
 * settings read here, so the tests call them as they are and the gamemaster's
 * shop (lot C) can run its own stock through the same filters.
 */
export class SR5ShopCatalog {

  /**
   * Fields the shop's index carries. Asking for them makes Foundry read every
   * document of a pack once; measured on the Megapack 2.0.10 (36 item packs,
   * 7 800 items): 455 ms the first time, 4 ms after, Foundry keeps the index.
   * With them, every filter runs before the page is cut.
   */
  static INDEX_FIELDS = [
    'system.category', 'system.type', 'system.price', 'system.availability', 'system.legality',
    'system.essenceCost', 'system.grade', 'system.itemRating', 'system.deviceRating', 'flags.sr5.notForSale',
  ]

  /**
   * The shelves, in the order shown. `sub` names the field that splits a
   * shelf into sub-shelves, with the config list that labels them.
   */
  static SHELVES = [
    {
      key: 'weapons', label: 'SR5.ShopShelfWeapons', icon: 'fa-gun', types: ['itemWeapon'],
      sub: {
        field: 'system.category', options: 'weaponCategories'
      },
    },
    {
      key: 'ammunition', label: 'SR5.ShopShelfAmmunition', icon: 'fa-box', types: ['itemAmmunition']
    },
    {
      key: 'armor', label: 'SR5.ShopShelfArmor', icon: 'fa-shield-alt', types: ['itemArmor']
    },
    {
      key: 'cyberware', label: 'SR5.ShopShelfCyberware', icon: 'fa-microchip', types: ['itemAugmentation'], augmentation: ['cyberware']
    },
    {
      key: 'bioware', label: 'SR5.ShopShelfBioware', icon: 'fa-dna', types: ['itemAugmentation'], augmentation: ['bioware', 'culturedBioware']
    },
    {
      key: 'augmentations', label: 'SR5.ShopShelfOtherAugmentations', icon: 'fa-syringe', types: ['itemAugmentation']
    },
    {
      key: 'electronics', label: 'SR5.ShopShelfElectronics', icon: 'fa-laptop', types: ['itemDevice', 'itemProgram']
    },
    {
      key: 'gear', label: 'SR5.ShopShelfGear', icon: 'fa-toolbox', types: ['itemGear']
    },
    {
      key: 'vehicles', label: 'SR5.ShopShelfVehicles', icon: 'fa-car', types: ['itemVehicle', 'itemVehicleMod']
    },
    {
      key: 'drugs', label: 'SR5.ShopShelfDrugs', icon: 'fa-pills', types: ['itemDrug', 'itemToxin']
    },
    {
      key: 'magic', label: 'SR5.ShopShelfMagic', icon: 'fa-hat-wizard', types: ['itemFocus']
    },
    {
      key: 'identities', label: 'SR5.ShopShelfIdentities', icon: 'fa-id-card', types: ['itemSin']
    },
    {
      key: 'containers', label: 'SR5.ShopShelfContainers', icon: 'fa-suitcase', types: ['itemStorage']
    },
  ]

  /** The shelf an entry sits on; the first that matches, so cyberware never lands in "other implants". */
  static shelfOf(entry) {
    for (const shelf of SR5ShopCatalog.SHELVES) {
      if (!shelf.types.includes(entry?.type)) continue
      if (shelf.augmentation && !shelf.augmentation.includes(entry.system?.type)) continue
      return shelf.key
    }
    return null
  }

  /** The sub-shelf value of an entry, `_none` when its shelf is split and the field is empty. */
  static subOf(entry) {
    const shelf = SR5ShopCatalog.SHELVES.find(s => s.key === SR5ShopCatalog.shelfOf(entry))
    if (!shelf?.sub) return null
    return foundry.utils.getProperty(entry, shelf.sub.field) || '_none'
  }

  /* -------------------------------------------- */
  /*  Creation limits                             */
  /* -------------------------------------------- */

  /**
   * Gear limits at character creation, SR5 p. 66 (Jouabilité alternative) and p. 420:
   * street level, availability 10 and device rating 4; the book's standard
   * runner, 12 and 6; prime runner, 15 and 6.
   */
  static CREATION_LEVELS = {
    street: {
      availability: 10, rating: 4
    },
    standard: {
      availability: 12, rating: 6
    },
    elite: {
      availability: 15, rating: 6
    },
  }

  /**
   * The limits in force for a level. DjamZ's ruling (2026-10-05): a world
   * setting for the gamemaster, the book by default, the three levels of
   * SR5 p. 66 as presets and a free value for any other table.
   */
  static creationLimits(level, custom = {
  }) {
    if (level === 'custom') {
      // The table's own figures; 0 in either field is no limit on it
      return {
        availability: Math.max(0, Number(custom.availability) || 0),
        rating: Math.max(0, Number(custom.rating) || 0),
        source: 'custom',
      }
    }
    const known = SR5ShopCatalog.CREATION_LEVELS[level] ? level : 'standard'
    return {
      ...SR5ShopCatalog.CREATION_LEVELS[known],
      // Where the figures come from, for the message: the standard runner's 12 and 6 are
      // SR5 p. 420, the other two levels SR5 p. 66
      source: known === 'standard' ? 'p420' : 'p66',
    }
  }

  /** The rating creation caps: the item's rating, or its device rating (SR5 p. 420). */
  static ratingOf(system) {
    return Math.max(Number(system?.itemRating) || 0, Number(system?.deviceRating) || 0)
  }

  /**
   * Why a line is out of reach at creation, or null when it is allowed. A limit of 0
   * is no limit. The rating limit reads the rating or the Device Rating, the higher,
   * at every level: SR5 p. 420 says "indice (ou Indice d'appareil)", and Élise reads
   * the street level of p. 66 ("Indices d'appareil de 4 au maximum") the same way.
   */
  static creationBlock(line, limits) {
    if (!limits) return null
    if (limits.availability && line.availability > limits.availability) return 'availability'
    if (limits.rating && line.rating > limits.rating) return 'rating'
    return null
  }

  /* -------------------------------------------- */
  /*  A row                                       */
  /* -------------------------------------------- */

  /**
   * The fields of a prepared item the shop reads, copied: the prepared item
   * itself is not kept alive. Prices, availability and Essence carry their
   * derived value (what the till charges) and their base.
   */
  static essentials(system) {
    const pair = field => ({
      value: Number(field?.value ?? 0) || 0, base: Number(field?.base ?? 0) || 0,
    })
    return {
      type: system?.type,
      category: system?.category,
      grade: system?.grade,
      legality: system?.legality,
      itemRating: Number(system?.itemRating) || 0,
      deviceRating: Number(system?.deviceRating) || 0,
      price: system?.price === undefined ? undefined : pair(system.price),
      availability: pair(system?.availability),
      essenceCost: pair(system?.essenceCost),
    }
  }

  /**
   * What a row shows of an entry at a given grade: price, availability,
   * legality letter, Essence and rating. A grade only applies to implants.
   */
  static describe(entry, grade = null) {
    const system = entry.system ?? {
    }
    const availability = grade ?
      SR5ShopGrades.availability(system, grade) :
      Number(system.availability?.value ?? system.availability?.base ?? 0) || 0
    const price = grade ?
      SR5ShopGrades.price(system, grade) :
      Number(system.price?.value ?? system.price?.base ?? 0) || 0
    const essence = entry.type === 'itemAugmentation' ?
      SR5ShopGrades.essence(system, grade ?? system.grade) :
      null
    return {
      price,
      availability,
      legality: system.legality === 'R' || system.legality === 'F' ? system.legality : '',
      essence,
      rating: SR5ShopCatalog.ratingOf(system),
    }
  }

  /**
   * The dot of a row: how the searcher's pool compares with the availability.
   * A landmark, not a probability (Élise's validation of Q2, 2026-10-05):
   * green two dice or more above, orange within one, red below that.
   * Common goods are not tested (SR5 p. 420) and get no dot.
   */
  static odds(pool, availability) {
    if (!availability) return null
    const margin = pool - availability
    if (margin >= 2) return 'good'
    if (margin >= -1) return 'even'
    return 'poor'
  }

  /* -------------------------------------------- */
  /*  Filters                                     */
  /* -------------------------------------------- */

  /**
   * Keep the rows the filters let through. Run on the whole catalogue,
   * before the page is cut: the count then tells the truth, and a prototype
   * hidden from a player is never counted for them.
   *
   * @param {object[]} rows each with name, shelf, sub, price, availability, legality, rating, notForSale
   * @param {object} filters
   * @param {string} [filters.shelf] a shelf key, empty for all
   * @param {string} [filters.sub] a sub-shelf value
   * @param {string} [filters.search] part of the name, accents and case ignored
   * @param {number|null} [filters.maxPrice]
   * @param {number|null} [filters.maxAvailability]
   * @param {string[]} [filters.legality] the letters let through: '' (legal), 'R', 'F'
   * @param {boolean} [filters.affordable] only what the budget covers
   * @param {number} [filters.budget] the balance left once the cart is paid (Q5)
   * @param {object|null} [filters.creation] the creation limits, when they apply
   * @param {boolean} [filters.prototypes] show the gamemaster's prototypes
   */
  static filter(rows, filters = {
  }) {
    const search = filters.search ? SR5ShopCatalog.normalize(filters.search) : ''
    const legality = filters.legality ?? ['', 'R', 'F']
    return rows.filter(row => {
      if (row.notForSale && !filters.prototypes) return false
      if (filters.shelf && row.shelf !== filters.shelf) return false
      if (filters.shelf && filters.sub && row.sub !== filters.sub) return false
      if (search && !SR5ShopCatalog.normalize(row.name).includes(search)) return false
      if (Number.isFinite(filters.maxPrice) && row.price > filters.maxPrice) return false
      if (Number.isFinite(filters.maxAvailability) && row.availability > filters.maxAvailability) return false
      if (!legality.includes(row.legality)) return false
      if (filters.affordable) {
        if (Number.isFinite(filters.budget) && row.price > filters.budget) return false
        if (SR5ShopCatalog.creationBlock(row, filters.creation)) return false
      }
      return true
    })
  }

  /** Lowercase, accents removed: "Épée" is found by "epee". */
  static normalize(text) {
    return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  }
}
