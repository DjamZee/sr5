import {
  SR5
} from '../config.js'
import {
  SR5_EntityHelpers
} from '../entities/helpers.js'
import {
  getEntryInfo
} from './compendium-browser-filters.js'
import {
  SR5ShopGrades
} from './shop-grades.js'
import {
  enhanceSelects
} from '../helpers/enhance-selects.js'
import {
  SR5Shop
} from './shop.js'
import {
  SR5ShopAvailability
} from './shop-availability.js'
import {
  SR5SellDialog
} from './shop-sell-dialog.js'
import {
  SR5ShopStock
} from './shop-stock.js'
import {
  SR5ShopCatalog
} from './shop-catalog.js'
import {
  SR5ShopVendor, SR5ShopVendorSource
} from './shop-vendor.js'
import {
  SR5Credstick
} from './credstick.js'
import {
  shopSettings
} from './shop-vendor-rules.js'
import {
  implantEssenceEffects, implantEssence, hasAdapsine
} from '../system/implant-essence.js'

/**
 * Where the shop's goods come from: the world's shelves, the compendiums the
 * gamemaster ticked. The window only ever asks a source for its entries, so
 * the gamemaster's shop (lot C) plugs a dealer in as one more source — its
 * own stock, its margin — without the window changing.
 */
export class SR5ShopWorldSource {

  key = 'world'

  /** The reading of the shelves, a promise shared by every window of this client. */
  static _index = null

  /** How far the reading has got, for the window to show. */
  static progress = {
    done: 0, total: 0
  }

  static #ready = false

  get label() {
    return game.i18n.localize('SR5.ShopSourceWorld')
  }

  /** Has the reading finished? Until then the window shows its progress. */
  isReady() {
    return SR5ShopWorldSource.#ready
  }

  /** Read the shelves, once; `onProgress` is called as items are prepared. */
  load(onProgress) {
    SR5ShopWorldSource._onProgress = onProgress
    return SR5ShopWorldSource.index()
  }

  /** Forget the index: the next window reads the compendiums again. */
  static reset() {
    SR5ShopWorldSource._index = null
    SR5ShopWorldSource.#ready = false
  }

  static index() {
    // One reading at a time: two windows opening together share it
    SR5ShopWorldSource._index ??= SR5ShopWorldSource.#read().then(entries => {
      SR5ShopWorldSource.#ready = true
      return entries
    })
    return SR5ShopWorldSource._index
  }

  /**
   * Read every sellable item of every item compendium, prepared as the till
   * will see it.
   *
   * An index carries stored fields only: the derived ones (`price.value`,
   * `availability.value`, a vehicle's rating…) are computed when an item is
   * prepared, from fields scattered all over its data — a pack's quantity, a
   * weapon's accessories, a vehicle's attributes. So the index asks for the
   * whole `system` (and the effects), and the system's own item class prepares
   * each entry: what the row shows is what `SR5Shop.checkout` charges (second
   * review, Kira: 449 rows out of 4 919 used to differ). An entry the class
   * refuses (invalid stored data) is read as the full document instead.
   *
   * Measured on the Megapack 2.0.12 (36 item packs, 4 919 sellable items):
   * index 1.0 s, preparation 2.6 s, once per session and in slices, the window
   * showing the progress. Only a few fields are kept from each prepared item.
   */
  static async #read() {
    const raw = []
    await Promise.all(game.packs.filter(p => p.documentName === 'Item').map(async pack => {
      try {
        const index = await pack.getIndex({
          fields: ['system', 'effects', 'flags']
        })
        for (const entry of index) {
          if (SR5ShopStock.isSellableType(entry.type)) raw.push({
            pack, entry
          })
        }
      } catch (err) {
        console.warn(`SR5 Shop: failed to index pack ${pack.collection}`, err)
      }
    }))
    const progress = SR5ShopWorldSource.progress
    progress.total = raw.length
    progress.done = 0
    const lists = SR5_EntityHelpers.sortTranslations(SR5)
    const entries = []
    for (const {
      pack, entry
    } of raw) {
      const prepared = await SR5ShopWorldSource.#prepare(pack, entry, lists)
      if (prepared) entries.push(prepared)
      progress.done++
      if (progress.done % 250 === 0) {
        SR5ShopWorldSource._onProgress?.(progress)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    // Sorted once: the filters keep the order, so a redraw never sorts again
    const collator = new Intl.Collator(game.i18n.lang)
    return entries.sort((a, b) => collator.compare(a.name, b.name))
  }

  /** One entry, prepared by the system and cut down to what the shop reads. */
  static async #prepare(pack, entry, lists) {
    let system
    try {
      const Item = CONFIG.Item.documentClass
      system = new Item({
        name: entry.name, type: entry.type, system: entry.system, effects: entry.effects ?? [],
      }).system
    } catch {
      // The stored data does not validate (Heritage (12) in the Megapack 2.0.12): the
      // document loads anyway, cleaned by Foundry, and it is what the till reads
      try {
        system = (await pack.getDocument(entry._id))?.system
      } catch (err) {
        console.warn(`SR5 Shop: ${entry.name} could not be read`, err)
      }
    }
    if (!system) return null
    const kept = {
      _id: entry._id,
      name: entry.name,
      img: entry.img,
      type: entry.type,
      docName: 'Item',
      uuid: `Compendium.${pack.collection}.Item.${entry._id}`,
      packId: pack.collection,
      flags: {
        sr5: {
          notForSale: entry.flags?.sr5?.notForSale === true
        }
      },
      system: SR5ShopCatalog.essentials(system),
      // The summary line, from the stored data; its price and grade are the row's own columns
      info: getEntryInfo({
        type: entry.type, system: {
          ...entry.system, price: undefined, grade: undefined
        }
      }, lists),
    }
    kept.shelf = SR5ShopCatalog.shelfOf(kept)
    kept.sub = SR5ShopCatalog.subOf(kept)
    return kept
  }

  /**
   * The entries on offer, in name order. A prototype stays in the list for
   * the gamemaster, marked and not for sale; the window drops it for a player
   * before counting anything. An item at 0¥ — templates, critter weapons,
   * notes — is not goods and stays off the counter; Equip mode still places it.
   */
  async entries({
    equip = false
  } = {
  }) {
    const index = await SR5ShopWorldSource.index()
    const excluded = SR5ShopStock.excludedPacks
    const isGM = game.user.isGM
    return index.filter(entry => {
      if (!equip && !(SR5ShopCatalog.describe(entry).price > 0)) return false
      if (SR5ShopStock.canSell(entry, {
        equip, excluded
      })) return true
      return isGM && SR5ShopStock.isNotForSale(entry) && SR5ShopStock.canSell({
        ...entry, flags: {
        }
      }, {
        excluded
      })
    })
  }

  /**
   * Check the shop against the till: every entry is compared with its full
   * document, as `SR5Shop.checkout` reads it. Run from the console by the
   * gamemaster (`game.sr5.shopAudit()`), it should answer no difference.
   */
  static async audit() {
    const entries = await SR5ShopWorldSource.index()
    const differences = []
    // The documents are read a compendium at a time: one request per pack, not per item
    const documents = new Map()
    for (const packId of new Set(entries.map(entry => entry.packId))) {
      for (const document of await game.packs.get(packId)?.getDocuments() ?? []) documents.set(document.uuid, document)
    }
    for (const entry of entries) {
      const document = documents.get(entry.uuid)
      if (!document) continue
      const shown = SR5ShopCatalog.describe(entry)
      const charged = SR5ShopCatalog.describe(document)
      for (const key of ['price', 'availability', 'legality', 'essence', 'rating']) {
        if (shown[key] !== charged[key]) differences.push({
          name: entry.name, uuid: entry.uuid, key, shown: shown[key], charged: charged[key]
        })
      }
    }
    return {
      checked: entries.length, differences
    }
  }
}

