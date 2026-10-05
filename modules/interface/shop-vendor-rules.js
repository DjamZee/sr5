/**
 * The gamemaster's vendor (shop lot C), its rules without Foundry: prices,
 * what is on the counter, what a restock adds. Kept free of globals so they
 * can be read — and tested — on their own.
 *
 * A vendor is an actor (a Grunt) carrying an itemStorage of type "shop": its
 * stock is what is stored in it, its till a credstick of the same actor.
 */

/** The book's reading of a shop when nothing was set (`system.shop` of the storage). */
export const SHOP_DEFAULTS = {
  label: '',
  isOpen: false,
  margin: 0,
  maxAvailability: 12,
  legality: ['legal', 'R'],
  shelves: [],
  perShelf: 10,
  stackQuantity: 5,
  cashboxId: '',
  onOrder: false,
  approve: false,
  banner: '',
  accent: '',
  portrait: '',
  template: '',
  contactId: '',
  buyAll: false,
  clients: [],
  negotiationPool: 0,
}

/** Is this item a vendor's stock? */
export function isShopStorage(item) {
  return item?.type === 'itemStorage' && item.system?.type === 'shop'
}

/** The shop's settings, the defaults filling what is missing. */
export function shopSettings(storage) {
  return {
    ...SHOP_DEFAULTS, ...(storage?.system?.shop ?? {
    })
  }
}

/**
 * The vendor's price: the listed price adjusted by the margin, the
 * gamemaster's own adjustment ("le meneur de jeu est donc libre de
 * l'ajuster", SR5 p. 419). Rounded to the nuyen, never below zero.
 */
export function vendorPrice(listed, margin = 0) {
  const factor = 1 + (Number(margin) || 0) / 100
  return Math.max(0, Math.round((Number(listed) || 0) * factor))
}

/** The items of an actor sitting in this storage. */
export function stockOf(items, storageId) {
  if (!storageId) return []
  return [...(items ?? [])].filter(item => item?.system?.storedIn === storageId)
}

/** How many of an item are on the counter: a stack its quantity, anything else one. */
export function piecesOf(item) {
  const quantity = Number(item?.system?.quantity)
  return Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1
}

/**
 * Does an entry pass the shop's restock filters? Its shelf ticked, its
 * legality allowed ('legal', 'R', 'F'), its availability under the ceiling. A shop with
 * no shelf ticked restocks nothing: the gamemaster says what it sells.
 */
export function fitsRestock(described, shelf, shop) {
  if (!shop.shelves?.length || !shop.shelves.includes(shelf)) return false
  if (!(shop.legality ?? []).includes(described.legality || 'legal')) return false
  if (shop.maxAvailability > 0 && (described.availability || 0) > shop.maxAvailability) return false
  return described.price > 0
}

/**
 * What a restock adds: per ticked shelf, enough new items to reach
 * `perShelf`, drawn at random among the candidates not already in stock.
 *
 * @param {object[]} candidates entries that fit the shop, each with `uuid` and `shelf`
 * @param {object[]} stock the items on the counter, each with `shelf` and `sourceUuid`
 * @param {object} shop the shop's settings
 * @param {Function} [random] () => [0, 1), for the tests
 * @returns {object[]} the candidates to add
 */
export function restockPicks(candidates, stock, shop, random = Math.random) {
  const present = new Set(stock.map(item => item.sourceUuid).filter(Boolean))
  const picks = []
  for (const shelf of shop.shelves ?? []) {
    const have = stock.filter(item => item.shelf === shelf).length
    let need = Math.max(0, (shop.perShelf || 0) - have)
    const pool = candidates.filter(entry => entry.shelf === shelf && !present.has(entry.uuid))
    while (need > 0 && pool.length) {
      const [entry] = pool.splice(Math.floor(random() * pool.length), 1)
      picks.push(entry)
      need--
    }
  }
  return picks
}

/**
 * Where the money of a sale goes: into the cashbox up to what the stick still
 * takes in, the rest on the vendor's accounts.
 */
export function splitTakings(total, room) {
  const sum = Math.max(0, Math.floor(Number(total) || 0))
  const intoStick = Math.min(sum, Number.isFinite(room) ? Math.max(0, room) : sum)
  return {
    intoStick, overflow: sum - intoStick
  }
}

/**
 * Check the lines of a sale against the counter. Every quantity must be a
 * whole number of at least one, the item still in this storage, in that
 * quantity. A line asking twice for the same item counts both.
 *
 * @param {Map|object} items the vendor's items, with `get(id)`
 * @param {string} storageId
 * @param {Array<{itemId: string, quantity: number}>} lines
 * @returns {{ok: object[], refused: object[]}}
 */
export function checkStockLines(items, storageId, lines) {
  const ok = [], refused = []
  const taken = new Map()
  for (const line of lines ?? []) {
    const quantity = Number(line?.quantity)
    const item = items?.get?.(line?.itemId)
    if (!Number.isInteger(quantity) || quantity < 1) {
      refused.push({
        line, reason: 'quantity'
      })
      continue
    }
    if (!item || item.system?.storedIn !== storageId) {
      refused.push({
        line, reason: 'gone'
      })
      continue
    }
    const already = taken.get(item.id) ?? 0
    if (already + quantity > piecesOf(item)) {
      refused.push({
        line, reason: 'short', item
      })
      continue
    }
    taken.set(item.id, already + quantity)
    ok.push({
      line, item, quantity
    })
  }
  return {
    ok, refused
  }
}

/** The open shop a token gives on a double-click, to someone who does not own it. */
export function vendorShopOfToken(token) {
  const actor = token?.actor
  if (!actor || actor.isOwner) return null
  const storage = actor.items?.find(item => isShopStorage(item) && shopSettings(item).isOpen)
  return storage ? {
    actor, storage
  } : null
}

/**
 * What the gamemaster needs to see of an item before buying it back (Élise's ruling after Nora's
 * second review): its kind, its category, and its key figures — damage, armor penetration and
 * firing modes for a weapon, the rating for anything else.
 */
export function itemFigures(item) {
  const system = item?.system ?? {
  }
  const figures = {
    type: item?.type ?? '', category: system.category ?? system.type ?? '',
  }
  if (item?.type === 'itemWeapon') {
    const modes = system.firingMode ?? {
    }
    figures.damage = `${system.damageValue?.base ?? ''}${system.damageType ?? ''}`
    figures.ap = Number(system.armorPenetration?.base ?? 0) || 0
    figures.modes = [['singleShot', 'CC'], ['semiAutomatic', 'SA'], ['burstFire', 'TR'], ['fullyAutomatic', 'TA']]
      .filter(([key]) => modes[key]).map(([, label]) => label).join('/')
  } else {
    figures.rating = Number(system.itemRating ?? system.deviceRating ?? 0) || 0
  }
  return figures
}

/**
 * Where an item and the source it claims differ: its name, its kind, its category, its figures.
 * A source the seller's copy declares proves nothing (its owner writes it): a difference is shown
 * to the gamemaster, who decides.
 */
export function figureMismatches(item, source) {
  if (!source) return []
  const differences = []
  if ((item?.name ?? '') !== (source.name ?? '')) differences.push('name')
  const mine = itemFigures(item)
  const theirs = itemFigures(source)
  for (const key of ['type', 'category', 'damage', 'ap', 'modes', 'rating']) {
    if (key in mine && key in theirs && String(mine[key]) !== String(theirs[key])) differences.push(key)
  }
  return differences
}
