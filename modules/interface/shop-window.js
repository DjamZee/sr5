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

/**
 * Where the shop's goods come from: the world's shelves, the compendiums the
 * gamemaster ticked. The window only ever asks a source for its entries, so
 * the gamemaster's shop (lot C) plugs a dealer in as one more source — its
 * own stock, its margin — without the window changing.
 */
export class SR5ShopWorldSource {

  key = 'world'

  /** Index of every item compendium, shared by every window of this client. */
  static _index = null

  get label() {
    return game.i18n.localize('SR5.ShopSourceWorld')
  }

  /** Forget the index: the next window reads the compendiums again. */
  static reset() {
    SR5ShopWorldSource._index = null
  }

  static index() {
    // One reading at a time: two windows opening together share it
    SR5ShopWorldSource._index ??= SR5ShopWorldSource.#read()
    return SR5ShopWorldSource._index
  }

  static async #read() {
    const entries = []
    await Promise.all(game.packs.filter(p => p.documentName === 'Item').map(async pack => {
      try {
        const index = await pack.getIndex({
          fields: SR5ShopCatalog.INDEX_FIELDS
        })
        for (const entry of index) {
          if (!SR5ShopStock.isSellableType(entry.type)) continue
          entries.push({
            ...entry,
            docName: 'Item',
            uuid: `Compendium.${pack.collection}.Item.${entry._id}`,
            packId: pack.collection,
          })
        }
      } catch (err) {
        console.warn(`SR5 Shop: failed to index pack ${pack.collection}`, err)
      }
    }))
    await SR5ShopWorldSource.prepare(entries)
    return entries
  }

  /**
   * An index holds the stored fields only: `price.value` is still 0 there, the
   * system derives it when an item is prepared (rating, capacity, vehicle
   * multipliers, grade). Each entry is prepared by the system's own item class,
   * so the shop shows the price the buyer will be charged. Measured on the
   * Megapack 2.0.10 (4 900 sellable items): 0.9 s once per session, in slices
   * so the screen does not freeze.
   */
  static async prepare(entries) {
    const Item = CONFIG.Item.documentClass
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      try {
        const item = new Item({
          name: entry.name, type: entry.type, system: foundry.utils.deepClone(entry.system ?? {
          }),
        })
        entry.system = item.system
      } catch (err) {
        // Left as stored: the row reads the base values
        console.debug(`SR5 Shop: ${entry.name} could not be prepared`, err)
      }
      if (i % 500 === 499) await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  /**
   * The entries on offer. A prototype stays in the list for the gamemaster,
   * marked and not for sale; the window drops it for a player before
   * counting anything. An item at 0¥ — templates, critter weapons, notes — is
   * not goods and stays off the counter; Equip mode still places it.
   */
  async entries({
    equip = false
  } = {
  }) {
    const index = await SR5ShopWorldSource.index()
    return index.filter(entry => {
      if (!equip && !(SR5ShopCatalog.describe(entry).price > 0)) return false
      return SR5ShopStock.canSell(entry, {
        equip
      }) || (game.user.isGM && SR5ShopStock.isNotForSale(entry) && SR5ShopStock.canSell({
        ...entry, flags: {
        }
      }))
    })
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
    actor = null
  } = {
  }) {
    let shop = SR5ShopWindow._instance
    if (!shop?.rendered) {
      shop = new SR5ShopWindow()
      SR5ShopWindow._instance = shop
    }
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
    this._source = options.source ?? new SR5ShopWorldSource()
    this._shelf = ''
    this._sub = ''
    this._search = ''
    this._maxPrice = null
    this._maxAvailability = null
    this._legality = ['', 'R', 'F']
    this._affordable = false
    this._page = 0
    this._pageSize = 100
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

  get title() {
    const source = this._source?.label
    return source ? `${game.i18n.localize('SR5.ShopWindow')} — ${source}` : game.i18n.localize('SR5.ShopWindow')
  }

  /* -------------------------------------------- */
  /*  Data                                        */
  /* -------------------------------------------- */

  /**
   * The full documents of the entries about to be shown, for their summary
   * line (damage, armour…). The filters never need them: the index carries
   * every field they read.
   */
  async _ensureDetails(entries) {
    const missing = entries.filter(e => !e._detailed)
    if (!missing.length) return
    const byPack = new Map()
    for (const entry of missing) {
      if (!byPack.has(entry.packId)) byPack.set(entry.packId, [])
      byPack.get(entry.packId).push(entry)
    }
    await Promise.all([...byPack].map(async ([packId, list]) => {
      const pack = game.packs.get(packId)
      try {
        const documents = pack ? await pack.getDocuments({
          _id__in: list.map(e => e._id)
        }) : []
        const byId = new Map(documents.map(d => [d.id, d]))
        for (const entry of list) {
          const document = byId.get(entry._id)
          if (document) entry.details = document.system
          entry._detailed = true
        }
      } catch (err) {
        console.warn(`SR5 Shop: failed to load details from ${packId}`, err)
        for (const entry of list) entry._detailed = true
      }
    }))
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
    const contact = this._contactId ? buyer.items.get(this._contactId) : null
    const searcher = contact ? SR5ShopAvailability.contactPool(contact) : SR5ShopAvailability.buyerPool(buyer)
    const base = this._overridePool ?? (searcher.raw ?? searcher.pool)
    return Math.max(0, base + SR5ShopAvailability.surchargeDice(this._surcharge))
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
    const balance = buyer ? SR5Shop.balance(buyer) : 0
    const creationMode = SR5Shop.creationMode
    const free = creationMode || equip
    const limits = creationMode && !equip ? SR5Shop.creationLimits : null
    const pool = this.#searchPool(buyer)

    // Every row of the catalogue, described at the grade it shows
    const entries = await this._source.entries({
      equip
    })
    const rows = entries.map(entry => {
      const offered = SR5Shop.gradesFor(entry.type, entry.system, {
        equip
      })
      const grade = this.#gradeOf(entry, offered)
      return {
        entry, offered, grade,
        name: entry.name,
        shelf: SR5ShopCatalog.shelfOf(entry),
        sub: SR5ShopCatalog.subOf(entry),
        notForSale: SR5ShopStock.isNotForSale(entry),
        ...SR5ShopCatalog.describe(entry, grade),
      }
    })

    // The cart, priced from the catalogue: a line whose source is gone keeps its last price
    const byUuid = new Map(rows.map(r => [r.entry.uuid, r]))
    let cartTotal = 0
    let cartEssence = 0
    let cartDelay = 0
    const cart = this._cart.map(line => {
      const row = byUuid.get(line.uuid)
      const described = row ? SR5ShopCatalog.describe(row.entry, line.grade) : null
      const unit = described?.price ?? line.unit ?? 0
      line.unit = unit
      const total = unit * line.quantity
      cartTotal += total
      if (described?.essence) cartEssence += described.essence * line.quantity
      if (described?.availability) cartDelay = Math.max(cartDelay, SR5ShopAvailability.delayFor(total))
      return {
        ...line, key: SR5ShopWindow.#cartKey(line), totalLabel: SR5ShopWindow.#nuyen(total),
      }
    })
    // No buyer yet: nothing is too dear, there is no purse to compare with
    const budget = free || !buyer ? Infinity : balance - cartTotal

    // Filters first, on the whole catalogue, then the page (lot A review: the
    // count no longer gives a hidden prototype away)
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
    }).sort((a, b) => a.name.localeCompare(b.name))
    const shown = filtered.slice(0, (this._page + 1) * this._pageSize)
    await this._ensureDetails(shown.map(r => r.entry))

    const lists = SR5_EntityHelpers.sortTranslations(SR5)
    context.rows = shown.map(row => this.#rowContext(row, {
      buyer, budget, limits, pool, equip, free, lists
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
    context.cartLeft = free ? null : SR5ShopWindow.#nuyen(balance - cartTotal)
    context.cartEssence = cartEssence ? (Math.round(cartEssence * 100) / 100).toLocaleString() : null
    context.cartDelay = cartDelay ? SR5ShopAvailability.formatDelay(cartDelay) : null
    context.canCheckout = buyer !== null && cart.length > 0
    context.creationMode = creationMode
    context.creationLimits = limits
    context.equipMode = equip
    context.free = free
    context.isGM = isGM
    return context
  }

  /** What one row of the list shows. */
  #rowContext(row, {
    buyer, budget, limits, pool, equip, free, lists
  }) {
    const entry = row.entry
    // The summary reads the full document; its price and grade are left out, the row has its own
    const details = {
      ...(entry.details ?? entry.system), price: undefined, grade: undefined,
    }
    const summary = [getEntryInfo({
      ...entry, system: details
    }, lists)]
    if (row.essence) summary.push(game.i18n.format('SR5.ShopEssenceShort', {
      value: row.essence.toLocaleString()
    }))
    const blocked = SR5ShopCatalog.creationBlock(row, limits)
    const forSale = !row.notForSale || equip
    const odds = pool === null ? null : SR5ShopCatalog.odds(pool, row.availability)
    return {
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
      delay: row.availability ?
        SR5ShopAvailability.formatDelay(SR5ShopAvailability.delayFor(row.price)) :
        game.i18n.localize('SR5.ShopDelayNow'),
      grades: row.offered.map(key => ({
        // A short name keeps the column narrow; the cart line spells it out
        key, label: game.i18n.localize(`SR5.ShopGradeShort_${key}`), selected: key === row.grade,
      })),
      price: SR5ShopWindow.#nuyen(row.price),
      tooExpensive: !free && row.price > budget,
      blocked: !!blocked,
      blockedLabel: blocked ? game.i18n.format(`SR5.WARN_ShopCreationLimit_${blocked}`, {
        name: entry.name, ...limits
      }) : '',
      notForSale: row.notForSale,
      canBuy: buyer !== null && forSale && !blocked,
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

  _onRender(context, options) {
    super._onRender(context, options)
    const el = this.element
    enhanceSelects(el)

    const rerender = () => {
      this._page = 0
      this.render()
    }
    const search = el.querySelector('[data-shop-search]')
    if (search) {
      if (this._searchFocused) {
        search.focus()
        search.setSelectionRange(search.value.length, search.value.length)
      }
      let debounce = null
      search.addEventListener('input', event => {
        clearTimeout(debounce)
        debounce = setTimeout(() => {
          this._search = event.target.value
          this._searchFocused = true
          rerender()
        }, 300)
      })
      search.addEventListener('blur', () => {
        this._searchFocused = false
      })
    }
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
    SR5ShopWorldSource.reset()
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
    return {
      overridePool: this._overridePool, overrideLimit: this._overrideLimit
    }
  }

  static async #onTestAvailability(event, target) {
    event.stopPropagation()
    const row = target.closest('[data-uuid]')
    if (!row) return
    await SR5ShopAvailability.testLines(game.actors.get(this._buyerId), this.#searchingContact(), [{
      uuid: row.dataset.uuid,
      grade: row.querySelector('[data-shop-grade]')?.value || null,
      quantity: SR5ShopWindow.#rowQuantity(row),
      name: row.dataset.name,
    }], this._surcharge, this.#overrides())
  }

  static async #onTestCartAvailability() {
    if (!this._cart.length) return
    await SR5ShopAvailability.testLines(game.actors.get(this._buyerId), this.#searchingContact(), this._cart.map(line => ({
      uuid: line.uuid, quantity: line.quantity, name: line.name, grade: line.grade,
    })), this._surcharge, this.#overrides())
  }

  static #onOpenSell() {
    SR5SellDialog.open(game.actors.get(this._buyerId))
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