/**
 * The shop, in a window of its own (inventory §1, lot B): shelves on the
 * left, one wide row per item in the middle, the buyer, the cart and the
 * till on the right. Its colours are the system theme's (the "Style"
 * setting, SR5 or SR6). Paying goes through `SR5Shop.checkout`.
 */
export class SR5ShopWindow extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static _instance = null

  /**
   * Open the shop, or bring it forward.
   * @param {object} [options]
   * @param {Actor} [options.actor] the buyer to select, from a character sheet
   */
  static open({
    actor = null, source = null
  } = {
  }) {
    let shop = SR5ShopWindow._instance
    if (!shop?.rendered) {
      shop = new SR5ShopWindow(source ? {
        source
      } : {
      })
      SR5ShopWindow._instance = shop
    } else if (source && shop._source?.key !== source.key) shop.setSource(source)
    if (actor) shop._buyerId = actor.id
    shop.render(true).then(() => shop.bringToFront?.()).catch(err => {
      console.error('SR5 Shop: failed to open', err)
      ui.notifications?.error(game.i18n.localize('SR5.ShopWindowFailed'))
    })
    return shop
  }

  static DEFAULT_OPTIONS = {
    id: 'sr5-shop',
    classes: ['sr5', 'sr-application', 'sr-shop-window'],
    position: {
      width: 1400, height: 860
    },
    window: {
      title: 'SR5.ShopWindow',
      icon: 'fas fa-cart-shopping',
      resizable: true,
    },
    actions: {
      setShelf: SR5ShopWindow.#onSetShelf,
      toggleLegality: SR5ShopWindow.#onToggleLegality,
      clearFilters: SR5ShopWindow.#onClearFilters,
      refresh: SR5ShopWindow.#onRefresh,
      loadMore: SR5ShopWindow.#onLoadMore,
      viewItem: SR5ShopWindow.#onViewItem,
      addToCart: SR5ShopWindow.#onAddToCart,
      removeFromCart: SR5ShopWindow.#onRemoveFromCart,
      clearCart: SR5ShopWindow.#onClearCart,
      checkoutCart: SR5ShopWindow.#onCheckoutCart,
      testAvailability: SR5ShopWindow.#onTestAvailability,
      testCartAvailability: SR5ShopWindow.#onTestCartAvailability,
      openSell: SR5ShopWindow.#onOpenSell,
      newVendor: SR5ShopWindow.#onNewVendor,
    },
  }

  static PARTS = {
    shop: {
      template: 'systems/sr5/templates/interface/shop-window.hbs', scrollable: ['.sr-shop-list', '.sr-shop-shelves', '.sr-shop-till'],
    },
  }

  constructor(options = {
  }) {
    super(options)
    this._source = options.source ?? SR5ShopWindow.#defaultSource()
    // How the buyer pays a vendor: '' the accounts, else one of their credsticks (SR5 p. 445)
    this._payWith = ''
    this._shelf = ''
    this._sub = ''
    this._search = ''
    this._maxPrice = null
    this._maxAvailability = null
    this._legality = ['', 'R', 'F']
    this._affordable = false
    this._page = 0
    // 50 wide rows fill the window twice over; more only slows every redraw (second review: < 100 ms)
    this._pageSize = 50
    this._buyerId = null
    this._equipMode = false
    // The grade chosen on each implant row, by uuid. Never overwritten by a
    // render: a grade the row stops offering for a moment comes back with it.
    this._grades = {
    }
    // [{uuid, grade, name, img, quantity}]
    this._cart = []
    this._contactId = null
    this._surcharge = 0
    this._overridePool = null
    this._overrideLimit = null
  }

  /**
   * Where a window opens: the world's shelves, unless the gamemaster closed
   * them to the players; then the first vendor open to them, if any.
   */
  static #defaultSource() {
    if (game.user.isGM || SR5ShopVendor.marketOpen) return new SR5ShopWorldSource()
    const first = SR5ShopVendor.vendors()[0]
    return first ? new SR5ShopVendorSource(first.actor, first.storage) : new SR5ShopWorldSource()
  }

  /** Change shop: the cart and the filters of the last one are left behind. */
  setSource(source) {
    this._source = source
    // The title is drawn once with the window frame: it follows the shop by hand
    const title = this.window?.title
    if (title) title.textContent = this.title
    this._cart = []
    this._shelf = ''
    this._sub = ''
    this._page = 0
    this._payWith = ''
  }

  get title() {
    const source = this._source?.label
    return source ? `${game.i18n.localize('SR5.ShopWindow')} — ${source}` : game.i18n.localize('SR5.ShopWindow')
  }

  /* -------------------------------------------- */
  /*  Data                                        */
  /* -------------------------------------------- */

  /**
   * A row's figures at a grade, worked out once per entry and grade: a redraw
   * only filters (second review, Kira: a redraw used to take 0.45 s).
   */
  static #described(entry, grade) {
    entry._described ??= new Map()
    const key = grade ?? ''
    if (!entry._described.has(key)) entry._described.set(key, SR5ShopCatalog.describe(entry, grade))
    return entry._described.get(key)
  }

  /** The grade a row shows: the one chosen, while it is offered; else the entry's own, else standard. */
  #gradeOf(entry, offered) {
    if (!offered.length) return null
    const chosen = this._grades[entry.uuid]
    if (offered.includes(chosen)) return chosen
    return offered.includes(entry.system?.grade) ? entry.system.grade : 'standard'
  }

  /** Who is looking, with what pool: the buyer, or a contact (SR5 p. 420), plus the bought dice. */
  #searchPool(buyer) {
    if (!buyer) return null
    // At a vendor's, the vendor is who looks for what it has not got (SR5 p. 420)
    const vendor = this._source?.vendor ? this._source.actor : null
    if (vendor) {
      const searcher = SR5ShopVendor.searcherOf(vendor, this._source.storage).pool
      return Math.max(0, (this._overridePool ?? (searcher.raw ?? searcher.pool)) + SR5ShopAvailability.surchargeDice(this._surcharge))
    }
    const contact = this._contactId ? buyer.items.get(this._contactId) : null
    const searcher = contact ? SR5ShopAvailability.contactPool(contact) : SR5ShopAvailability.buyerPool(buyer)
    const base = this._overridePool ?? (searcher.raw ?? searcher.pool)
    return Math.max(0, base + SR5ShopAvailability.surchargeDice(this._surcharge))
  }

  /** Read the shelves, showing the progress in the window, then draw again. */
  async #loadSource() {
    if (this._loading) return
    this._loading = true
    try {
      await this._source.load(progress => {
        const label = this.element?.querySelector('[data-shop-progress]')
        if (label) label.textContent = game.i18n.format('SR5.ShopLoading', progress)
      })
    } finally {
      this._loading = false
    }
    if (this.rendered) this.render()
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const isGM = game.user.isGM
    const equip = this._equipMode && isGM

    // Buyer, balance, free modes
    const buyers = SR5Shop.getBuyers({
      equip
    })
    if (this._buyerId && !buyers.some(a => a.id === this._buyerId)) this._buyerId = null
    if (!this._buyerId) this._buyerId = SR5Shop.defaultBuyerId(buyers)
    const buyer = buyers.find(a => a.id === this._buyerId) || null
    // At a vendor's, cash on a carried credstick pays too (SR5 p. 445)
    const vendorSource = this._source?.vendor ? this._source : null
    const sticks = vendorSource && buyer ? SR5Credstick.carried(buyer) : []
    if (this._payWith && !sticks.some(s => s.id === this._payWith)) this._payWith = ''
    const stick = this._payWith ? sticks.find(s => s.id === this._payWith) : null
    const balance = stick ? SR5Credstick.funds(stick) : buyer ? SR5Shop.balance(buyer) : 0
    const creationMode = SR5Shop.creationMode
    const free = creationMode || equip
    const limits = creationMode && !equip ? SR5Shop.creationLimits : null
    const pool = this.#searchPool(buyer)

    // The shelves are read once per session; until then the window shows how far it has got
    const ready = this._source.isReady?.() ?? true
    if (!ready) this.#loadSource()
    context.loading = !ready
    context.loadingLabel = game.i18n.format('SR5.ShopLoading', SR5ShopWorldSource.progress)

    // Every row of the catalogue, described at the grade it shows. The grades on
    // offer depend on the implant's kind only, so they are asked once per kind.
    // The world's shelves closed to the players: they buy from the vendors only
    const marketClosed = !vendorSource && !isGM && !SR5ShopVendor.marketOpen
    const entries = ready && !marketClosed ? await this._source.entries({
      equip
    }) : []
    context.marketClosed = marketClosed
    context.sources = this.#sourcesContext()
    context.vendor = vendorSource ? this.#vendorContext(vendorSource) : null
    context.payChoices = sticks.length ? [{
      id: '', label: game.i18n.localize('SR5.ShopVendorPayAccounts'), selected: !this._payWith
    }, ...sticks.map(s => ({
      id: s.id, label: `${s.name} (${SR5Credstick.funds(s).toLocaleString()}¥)`, selected: s.id === this._payWith,
    }))] : null
    const offeredByKind = new Map()
    // An implant's Essence as the buyer's body will take it (Système sensible, Biocompatibilité): the sheet's own
    // function, once per kind of implant
    // A cyberware bought under Adapsine is installed under it (Chrome Flesh p. 165)
    const bodyEffects = new Map()
    const underAdapsine = !!buyer && hasAdapsine(buyer.items)
    const essenceFor = (entry, essence, grade) => {
      // A Tatouage de mana gris costs the Essence of its data, whatever grade or body (Better Than Bad p. 141)
      if (entry.type === 'itemAugmentation' && entry.system?.reversibleEssence === true && typeof essence === 'number') {
        return SR5ShopGrades.essence(entry.system, 'standard')
      }
      if (!buyer || entry.type !== 'itemAugmentation' || typeof essence !== 'number') return essence
      const kind = entry.system?.type
      if (!bodyEffects.has(kind)) bodyEffects.set(kind, implantEssenceEffects(buyer.items, kind, {
        underAdapsine
      }))
      return implantEssence(essence, bodyEffects.get(kind), SR5ShopGrades.row(grade ?? entry.system?.grade).essence)
    }
    const rows = entries.map(entry => {
      const kind = `${entry.type}|${entry.system?.type ?? ''}`
      if (!offeredByKind.has(kind)) offeredByKind.set(kind, SR5Shop.gradesFor(entry.type, entry.system, {
        equip
      }))
      // An implant on a vendor's counter is of the grade it is: the vendor has what it has
      const offered = entry.vendor && !entry.onOrder ? [] : offeredByKind.get(kind)
      const grade = this.#gradeOf(entry, offered)
      const described = SR5ShopWindow.#described(entry, grade)
      return {
        entry, offered, grade,
        name: entry.name,
        shelf: entry.shelf ?? SR5ShopCatalog.shelfOf(entry),
        sub: entry.sub ?? SR5ShopCatalog.subOf(entry),
        notForSale: SR5ShopStock.isNotForSale(entry),
        ...described,
        essence: essenceFor(entry, described.essence, grade),
      }
    })

    // The cart, priced from the catalogue: a line whose source is gone keeps its last price
    const byUuid = new Map(rows.map(r => [r.entry.uuid, r]))
    let cartTotal = 0
    let cartEssence = 0
    let cartDelay = 0
    let cartBlocked = false
    const cart = this._cart.map(line => {
      const row = byUuid.get(line.uuid)
      // No more than the counter holds
      if (row?.entry.stock && line.quantity > row.entry.stock) line.quantity = row.entry.stock
      const described = row ? SR5ShopWindow.#described(row.entry, line.grade) : null
      const unit = described?.price ?? line.unit ?? 0
      line.unit = unit
      const total = unit * line.quantity
      cartTotal += total
      if (described?.essence) cartEssence += essenceFor(row.entry, described.essence, line.grade) * line.quantity
      // An item on a vendor's counter is there: it adds no search time (SR5 p. 420)
      const onCounter = row?.entry.vendor && !row.entry.onOrder && !SR5ShopVendor.testInStock
      if (described?.availability && !onCounter) cartDelay = Math.max(cartDelay, SR5ShopAvailability.delayFor(total))
      // A line put in the cart before creation was switched on, or at another grade, is out of reach
      const blocked = described ? SR5ShopCatalog.creationBlock(described, limits) : null
      // ...and so is a grade the shop no longer offers (creation offers no betaware): the till
      // would sell the item at no grade, a price and an Essence the cart does not show
      const gradeGone = row && line.grade && !row.offered.includes(line.grade)
      if (blocked || gradeGone) cartBlocked = true
      return {
        ...line, key: SR5ShopWindow.#cartKey(line), totalLabel: SR5ShopWindow.#nuyen(total),
        blocked: !!(blocked || gradeGone),
        blockedLabel: blocked ? SR5ShopWindow.#creationMessage(blocked, line.name, limits) :
          gradeGone ? game.i18n.format('SR5.ShopGradeGone', {
            name: line.name
          }) : '',
      }
    })
    // No buyer yet: nothing is too dear, there is no purse to compare with
    const budget = free || !buyer ? Infinity : balance - cartTotal

    // Filters first, on the whole catalogue, then the page (lot A review: the
    // count no longer gives a hidden prototype away). The entries come sorted.
    const visible = SR5ShopCatalog.filter(rows, {
      prototypes: isGM,
    })
    const filtered = SR5ShopCatalog.filter(visible, {
      prototypes: true,
      shelf: this._shelf,
      sub: this._sub,
      search: this._search,
      maxPrice: this._maxPrice ?? undefined,
      maxAvailability: this._maxAvailability ?? undefined,
      legality: this._legality,
      affordable: this._affordable,
      budget,
      creation: limits,
    })
    const shown = filtered.slice(0, (this._page + 1) * this._pageSize)

    context.rows = shown.map(row => this.#rowContext(row, {
      buyer, budget, limits, pool, equip, free
    }))
    context.totalCount = filtered.length
    context.countLabel = game.i18n.format(filtered.length === 1 ? 'SR5.ShopCountOne' : 'SR5.ShopCount', {
      count: filtered.length
    })
    context.shownCount = shown.length
    context.hasMore = shown.length < filtered.length

    // Shelves and their counts, on what this user may see
    const counts = {
    }
    const subCounts = {
    }
    for (const row of visible) {
      counts[row.shelf] = (counts[row.shelf] || 0) + 1
      if (row.sub) subCounts[`${row.shelf}:${row.sub}`] = (subCounts[`${row.shelf}:${row.sub}`] || 0) + 1
    }
    context.allCount = visible.length
    context.allActive = !this._shelf
    context.shelves = SR5ShopCatalog.SHELVES.filter(shelf => counts[shelf.key]).map(shelf => ({
      key: shelf.key,
      label: game.i18n.localize(shelf.label),
      icon: shelf.icon,
      count: counts[shelf.key],
      active: this._shelf === shelf.key,
      subs: this._shelf === shelf.key && shelf.sub ?
        Object.entries(SR5[shelf.sub.options] ?? {
        })
          .filter(([key]) => subCounts[`${shelf.key}:${key}`])
          .map(([key, label]) => ({
            key, label: game.i18n.localize(label), count: subCounts[`${shelf.key}:${key}`], active: this._sub === key,
          })) :
        [],
    }))

    // Filters
    context.search = this._search
    context.maxPrice = this._maxPrice ?? ''
    context.maxAvailability = this._maxAvailability ?? ''
    context.affordable = this._affordable
    context.legality = [
      {
        key: '', label: game.i18n.localize('SR5.ShopLegal')
      },
      {
        key: 'R', label: game.i18n.localize('SR5.ShopRestricted')
      },
      {
        key: 'F', label: game.i18n.localize('SR5.ShopProhibited')
      },
    ].map(l => ({
      ...l, active: this._legality.includes(l.key)
    }))

    // Buyer and searcher
    context.buyers = buyers.map(a => ({
      id: a.id, name: a.name, selected: a.id === this._buyerId
    }))
    context.buyer = buyer ? {
      id: buyer.id, name: buyer.name, balance: SR5ShopWindow.#nuyen(balance),
    } : null
    context.balanceLabel = game.i18n.localize(stick ? 'SR5.ShopVendorOnStick' : 'SR5.ShopBalance')
    context.pool = pool
    const contacts = SR5ShopAvailability.getContacts(buyer)
    if (this._contactId && !contacts.some(c => c.id === this._contactId)) this._contactId = null
    context.contacts = contacts.map(c => ({
      id: c.id, name: c.name, connection: c.system.connection, selected: c.id === this._contactId,
    }))
    context.overridePool = this._overridePool ?? ''
    context.overrideLimit = this._overrideLimit ?? ''
    const {
      step, max
    } = SR5ShopAvailability.surchargeRules
    const ladder = [0]
    for (let i = 1; i <= (max || 12); i++) ladder.push(step * i)
    if (!ladder.includes(this._surcharge)) ladder.push(this._surcharge)
    context.surchargeChoices = ladder.sort((a, b) => a - b).map(value => ({
      value,
      label: value ? `+${value}% (+${SR5ShopAvailability.surchargeDice(value)})` : '—',
      selected: value === this._surcharge,
    }))

    // Cart and till
    context.cart = cart
    context.cartCount = cart.length
    context.cartTotal = SR5ShopWindow.#nuyen(cartTotal)
    context.cartAffordable = free || cartTotal <= balance
    context.cartBlocked = cartBlocked
    context.cartLeft = free ? null : SR5ShopWindow.#nuyen(balance - cartTotal)
    context.cartEssence = cartEssence ? (Math.round(cartEssence * 100) / 100).toLocaleString() : null
    context.cartDelay = cartDelay ? SR5ShopAvailability.formatDelay(cartDelay) : null
    context.canCheckout = buyer !== null && cart.length > 0
    context.creationMode = creationMode
    context.creationLimits = limits
    context.creationLimitsLabel = limits ? SR5ShopWindow.#limitsLabel(limits) : ''
    context.equipMode = equip
    context.free = free
    context.isGM = isGM
    return context
  }

  /** The shops this user may choose from: the world's shelves, then each vendor. */
  #sourcesContext() {
    const sources = []
    if (game.user.isGM || SR5ShopVendor.marketOpen) sources.push({
      key: 'world', label: game.i18n.localize('SR5.ShopSourceWorld'), selected: !this._source?.vendor,
    })
    for (const {
      actor, storage
    } of SR5ShopVendor.vendors()) {
      const key = `vendor:${actor.uuid}:${storage.id}`
      const closed = !shopSettings(storage).isOpen
      sources.push({
        key, selected: this._source?.key === key,
        label: `${SR5ShopVendor.labelOf(storage)}${closed ? ` (${game.i18n.localize('SR5.ShopVendorClosedShort')})` : ''}`,
      })
    }
    // The vendor shown may have closed, or be on another scene: it stays in the list
    if (this._source?.vendor && !sources.some(s => s.selected)) sources.push({
      key: this._source.key, label: this._source.label, selected: true
    })
    return sources
  }

  /** The vendor's header: banner 3:1, portrait, name; the templates of part 2 fill them. */
  #vendorContext(source) {
    const actor = source.actor
    const shop = source.shop
    return {
      label: source.label,
      name: actor?.name ?? '',
      portrait: shop.portrait || actor?.img || '',
      banner: shop.banner,
      accent: shop.accent,
      closed: !shop.isOpen,
      margin: shop.margin,
      marginLabel: shop.margin ? `${shop.margin > 0 ? '+' : ''}${shop.margin}%` : '',
    }
  }

  /** "Dispo ≤ 12, indice ≤ 6"; a limit of 0 is no limit and is left out. */
  static #limitsLabel(limits) {
    const parts = []
    if (limits.availability) parts.push(game.i18n.format('SR5.ShopLimitAvailability', limits))
    if (limits.rating) parts.push(game.i18n.format('SR5.ShopLimitRating', limits))
    return parts.join(', ') || game.i18n.localize('SR5.ShopLimitNone')
  }

  /** Why creation refuses an item, with the source of the limit (SR5 p. 420, p. 66, or the table's own). */
  static #creationMessage(blocked, name, limits) {
    return game.i18n.format(`SR5.WARN_ShopCreationLimit_${blocked}`, {
      name, ...limits, source: game.i18n.localize(`SR5.ShopCreationSource_${limits.source}`),
    })
  }

  /** What one row of the list shows. */
  #rowContext(row, {
    buyer, budget, limits, pool, equip, free
  }) {
    const entry = row.entry
    const summary = [entry.info]
    if (row.essence) summary.push(game.i18n.format('SR5.ShopEssenceShort', {
      value: row.essence.toLocaleString()
    }))
    const blocked = SR5ShopCatalog.creationBlock(row, limits)
    const forSale = !row.notForSale || equip
    // On a vendor's counter the item is there: no search, no test, unless the table wants one
    const onCounter = entry.vendor && !entry.onOrder
    const tested = !onCounter || SR5ShopVendor.testInStock
    const odds = pool === null || !tested ? null : SR5ShopCatalog.odds(pool, row.availability)
    return {
      stock: onCounter ? entry.stock : null,
      onOrder: !!entry.onOrder,
      tested,
      uuid: entry.uuid,
      img: entry.img,
      name: entry.name,
      summary: summary.filter(Boolean).join(' · '),
      // `5R`, `12P`; a letter with no rating is printed alone, a legal item with none is a dash
      availability: `${row.availability || ''}${row.legality ? game.i18n.localize(SR5.legalTypesShort[row.legality]) : ''}` || '—',
      legality: row.legality,
      common: !row.availability,
      odds,
      oddsLabel: odds ? game.i18n.format('SR5.ShopOdds', {
        pool, availability: row.availability
      }) : '',
      delay: row.availability && tested ?
        SR5ShopAvailability.formatDelay(SR5ShopAvailability.delayFor(row.price)) :
        game.i18n.localize('SR5.ShopDelayNow'),
      grades: row.offered.map(key => ({
        // A short name keeps the column narrow; the cart line spells it out
        key, label: game.i18n.localize(`SR5.ShopGradeShort_${key}`), selected: key === row.grade,
      })),
      price: SR5ShopWindow.#nuyen(row.price),
      tooExpensive: !free && row.price > budget,
      blocked: !!blocked,
      blockedLabel: blocked ? SR5ShopWindow.#creationMessage(blocked, entry.name, limits) : '',
      notForSale: row.notForSale,
      canBuy: buyer !== null && forSale && !blocked,
      // Without a buyer the list stays readable: only what cannot be sold at all is dimmed
      dim: !forSale || !!blocked,
    }
  }

  static #nuyen(value) {
    return `${Math.round(value).toLocaleString()}¥`
  }

  /** One cart line per item and grade. */
  static #cartKey(line) {
    return `${line.uuid}|${line.grade ?? ''}`
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _preRender(context, options) {
    await super._preRender(context, options)
    this._redrawing = true
  }

  // The frame stays across renders: one listener for the whole life of the window
  _onFirstRender(context, options) {
    super._onFirstRender(context, options)
    this.element.addEventListener('dragover', event => {
      if (game.user.isGM && this._source?.vendor) event.preventDefault()
    })
    this.element.addEventListener('drop', event => this.#onDropContact(event))
  }

  /** A contact the gamemaster drops on a vendor's shop becomes the one who searches for it. */
  async #onDropContact(event) {
    if (!game.user.isGM || !this._source?.vendor) return
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
    if (data?.type !== 'Item' || !data.uuid) return
    event.preventDefault()
    const contact = await fromUuid(data.uuid)
    if (contact?.type !== 'itemContact') return
    const {
      actor, storage
    } = this._source
    const own = await SR5ShopVendor.takeContact(actor, storage, contact)
    if (!own) return
    ui.notifications?.info(game.i18n.format('SR5.ShopVendorContactTaken', {
      contact: own.name, vendor: SR5ShopVendor.labelOf(storage)
    }))
  }

  _onRender(context, options) {
    super._onRender(context, options)
    const el = this.element
    // The till's menus get the system's dropdown; the grade menus of the rows stay native: a hundred
    // enhanced dropdowns were half the time of a redraw (second review, Kira: under 100 ms)
    el.querySelectorAll('.sr-shop-till, .sr-shop-filters').forEach(part => enhanceSelects(part))

    const rerender = () => {
      this._page = 0
      this.render()
    }
    // The search field is drawn anew with the list: it gets its focus and caret back. The
    // field being removed by the redraw blurs it too, so a blur only counts outside one.
    const search = el.querySelector('[data-shop-search]')
    if (search) {
      if (this._searchFocused) {
        const caret = Math.min(this._searchCaret ?? search.value.length, search.value.length)
        search.focus()
        search.setSelectionRange(caret, caret)
      }
      let debounce = null
      search.addEventListener('focus', () => {
        this._searchFocused = true
      })
      search.addEventListener('input', event => {
        this._searchCaret = event.target.selectionStart
        clearTimeout(debounce)
        debounce = setTimeout(() => {
          this._search = event.target.value
          this._searchCaret = event.target.selectionStart
          rerender()
        }, 300)
      })
      search.addEventListener('blur', () => {
        if (!this._redrawing) this._searchFocused = false
      })
    }
    this._redrawing = false
    // A vendor's banner gives the window its accent; the theme's comes back elsewhere
    if (context.vendor?.accent) el.style.setProperty('--sr-shop-accent', context.vendor.accent)
    else el.style.removeProperty('--sr-shop-accent')
    el.querySelector('[data-shop-source]')?.addEventListener('change', event => {
      const key = event.target.value
      if (key === 'world') this.setSource(new SR5ShopWorldSource())
      else {
        const found = SR5ShopVendor.vendors().find(({
          actor, storage
        }) => `vendor:${actor.uuid}:${storage.id}` === key)
        if (found) this.setSource(new SR5ShopVendorSource(found.actor, found.storage))
      }
      this.render()
    })
    el.querySelector('[data-shop-pay]')?.addEventListener('change', event => {
      this._payWith = event.target.value || ''
      this.render()
    })
    el.querySelectorAll('[data-shop-max]').forEach(input => input.addEventListener('change', event => {
      const value = SR5ShopAvailability.typedNumber(event.target.value)
      if (event.target.dataset.shopMax === 'price') this._maxPrice = value
      else this._maxAvailability = value
      rerender()
    }))
    el.querySelector('[data-shop-affordable]')?.addEventListener('change', event => {
      this._affordable = event.target.checked
      rerender()
    })
    el.querySelector('[data-shop-buyer]')?.addEventListener('change', event => {
      this._buyerId = event.target.value || null
      this.render()
    })
    el.querySelector('[data-shop-contact]')?.addEventListener('change', event => {
      this._contactId = event.target.value || null
      this.render()
    })
    el.querySelector('[data-shop-surcharge]')?.addEventListener('change', event => {
      this._surcharge = Number(event.target.value) || 0
      this.render()
    })
    el.querySelectorAll('[data-shop-override]').forEach(input => input.addEventListener('change', event => {
      const value = SR5ShopAvailability.typedNumber(event.target.value)
      if (event.target.dataset.shopOverride === 'limit') this._overrideLimit = value
      else this._overridePool = value
      this.render()
    }))
    el.querySelector('[data-shop-creation]')?.addEventListener('change', async event => {
      if (!game.user.isGM) return
      await game.settings.set('sr5', 'sr5ShopCreationMode', event.target.checked)
      this.render()
    })
    el.querySelector('[data-shop-equip]')?.addEventListener('change', event => {
      this._equipMode = game.user.isGM && event.target.checked
      this._buyerId = null
      rerender()
    })
    el.querySelectorAll('[data-shop-grade]').forEach(select => select.addEventListener('change', event => {
      const uuid = event.target.closest('[data-uuid]')?.dataset.uuid
      if (uuid) this._grades[uuid] = event.target.value
      this.render()
    }))
    el.querySelectorAll('[data-cart-qty]').forEach(input => input.addEventListener('change', event => {
      const key = event.target.closest('[data-cart-key]')?.dataset.cartKey
      const line = this._cart.find(l => SR5ShopWindow.#cartKey(l) === key)
      if (!line) return
      line.quantity = Math.max(1, Math.floor(Number(event.target.value) || 1))
      this.render()
    }))
    el.querySelectorAll('.sr-shop-row[draggable]').forEach(row => row.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'Item', uuid: event.currentTarget.dataset.uuid
      }))
    }))
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSetShelf(event, target) {
    const shelf = target.dataset.shelf ?? ''
    const sub = target.dataset.sub ?? ''
    // A click on the open shelf closes its sub-shelf
    this._sub = shelf === this._shelf && !target.dataset.sub ? '' : sub
    this._shelf = shelf
    this._page = 0
    this.render()
  }

  static #onToggleLegality(event, target) {
    const key = target.dataset.legality ?? ''
    this._legality = this._legality.includes(key) ? this._legality.filter(k => k !== key) : [...this._legality, key]
    this._page = 0
    this.render()
  }

  static #onClearFilters() {
    this._search = ''
    this._maxPrice = null
    this._maxAvailability = null
    this._legality = ['', 'R', 'F']
    this._affordable = false
    this._shelf = ''
    this._sub = ''
    this._page = 0
    this.render()
  }

  static #onRefresh() {
    if (!this._source?.vendor || this._source.shop.onOrder) SR5ShopWorldSource.reset()
    this._page = 0
    this.render()
  }

  static #onLoadMore() {
    this._page++
    this.render()
  }

  static async #onViewItem(event, target) {
    // The row opens its item, but not when the click was meant for one of its fields. Stopping
    // the click in the cell instead would also stop the actions of its buttons, which the
    // window catches as it bubbles up.
    if (event.target.closest('input, select, label, .sr-dropdown, .sr-shop-row-buy')) return
    const uuid = target.closest('[data-uuid]')?.dataset.uuid
    const doc = uuid ? await fromUuid(uuid) : null
    doc?.sheet.render(true)
  }

  static #rowQuantity(row) {
    return Math.max(1, Math.floor(Number(row?.querySelector('[data-row-qty]')?.value) || 1))
  }

  static #onAddToCart(event, target) {
    event.stopPropagation()
    const row = target.closest('[data-uuid]')
    const uuid = row?.dataset.uuid
    if (!uuid) return
    const quantity = SR5ShopWindow.#rowQuantity(row)
    const grade = row.querySelector('[data-shop-grade]')?.value || null
    const existing = this._cart.find(line => line.uuid === uuid && line.grade === grade)
    if (existing) existing.quantity += quantity
    else {
      this._cart.push({
        uuid, grade, quantity,
        name: SR5Shop.gradedName(row.dataset.name ?? uuid, grade),
        img: row.querySelector('img')?.getAttribute('src') ?? '',
      })
    }
    this.render()
  }

  static #onRemoveFromCart(event, target) {
    const key = target.closest('[data-cart-key]')?.dataset.cartKey
    this._cart = this._cart.filter(line => SR5ShopWindow.#cartKey(line) !== key)
    this.render()
  }

  static #onClearCart() {
    this._cart = []
    this.render()
  }

  static async #onCheckoutCart() {
    if (this._source?.vendor) {
      const sent = await SR5ShopVendor.purchase({
        vendorUuid: this._source.actorUuid,
        storageId: this._source.storageId,
        buyerId: this._buyerId,
        payWith: this._payWith,
        equip: this._equipMode,
        lines: this._cart.map(line => ({
          uuid: line.uuid, quantity: line.quantity, name: line.name, grade: line.grade,
        })),
      })
      if (sent) this._cart = []
      this.render()
      return
    }
    const bought = await SR5Shop.checkout(game.actors.get(this._buyerId), this._cart.map(line => ({
      uuid: line.uuid, quantity: line.quantity, name: line.name, grade: line.grade,
    })), {
      equip: this._equipMode
    })
    if (bought) this._cart = []
    this.render()
  }

  #searchingContact() {
    const buyer = game.actors.get(this._buyerId)
    return this._contactId ? buyer?.items.get(this._contactId) ?? null : null
  }

  #overrides() {
    const source = this._source?.vendor ? this._source : null
    return {
      overridePool: this._overridePool, overrideLimit: this._overrideLimit,
      // At a vendor's, the vendor searches and its margin is on the price (lot C)
      ...(source ? {
        searcher: source.actor, margin: source.shop.margin,
        // The pool #searchPool announces is the one rolled (searcherOf: contact, the shop's pool, else the sheet)
        searcherContact: SR5ShopVendor.searcherOf(source.actor, source.storage).contact,
        searcherPool: SR5ShopVendor.searcherOf(source.actor, source.storage).pool,
        vendor: {
          uuid: source.actorUuid, storageId: source.storageId
        },
      } : {
      }),
    }
  }

  static async #onTestAvailability(event, target) {
    event.stopPropagation()
    const row = target.closest('[data-uuid]')
    if (!row) return
    await SR5ShopAvailability.testLines(game.actors.get(this._buyerId), this._source?.vendor ? null : this.#searchingContact(), [{
      uuid: row.dataset.uuid,
      grade: row.querySelector('[data-shop-grade]')?.value || null,
      quantity: SR5ShopWindow.#rowQuantity(row),
      name: row.dataset.name,
    }], this._surcharge, this.#overrides())
  }

  static async #onTestCartAvailability() {
    if (!this._cart.length) return
    await SR5ShopAvailability.testLines(game.actors.get(this._buyerId), this._source?.vendor ? null : this.#searchingContact(), this._cart.map(line => ({
      uuid: line.uuid, quantity: line.quantity, name: line.name, grade: line.grade,
    })), this._surcharge, this.#overrides())
  }

  /** The gamemaster creates a vendor from a template, then the window shows its shop (lot C, part 2). */
  static async #onNewVendor() {
    const created = await SR5ShopVendor.newVendorDialog()
    if (!created) return
    this.setSource(new SR5ShopVendorSource(created.actor, created.storage))
    this.render()
  }

  static #onOpenSell() {
    // At a vendor's, the vendor buys (lot C, part 2); elsewhere, a contact or the open market
    const source = this._source?.vendor ? this._source : null
    SR5SellDialog.open(game.actors.get(this._buyerId), {
      vendor: source ? {
        uuid: source.actorUuid, storageId: source.storageId
      } : null
    })
  }

  /* -------------------------------------------- */
  /*  Ways in                                     */
  /* -------------------------------------------- */

  /**
   * `renderSidebar`: a cart button in the tab strip, just above Settings. It
   * opens the window rather than a tab; `sr5KeepSidebarSettingsLast` keeps
   * Settings and the caret below it.
   */
  static onRenderSidebar(sidebar) {
    const menu = sidebar?.element?.querySelector('#sidebar-tabs > menu')
    if (!menu || menu.querySelector('[data-sr5-shop]')) return
    const settings = [...menu.children].find(li => li.querySelector('[data-tab="settings"]'))
    const li = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ui-control plain icon fa-solid fa-cart-shopping'
    button.dataset.sr5Shop = ''
    button.dataset.tooltip = game.i18n.localize('SR5.ShopWindow')
    button.setAttribute('aria-label', game.i18n.localize('SR5.ShopWindow'))
    button.addEventListener('click', () => SR5ShopWindow.open())
    li.append(button)
    if (settings) settings.before(li)
    else menu.append(li)
  }

  /** A prototype flag switched on a sheet: the index entry follows, and an open shop redraws. */
  static async onFlagChanged(document) {
    const entry = (await SR5ShopWorldSource._index)?.find(e => e.uuid === document.uuid)
    if (entry) foundry.utils.setProperty(entry, 'flags.sr5.notForSale', document.getFlag('sr5', 'notForSale') === true)
    const shop = SR5ShopWindow._instance
    if (shop?.rendered) shop.render()
  }
}
