import {
  SR5
} from '../config.js'
import {
  SR5_EntityHelpers
} from '../entities/helpers.js'
import {
  SR5_SystemHelpers
} from '../system/utilitySystem.js'
import {
  getEntryInfo
} from './compendium-browser-filters.js'
import {
  SR5Shop
} from './shop.js'
import {
  SR5ShopStock
} from './shop-stock.js'
import {
  SR5ShopCatalog
} from './shop-catalog.js'
import {
  SR5Credstick
} from './credstick.js'
import {
  SR5ShopAvailability
} from './shop-availability.js'
import {
  SR5ShopFence
} from './shop-fence.js'
import {
  VENDOR_TEMPLATES, VENDOR_FAMILIES, vendorTemplate, templateBanners, templateShop
} from './shop-vendor-templates.js'
import {
  isStoredAway
} from './storage-rules.js'
import {
  isShopStorage, shopSettings, stockOf, piecesOf, fitsRestock, restockPicks, splitTakings,
  checkStockLines
} from './shop-vendor-rules.js'

/**
 * The gamemaster's vendor (shop lot C, part 1).
 *
 * A vendor is an actor — a Grunt, as decided with DjamZ — carrying an
 * itemStorage of type "shop". What is stored in it is the stock: real items,
 * sold once, which a lock protects like any other container. Its till is one
 * of the vendor's credsticks: the money of a sale really goes in.
 *
 * A player never writes on the vendor: the purchase is a request to the
 * gamemaster's browser, which trusts only the sender the server stamps and
 * the ids, and works everything else out again — stock, price, balance.
 */
export class SR5ShopVendor {

  /** The world setting: may players use the world's shelves, outside any vendor? */
  static get marketOpen() {
    try {
      return game.settings.get('sr5', 'sr5ShopMarketOpen') !== false
    } catch {
      return true
    }
  }

  /** The world setting: does an item on a vendor's counter still need an availability test? */
  static get testInStock() {
    try {
      return game.settings.get('sr5', 'sr5ShopVendorTest') === true
    } catch {
      return false
    }
  }

  /** The shop storages an actor carries. */
  static shopsOf(actor) {
    return actor?.items?.filter(isShopStorage) ?? []
  }

  /** The vendor's name over the counter. */
  static labelOf(storage) {
    return shopSettings(storage).label || storage?.name || ''
  }

  /**
   * Every vendor this user may enter: the world's actors and, for an unlinked
   * Grunt, the tokens of the scene being viewed. A player sees the open shops,
   * the gamemaster all of them.
   */
  static vendors() {
    const isGM = game.user.isGM
    const found = []
    const seen = new Set()
    const add = actor => {
      if (!actor || seen.has(actor.uuid)) return
      seen.add(actor.uuid)
      for (const storage of SR5ShopVendor.shopsOf(actor)) {
        if (isGM || shopSettings(storage).isOpen) found.push({
          actor, storage
        })
      }
    }
    // An unlinked Grunt is a shop per token: it is listed through the tokens of the scene, not twice
    for (const actor of game.actors ?? []) if (actor.prototypeToken?.actorLink !== false) add(actor)
    for (const token of canvas?.scene?.tokens ?? []) if (!token.actorLink) add(token.actor)
    return found
  }

  /** The vendor and its storage, from what a request carries. */
  static resolve(actorUuid, storageId) {
    // A vendor gone (token deleted, scene removed) throws on some uuids: refused, not crashed
    let actor = null
    try {
      actor = typeof actorUuid === 'string' && actorUuid ? fromUuidSync(actorUuid) : null
    } catch {
      return null
    }
    const storage = actor?.items?.get(storageId)
    if (!actor || !isShopStorage(storage)) return null
    return {
      actor, storage
    }
  }

  /** The cashbox: a credstick of the vendor, the one the gamemaster chose. */
  static cashboxOf(actor, storage) {
    const item = actor?.items?.get(shopSettings(storage).cashboxId)
    return SR5Credstick.is(item) ? item : null
  }

  /** What the gamemaster's sheet shows of the shop: stock count, cashbox, takings. */
  static sheetContext(item) {
    const actor = item.parent
    const shop = shopSettings(item)
    const cashbox = SR5ShopVendor.cashboxOf(actor, item)
    return {
      shelves: SR5ShopCatalog.SHELVES.map(shelf => ({
        key: shelf.key, label: game.i18n.localize(shelf.label), checked: shop.shelves.includes(shelf.key),
      })),
      legality: [['legal', 'SR5.ShopLegal'], ['R', 'SR5.ShopRestricted'], ['F', 'SR5.ShopProhibited']].map(([key, label]) => ({
        key, label: game.i18n.localize(label), checked: shop.legality.includes(key),
      })),
      credsticks: actor ? actor.items.filter(i => SR5Credstick.is(i)).map(i => ({
        id: i.id, name: i.name, selected: i.id === shop.cashboxId,
      })) : [],
      contacts: actor ? actor.items.filter(i => i.type === 'itemContact').map(i => ({
        id: i.id, name: i.name, selected: i.id === shop.contactId,
      })) : [],
      templateLabel: shop.template ? game.i18n.localize(`SR5.ShopTemplate_${shop.template}`) : '',
      cashbox: cashbox ? {
        name: cashbox.name, funds: SR5Credstick.funds(cashbox).toLocaleString(),
      } : null,
      stockCount: actor ? stockOf(actor.items, item.id).length : 0,
      hasActor: !!actor,
      isGM: game.user.isGM,
    }
  }

  /* -------------------------------------------- */
  /*  The gamemaster's tools                      */
  /* -------------------------------------------- */

  /**
   * Fill the counter from the world's shelves: per ticked shelf, up to the
   * number of items set, under the shop's availability ceiling and legality;
   * the stacks already there are brought back up to their quantity. A
   * prototype never comes in this way — the gamemaster places it by hand.
   */
  static async restock(actor, storage) {
    if (!game.user.isGM || !actor || !isShopStorage(storage)) return 0
    const shop = shopSettings(storage)
    if (!shop.shelves.length) {
      ui.notifications.warn(game.i18n.localize('SR5.WARN_ShopVendorNoShelf'))
      return 0
    }
    const {
      SR5ShopWorldSource
    } = await import('./shop-window.js')
    const index = await SR5ShopWorldSource.index()
    const excluded = SR5ShopStock.excludedPacks
    const candidates = index.filter(entry => SR5ShopStock.canSell(entry, {
      excluded
    }) && fitsRestock(SR5ShopCatalog.describe(entry), entry.shelf, shop))
    const stock = stockOf(actor.items, storage.id).map(item => ({
      item,
      shelf: SR5ShopCatalog.shelfOf(item),
      sourceUuid: item.flags?.sr5?.shopSource ?? item._stats?.compendiumSource ?? null,
    }))
    const picks = restockPicks(candidates, stock, shop)

    const payload = []
    for (const entry of picks) {
      const source = await fromUuid(entry.uuid)
      if (!source) continue
      payload.push(SR5ShopVendor.stockPayload(source, storage.id, shop.stackQuantity, entry.uuid))
    }
    // The stacks already on the counter come back up to the quantity set, never down
    const topUps = stock
      .filter(({
        item
      }) => item.system?.quantity !== undefined && SR5Shop.STACKABLE_TYPES.includes(item.type) &&
        piecesOf(item) < shop.stackQuantity)
      .map(({
        item
      }) => ({
        _id: item.id, 'system.quantity': shop.stackQuantity
      }))
    if (payload.length) await actor.createEmbeddedDocuments('Item', payload)
    if (topUps.length) await actor.updateEmbeddedDocuments('Item', topUps)
    ui.notifications.info(game.i18n.format('SR5.ShopVendorRestocked', {
      name: SR5ShopVendor.labelOf(storage), count: payload.length, stacks: topUps.length,
    }))
    SR5_SystemHelpers.srLog(3, `Shop vendor: ${actor.name} restocked ${payload.length} items, ${topUps.length} stacks`)
    return payload.length
  }

  /** An item made ready for the counter: stored in the shop, not worn, in a stack of the size set. */
  static stockPayload(source, storageId, stackQuantity, sourceUuid) {
    const data = source.toObject()
    delete data._id
    data.system.storedIn = storageId
    if (data.system.isActive !== undefined) data.system.isActive = false
    if (data.system.quantity !== undefined && SR5Shop.STACKABLE_TYPES.includes(data.type)) data.system.quantity = stackQuantity
    foundry.utils.setProperty(data, 'flags.sr5.shopSource', sourceUuid)
    return data
  }

  /** Empty the counter, by the ids of what sits in this storage and nothing else. */
  static async clearStock(actor, storage) {
    if (!game.user.isGM || !actor || !isShopStorage(storage)) return 0
    const ids = stockOf(actor.items, storage.id).map(item => item.id)
    if (!ids.length) return 0
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize('SR5.ShopVendorClear')
      },
      content: `<p>${game.i18n.format('SR5.ShopVendorClearConfirm', {
        name: SR5ShopVendor.labelOf(storage), count: ids.length
      })}</p>`,
      rejectClose: false,
    })
    if (!confirmed) return 0
    await actor.deleteEmbeddedDocuments('Item', ids)
    return ids.length
  }

  /** Give the vendor a cashbox: a credstick without ceiling, chosen at once. */
  static async createCashbox(actor, storage) {
    if (!game.user.isGM || !actor || !isShopStorage(storage)) return null
    const [stick] = await actor.createEmbeddedDocuments('Item', [{
      name: game.i18n.localize('SR5.ShopVendorCashboxName'),
      type: 'itemGear',
      img: 'systems/sr5/assets/img/items/itemNuyen.svg',
      system: {
        isCredstick: true, funds: {
          value: 0, max: 0
        }
      },
    }])
    if (stick) await storage.update({
      'system.shop.cashboxId': stick.id
    })
    return stick
  }

  /**
   * Who searches what the vendor has not got (SR5 p. 420): the contact chosen on the shop, with its
   * own pool (Run Faster p. 174), else the vendor's sheet.
   */
  static searcherOf(actor, storage) {
    const contact = actor?.items?.get(shopSettings(storage).contactId)
    return contact?.type === 'itemContact' ? {
      contact, pool: SR5ShopAvailability.contactPool(contact)
    } : {
      contact: null, pool: actor ? SR5ShopAvailability.buyerPool(actor) : null
    }
  }

  /* -------------------------------------------- */
  /*  Templates (lot C, part 2)                   */
  /* -------------------------------------------- */

  /** The banner folder set by the gamemaster; empty, none. */
  static get bannerFolder() {
    try {
      return String(game.settings.get('sr5', 'sr5ShopBannerFolder') ?? '').trim()
    } catch {
      return ''
    }
  }

  /** The files of the banner folder, read once a session. */
  static async bannerFiles() {
    const folder = SR5ShopVendor.bannerFolder
    if (!folder) return []
    SR5ShopVendor._bannerCache ??= new Map()
    if (!SR5ShopVendor._bannerCache.has(folder)) {
      const picker = foundry.applications.apps.FilePicker.implementation
      const read = picker.browse('data', folder).then(result => result.files ?? []).catch(err => {
        console.warn(`SR5 Shop: banner folder ${folder} could not be read`, err)
        return []
      })
      SR5ShopVendor._bannerCache.set(folder, read)
    }
    return SR5ShopVendor._bannerCache.get(folder)
  }

  /**
   * Create a vendor from a template: the Grunt, its shop set as the template says, its cashbox,
   * and a first restock. Everything stays editable on the sheet afterwards.
   */
  static async createFromTemplate({
    templateKey, name, banner = '', linked = true, restock = true
  }) {
    if (!game.user.isGM) return null
    const template = vendorTemplate(templateKey)
    if (!template) return null
    const label = name || game.i18n.localize(`SR5.ShopTemplate_${template.key}`)
    const actor = await Actor.implementation.create({
      name: label, type: 'actorGrunt', prototypeToken: {
        actorLink: linked, name: label
      },
    })
    const [storage] = await actor.createEmbeddedDocuments('Item', [{
      name: label, type: 'itemStorage', system: {
        type: 'shop', shop: templateShop(template, {
          label, banner
        })
      },
    }])
    await SR5ShopVendor.createCashbox(actor, storage)
    if (restock) await SR5ShopVendor.restock(actor, actor.items.get(storage.id))
    return {
      actor, storage: actor.items.get(storage.id)
    }
  }

  /** The gamemaster's "New vendor" dialog: template, name, banner, linked or not. */
  static async newVendorDialog() {
    if (!game.user.isGM) return null
    const files = await SR5ShopVendor.bannerFiles()
    const families = VENDOR_FAMILIES.map(family => ({
      label: game.i18n.localize(`SR5.ShopVendorFamily_${family}`),
      templates: VENDOR_TEMPLATES.filter(t => t.family === family).map(t => ({
        key: t.key, label: game.i18n.localize(`SR5.ShopTemplate_${t.key}`),
      })),
    }))
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/sr5/templates/interface/shop-new-vendor.hbs', {
        families, hasFolder: !!SR5ShopVendor.bannerFolder,
      })
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('SR5.ShopVendorNew'), icon: 'fas fa-store'
      },
      position: {
        width: 640
      },
      content,
      rejectClose: false,
      render: (_event, dialog) => {
        const el = dialog.element
        const select = el.querySelector('[name=template]')
        const strip = el.querySelector('[data-banners]')
        const draw = () => {
          const banners = templateBanners(vendorTemplate(select.value), files)
          strip.replaceChildren(...banners.map((file, index) => {
            const label = document.createElement('label')
            label.className = 'sr-shop-banner-choice'
            const radio = document.createElement('input')
            radio.type = 'radio'
            radio.name = 'banner'
            radio.value = file
            radio.checked = index === 0
            const img = document.createElement('img')
            img.src = file
            img.alt = ''
            label.append(radio, img)
            return label
          }))
          if (!banners.length) {
            const p = document.createElement('p')
            p.className = 'hint'
            p.textContent = game.i18n.localize(SR5ShopVendor.bannerFolder ? 'SR5.ShopVendorNoBanner' : 'SR5.ShopVendorNoBannerFolder')
            strip.append(p)
          }
        }
        select.addEventListener('change', draw)
        draw()
      },
      buttons: [{
        action: 'create', label: game.i18n.localize('SR5.ShopVendorCreate'), icon: 'fas fa-check', default: true,
        callback: (_event, button) => {
          const form = button.form.elements
          return {
            templateKey: form.template.value,
            name: form.name.value.trim(),
            banner: button.form.querySelector('[name=banner]:checked')?.value ?? '',
            linked: form.linked.checked,
          }
        },
      }, {
        action: 'cancel', label: game.i18n.localize('Cancel'), icon: 'fas fa-xmark',
      }],
    })
    if (!result || typeof result !== 'object') return null
    const created = await SR5ShopVendor.createFromTemplate(result)
    created?.actor.sheet.render(true)
    return created
  }

  /** Open the vendor's shop window. */
  static async openShop(actor, storage, {
    buyer = null
  } = {
  }) {
    const {
      SR5ShopWindow
    } = await import('./shop-window.js')
    return SR5ShopWindow.open({
      actor: buyer, source: new SR5ShopVendorSource(actor, storage),
    })
  }

  /* -------------------------------------------- */
  /*  Buying                                      */
  /* -------------------------------------------- */

  /**
   * Ask for a purchase. The gamemaster's browser does it; a gamemaster at the
   * keyboard does it at once.
   *
   * @param {object} request
   * @param {string} request.vendorUuid the vendor actor's uuid (a token's for an unlinked Grunt)
   * @param {string} request.storageId the shop storage
   * @param {string} request.buyerId
   * @param {Array<{uuid: string, quantity: number, grade?: string}>} request.lines
   * @param {string} [request.payWith] a credstick of the buyer, else the accounts
   * @param {boolean} [request.equip] the gamemaster's Equip mode
   */
  static async purchase(request) {
    if (game.user.isGM) return SR5ShopVendor.sell(request, game.user.id)
    const {
      SR5_SocketHandler
    } = await import('../socket.js')
    await SR5_SocketHandler.emitForGM('shopVendorBuy', request)
    return true
  }

  /** The gamemaster's browser receives a purchase: the server stamped the sender. */
  static async _socketBuy(message, senderId) {
    if (!game.user.isGM) return
    await SR5ShopVendor.sell(message?.data ?? {
    }, senderId)
  }

  /** The gamemaster's browser receives a request for a buy-back offer. */
  static async _socketOffer(message, senderId) {
    if (!game.user.isGM) return
    await SR5ShopVendor.offer(message?.data ?? {
    }, senderId)
  }

  /** The gamemaster's browser receives the acceptance of an offer. */
  static async _socketAccept(message, senderId) {
    if (!game.user.isGM) return
    await SR5ShopVendor.accept(message?.data ?? {
    }, senderId)
  }

  /** The gamemaster's browser tells the buyer why nothing happened. */
  static _socketNotice(message, senderId) {
    if (!game.users.get(senderId)?.isGM) return
    const {
      level = 'warn', key, data
    } = message?.data ?? {
    }
    if (typeof key !== 'string' || !key.startsWith('SR5.')) return
    const notify = ['info', 'warn', 'error'].includes(level) ? level : 'warn'
    ui.notifications[notify](game.i18n.format(key, data ?? {
    }))
  }

  /** Say something to whoever asked, on their screen. */
  static async #notify(requester, level, key, data = {
  }) {
    if (!requester || requester.id === game.user.id) {
      ui.notifications[level](game.i18n.format(key, data))
      return
    }
    const {
      SR5_SocketHandler
    } = await import('../socket.js')
    SR5_SocketHandler.emitForPlayer('shopVendorNotice', {
      level, key, data
    }, requester.id)
  }

  /**
   * One sale at a time on the gamemaster's browser, whatever the vendor: two purchases checked at
   * once would both see the same balance, and a buyer could spend it twice at two vendors
   * (Bella's review, R1). A sale is a few writes; the line is never long.
   */
  static #queue = Promise.resolve()

  static sell(request, senderId) {
    return SR5ShopVendor.#serial(() => SR5ShopVendor.#sell(request, senderId))
  }

  /** Run `task` once the sales and buy-backs before it are done. */
  static #serial(task) {
    const next = SR5ShopVendor.#queue.catch(() => {}).then(task)
    SR5ShopVendor.#queue = next
    return next
  }

  /**
   * The till, on the gamemaster's browser. Nothing the request says is taken
   * on trust beyond the ids: who asks is the server's `senderId`, and stock,
   * prices, balance and rules are read again here.
   *
   * @returns {Promise<boolean>} whether the goods changed hands
   */
  static async #sell(request, senderId) {
    const requester = game.users.get(senderId)
    if (!requester) return false
    const byGM = requester.isGM
    const vendor = SR5ShopVendor.resolve(request?.vendorUuid, request?.storageId)
    const buyer = game.actors.get(request?.buyerId)
    if (!vendor) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorGone')
      return false
    }
    const {
      actor, storage
    } = vendor
    const shop = shopSettings(storage)
    const label = SR5ShopVendor.labelOf(storage)
    if (!buyer || !buyer.testUserPermission(requester, 'OWNER')) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopNotOwner')
      return false
    }
    if (buyer.uuid === actor.uuid) return false
    const equip = request.equip === true && byGM
    if (!shop.isOpen && !byGM) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorClosed', {
        name: label
      })
      return false
    }
    if (!equip && !SR5ShopStock.isBuyer(buyer, SR5ShopStock.buyerRule)) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopNotABuyer', {
        name: buyer.name
      })
      return false
    }
    const lines = Array.isArray(request.lines) ? request.lines.slice(0, 100) : []
    if (!lines.length) return false

    // The lines: an item of the counter by its uuid, or, for a shop taking orders, a compendium item
    const stockPrefix = `${actor.uuid}.Item.`
    const stockLines = [], orderLines = []
    for (const line of lines) {
      const uuid = typeof line?.uuid === 'string' ? line.uuid : ''
      if (uuid.startsWith(stockPrefix)) stockLines.push({
        itemId: uuid.slice(stockPrefix.length), quantity: line.quantity, name: line.name
      })
      else orderLines.push({
        ...line, uuid
      })
    }
    const {
      ok, refused
    } = checkStockLines(actor.items, storage.id, stockLines)
    for (const {
      line, reason
    } of refused) {
      SR5ShopVendor.#notify(requester, 'warn', `SR5.WARN_ShopVendorLine_${reason}`, {
        name: line.name ?? '?'
      })
    }
    const free = equip || SR5Shop.creationMode
    const limits = !equip && SR5Shop.creationMode ? SR5Shop.creationLimits : null
    const resolved = []
    for (const {
      item, quantity
    } of ok) {
      if (!SR5ShopStock.isSellableType(item.type)) continue
      if (SR5ShopStock.isNotForSale(item) && !byGM) continue
      const described = SR5ShopCatalog.describe({
        type: item.type, system: item.system, margin: shop.margin
      })
      const block = limits ? SR5ShopCatalog.creationBlock(described, limits) : null
      if (block) {
        SR5ShopVendor.#notify(requester, 'warn', `SR5.WARN_ShopCreationLimit_${block}`, {
          name: item.name, ...limits, source: game.i18n.localize(`SR5.ShopCreationSource_${limits.source}`),
        })
        continue
      }
      resolved.push({
        item, quantity, unit: described.price, total: described.price * quantity, name: item.name,
      })
    }
    for (const line of orderLines) {
      if (!shop.onOrder && !equip) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorLine_gone', {
          name: line.name ?? '?'
        })
        continue
      }
      if (!line.uuid.startsWith('Compendium.')) continue
      const quantity = Number(line.quantity)
      if (!Number.isInteger(quantity) || quantity < 1) continue
      const source = await fromUuid(line.uuid)
      if (!source) continue
      const entry = {
        documentName: 'Item', type: source.type, system: source.system, flags: source.flags, packId: source.pack
      }
      if (!SR5ShopStock.canSell(entry, {
        equip
      })) continue
      const offered = SR5Shop.gradesFor(source.type, source.system, {
        equip
      })
      const grade = offered.includes(line.grade) ? line.grade : null
      const described = SR5ShopCatalog.describe({
        type: source.type, system: source.system, margin: shop.margin
      }, grade)
      // A shop takes orders on its own shelves only, as the restock would fill them
      if (!equip && !fitsRestock(described, SR5ShopCatalog.shelfOf(source), shop)) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorLine_gone', {
          name: source.name
        })
        continue
      }
      const block = limits ? SR5ShopCatalog.creationBlock(described, limits) : null
      if (block) continue
      resolved.push({
        source, grade, quantity, unit: described.price, total: described.price * quantity,
        name: SR5Shop.gradedName(source.name, grade),
      })
    }
    if (!resolved.length) return false
    const total = resolved.reduce((sum, line) => sum + line.total, 0)

    // How the buyer pays: the accounts, or a credstick carried on them (SR5 p. 445)
    let stick = null
    if (!free && request.payWith) {
      stick = buyer.items.get(request.payWith)
      if (!SR5Credstick.is(stick) || isStoredAway(stick, buyer)) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorNoStick')
        return false
      }
      if (SR5Credstick.funds(stick) < total) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_CredstickNotEnoughOnStick', {
          name: stick.name, amount: total.toLocaleString(), loaded: SR5Credstick.funds(stick).toLocaleString(),
        })
        return false
      }
    } else if (!free && total > SR5Shop.balance(buyer)) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopNotEnoughNuyen', {
        name: buyer.name, price: total.toLocaleString(), balance: SR5Shop.balance(buyer).toLocaleString(),
      })
      return false
    }
    const cashbox = SR5ShopVendor.cashboxOf(actor, storage)
    if (!free && !cashbox) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorNoCashbox', {
        name: label
      })
      return false
    }

    const labels = resolved.map(line => SR5Shop.lineLabel(line.name, line.quantity))
    const summary = labels.length === 1 ? labels[0] : game.i18n.format('SR5.ShopPurchaseLines', {
      count: labels.length
    })

    // A vendor whose gamemaster wants a say: the sale waits for the answer
    if (shop.approve && !byGM) {
      const accepted = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: game.i18n.format('SR5.ShopVendorApproveTitle', {
            name: label
          })
        },
        content: `<p>${game.i18n.format('SR5.ShopVendorApproveText', {
          user: requester.name, actor: buyer.name, name: labels.join(', '), price: total.toLocaleString(),
        })}</p>`,
        rejectClose: false,
      })
      if (!accepted) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorRefused', {
          name: label
        })
        return false
      }
      // The counter may have moved while the gamemaster was reading: check the stock again
      const again = checkStockLines(actor.items, storage.id, ok.map(({
        line, quantity
      }) => ({
        ...line, quantity
      })))
      if (again.refused.length) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorLine_short', {
          name: again.refused[0].line.name ?? '?'
        })
        return false
      }
    }

    // The goods leave the counter first, then reach the buyer
    const toDelete = [], toUpdate = [], payload = []
    for (const line of resolved) {
      if (line.item) {
        const left = piecesOf(line.item) - line.quantity
        if (left > 0) toUpdate.push({
          _id: line.item.id, 'system.quantity': left
        })
        else toDelete.push(line.item.id)
        payload.push(...SR5ShopVendor.#handedOver(line.item, line.quantity))
      } else {
        payload.push(...SR5Shop._itemPayload(line.source, line.quantity, line.grade))
      }
    }
    if (toUpdate.length) await actor.updateEmbeddedDocuments('Item', toUpdate)
    if (toDelete.length) await actor.deleteEmbeddedDocuments('Item', toDelete)

    // The money: out of the buyer's accounts or stick, into the cashbox
    if (!free) {
      if (stick) await stick.update({
        'system.funds.value': SR5Credstick.funds(stick) - total
      })
      else payload.push(SR5ShopVendor.#transaction('loss', total, game.i18n.format('SR5.ShopPurchaseOf', {
        name: summary
      }), game.i18n.format('SR5.ShopVendorPurchaseDescription', {
        name: labels.join(', '), price: total.toLocaleString(), shop: label,
      })))
    }
    await buyer.createEmbeddedDocuments('Item', payload)
    let overflow = 0
    if (!free) {
      const split = splitTakings(total, SR5Credstick.room(cashbox))
      overflow = split.overflow
      if (split.intoStick) await cashbox.update({
        'system.funds.value': SR5Credstick.funds(cashbox) + split.intoStick
      })
      if (overflow) await actor.createEmbeddedDocuments('Item', [SR5ShopVendor.#transaction('gain', overflow,
        game.i18n.format('SR5.ShopVendorTakings', {
          name: label
        }), '')])
    }

    const rows = resolved.map(line =>
      `<li>${SR5Shop.lineLabel(line.name, line.quantity)} — ${line.total.toLocaleString()}&yen;</li>`).join('')
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({
        actor: buyer
      }),
      whisper: equip ? game.users.filter(u => u.isGM).map(u => u.id) : [],
      content: `<p>${game.i18n.format(free ? 'SR5.ShopVendorChatFree' : 'SR5.ShopVendorChat', {
        actor: buyer.name, name: summary, shop: label, price: total.toLocaleString(),
      })}</p>${resolved.length > 1 ? `<ul>${rows}</ul>` : ''}${overflow ? `<p>${game.i18n.format('SR5.ShopVendorOverflow', {
        amount: overflow.toLocaleString()
      })}</p>` : ''}`,
    })
    SR5ShopVendor.#notify(requester, 'info', 'SR5.ShopVendorDone', {
      name: summary, shop: label, price: total.toLocaleString(),
    })
    SR5_SystemHelpers.srLog(3, `Shop vendor: ${buyer.name} buys ${summary} from ${label} (${total})`)
    return true
  }

  /** The vendor's own item, as it reaches the buyer: out of the shop, the quantity bought. */
  static #handedOver(item, quantity) {
    const data = item.toObject()
    delete data._id
    data.system.storedIn = ''
    if (data.system.quantity !== undefined) {
      data.system.quantity = quantity
      return [data]
    }
    return [data]
  }

  /** A ledger line, in the shape the sheet writes by hand. */
  static #transaction(type, amount, name, description) {
    return {
      name,
      type: 'itemNuyen',
      img: 'systems/sr5/assets/img/items/itemNuyen.svg',
      system: {
        amount, type, date: new Date().toISOString().slice(0, 10), description,
      },
    }
  }

  /**
   * Compare the vendor's rows with its till, as `game.sr5.shopAudit()` does
   * for the world's shelves: every stock entry against its item.
   */
  static async audit(actor, storage) {
    const source = new SR5ShopVendorSource(actor, storage)
    const entries = await source.entries({
      stockOnly: true
    })
    const margin = shopSettings(storage).margin
    const differences = []
    for (const entry of entries) {
      const item = actor.items.get(entry.itemId)
      const shown = SR5ShopCatalog.describe(entry)
      const charged = SR5ShopCatalog.describe({
        type: item.type, system: item.system, margin
      })
      for (const key of ['price', 'availability', 'legality', 'essence', 'rating']) {
        if (shown[key] !== charged[key]) differences.push({
          name: entry.name, key, shown: shown[key], charged: charged[key]
        })
      }
    }
    return {
      checked: entries.length, differences
    }
  }

  /* -------------------------------------------- */
  /*  Buy-back (lot C, part 2; SR5 p. 421)        */
  /* -------------------------------------------- */

  /**
   * Does this contact of the seller's stand for the vendor? Its name is the vendor's, or the
   * name of the contact the gamemaster gave the vendor (lot C, part 2).
   */
  static isVendorContact(contact, actor, storage) {
    if (contact?.type !== 'itemContact') return false
    const names = [actor?.name, SR5ShopVendor.labelOf(storage), SR5ShopVendor.searcherOf(actor, storage).contact?.name]
      .filter(Boolean).map(name => name.trim().toLowerCase())
    return names.includes(contact.name.trim().toLowerCase())
  }

  /** What the vendor buys: its shelves, or everything with a price when the gamemaster says so. */
  static buysItem(item, storage) {
    if (!SR5ShopStock.isSellableType(item?.type) || item.system?.price === undefined) return false
    const shop = shopSettings(storage)
    return shop.buyAll || shop.shelves.includes(SR5ShopCatalog.shelfOf(item))
  }

  /** Ask the vendor for an offer: the gamemaster's browser rolls and posts it. */
  static async requestOffer(request) {
    if (game.user.isGM) return SR5ShopVendor.offer(request, game.user.id)
    const {
      SR5_SocketHandler
    } = await import('../socket.js')
    await SR5_SocketHandler.emitForGM('shopVendorOffer', request)
    return true
  }

  /** Accept an offer card. */
  static async requestAccept(message) {
    if (game.user.isGM) return SR5ShopVendor.accept({
      messageId: message.id
    }, game.user.id)
    const {
      SR5_SocketHandler
    } = await import('../socket.js')
    await SR5_SocketHandler.emitForGM('shopVendorAccept', {
      messageId: message.id
    })
    return true
  }

  static offer(request, senderId) {
    return SR5ShopVendor.#serial(() => SR5ShopVendor.#offer(request, senderId))
  }

  static accept(request, senderId) {
    return SR5ShopVendor.#serial(() => SR5ShopVendor.#accept(request, senderId))
  }

  /**
   * The vendor's offer, worked out on the gamemaster's browser so that no client writes its own
   * price. SR5 p. 421: a contact of the seller's takes the goods on the spot for 5 % of the listed
   * price per point of Loyalty; anyone else haggles, an opposed Negotiation + Charisma test, 25 %
   * of the listed price, 5 % more or less per net hit. The vendor is there: the "find a buyer"
   * step is skipped (DjamZ's ruling, 2026-10-05).
   */
  static async #offer(request, senderId) {
    const requester = game.users.get(senderId)
    const vendor = SR5ShopVendor.resolve(request?.vendorUuid, request?.storageId)
    const seller = game.actors.get(request?.sellerId)
    if (!requester || !vendor || !seller) return false
    const {
      actor, storage
    } = vendor
    const label = SR5ShopVendor.labelOf(storage)
    if (!seller.testUserPermission(requester, 'OWNER')) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopNotOwner')
      return false
    }
    if (!shopSettings(storage).isOpen && !requester.isGM) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorClosed', {
        name: label
      })
      return false
    }
    const lines = []
    const taken = new Map()
    for (const line of (Array.isArray(request.lines) ? request.lines : []).slice(0, 100)) {
      const item = seller.items.get(line?.itemId)
      const quantity = Number(line?.quantity)
      if (!item || isStoredAway(item, seller) || !Number.isInteger(quantity) || quantity < 1) continue
      if (!SR5ShopVendor.buysItem(item, storage)) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorDoesNotBuy', {
          name: item.name, shop: label
        })
        continue
      }
      const already = taken.get(item.id) ?? 0
      if (already + quantity > piecesOf(item)) continue
      taken.set(item.id, already + quantity)
      lines.push({
        item, quantity, listed: SR5ShopFence.listedPrice(item)
      })
    }
    if (!lines.length) return false

    const contact = seller.items.get(request.contactId)
    const viaContact = SR5ShopVendor.isVendorContact(contact, actor, storage)
    let percent, test = null
    if (viaContact) {
      percent = SR5ShopFence.rules.contactPercent * Number(contact.system.loyalty ?? 0)
    } else {
      const own = SR5ShopAvailability.buyerPool(seller)
      const theirs = SR5ShopVendor.searcherOf(actor, storage).pool
      const mine = await SR5ShopAvailability.rollDice(own.pool)
      const vendorRoll = await SR5ShopAvailability.rollDice(theirs?.pool ?? 0)
      const myHits = own.limit ? Math.min(mine.hits, own.limit) : mine.hits
      const theirHits = theirs?.limit ? Math.min(vendorRoll.hits, theirs.limit) : vendorRoll.hits
      percent = SR5ShopFence.hagglePercent(myHits - theirHits)
      test = {
        pool: own.pool, hits: myHits, vendorPool: theirs?.pool ?? 0, vendorHits: theirHits,
        net: myHits - theirHits, glitch: mine.glitch, criticalGlitch: mine.criticalGlitch,
      }
    }
    const results = lines.map(({
      item, quantity, listed
    }) => {
      const unit = Math.round(listed * percent / 100)
      return {
        itemId: item.id, name: item.name, quantity, listed, unit, total: unit * quantity,
      }
    })
    const total = results.reduce((sum, line) => sum + line.total, 0)
    const data = {
      vendorUuid: actor.uuid, storageId: storage.id, sellerId: seller.id, shop: label,
      viaContact, contactName: viaContact ? contact.name : '', percent, test, results, total,
    }
    const rows = results.map(line => `<li>${SR5Shop.lineLabel(line.name, line.quantity)} — ${
      line.total.toLocaleString()}&yen; <small>(${line.listed.toLocaleString()}&yen; × ${percent}%)</small></li>`).join('')
    const how = viaContact ?
      game.i18n.format('SR5.ShopVendorOfferContact', {
        name: contact.name, loyalty: contact.system.loyalty, percent
      }) :
      game.i18n.format('SR5.ShopVendorOfferHaggle', {
        hits: test.hits, pool: test.pool, vendorHits: test.vendorHits, vendorPool: test.vendorPool, percent,
      })
    const warning = test?.criticalGlitch ? game.i18n.localize('SR5.ShopVendorOfferCriticalGlitch') :
      test?.glitch ? game.i18n.localize('SR5.ShopVendorOfferGlitch') : ''
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({
        actor
      }),
      content: `<div class="sr-shop-card"><p>${game.i18n.format('SR5.ShopVendorOfferTitle', {
        shop: label, seller: seller.name, price: total.toLocaleString()
      })}</p><p class="muted">${how}</p>${warning ? `<p class="sr-shop-blocked">${warning}</p>` : ''}<ul>${rows}</ul>` +
        `<footer class="sr-shop-card-footer"><button type="button" data-vendor-offer="accept">${
          game.i18n.localize('SR5.ShopVendorOfferAccept')}</button></footer></div>`,
      flags: {
        sr5vendorOffer: data
      },
    })
    return true
  }

  /**
   * The seller takes the offer: checked again on the gamemaster's browser — the card is the
   * gamemaster's own (a player cannot write its price), not taken yet, the goods still there, the
   * cashbox able to pay. The goods go into the vendor's stock, the money out of its cashbox.
   */
  static async #accept(request, senderId) {
    const requester = game.users.get(senderId)
    const message = game.messages.get(request?.messageId)
    const data = message?.flags?.sr5vendorOffer
    if (!requester || !data || !message.author?.isGM) return false
    if (message.flags?.sr5?.vendorOfferTaken) return false
    const seller = game.actors.get(data.sellerId)
    const vendor = SR5ShopVendor.resolve(data.vendorUuid, data.storageId)
    if (!seller || !vendor || !seller.testUserPermission(requester, 'OWNER')) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopNotOwner')
      return false
    }
    const {
      actor, storage
    } = vendor
    const cashbox = SR5ShopVendor.cashboxOf(actor, storage)
    if (!cashbox || SR5Credstick.funds(cashbox) < data.total) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorCannotPay', {
        name: data.shop, price: data.total.toLocaleString()
      })
      return false
    }
    // Everything still there, in the quantity offered for, or nothing changes hands
    const toDelete = [], toUpdate = [], payload = []
    for (const line of data.results) {
      const item = seller.items.get(line.itemId)
      if (!item || isStoredAway(item, seller) || piecesOf(item) < line.quantity) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorOfferGone', {
          name: line.name
        })
        return false
      }
      const left = piecesOf(item) - line.quantity
      if (left > 0) toUpdate.push({
        _id: item.id, 'system.quantity': left
      })
      else toDelete.push(item.id)
      const stocked = item.toObject()
      delete stocked._id
      stocked.system.storedIn = storage.id
      if (stocked.system.isActive !== undefined) stocked.system.isActive = false
      if (stocked.system.quantity !== undefined) stocked.system.quantity = line.quantity
      payload.push(stocked)
    }
    await message.update({
      'flags.sr5.vendorOfferTaken': requester.id,
      content: message.content.replace(/<footer class="sr-shop-card-footer">[\s\S]*?<\/footer>/,
        `<footer class="sr-shop-card-footer"><span class="sr-shop-cashed">${game.i18n.localize('SR5.ShopVendorOfferTaken')}</span></footer>`),
    })
    if (toUpdate.length) await seller.updateEmbeddedDocuments('Item', toUpdate)
    if (toDelete.length) await seller.deleteEmbeddedDocuments('Item', toDelete)
    await actor.createEmbeddedDocuments('Item', payload)
    await cashbox.update({
      'system.funds.value': SR5Credstick.funds(cashbox) - data.total
    })
    await seller.createEmbeddedDocuments('Item', [SR5ShopVendor.#transaction('gain', data.total,
      game.i18n.format('SR5.ShopVendorSoldTo', {
        shop: data.shop
      }), data.results.map(line => SR5Shop.lineLabel(line.name, line.quantity)).join(', '))])
    SR5ShopVendor.#notify(requester, 'info', 'SR5.ShopVendorOfferDone', {
      shop: data.shop, price: data.total.toLocaleString()
    })
    return true
  }

  /** Wire the "accept" button of an offer card. */
  static chatListeners(html, message) {
    html.querySelectorAll('[data-vendor-offer="accept"]').forEach(button => {
      if (message.flags?.sr5?.vendorOfferTaken) {
        button.disabled = true
        return
      }
      button.addEventListener('click', async event => {
        event.preventDefault()
        if (button.disabled) return
        const seller = game.actors.get(message.flags?.sr5vendorOffer?.sellerId)
        if (!seller?.isOwner) {
          ui.notifications.warn(game.i18n.localize('SR5.WARN_ShopNotOwner'))
          return
        }
        button.disabled = true
        await SR5ShopVendor.requestAccept(message)
      })
    })
  }

  /* -------------------------------------------- */
  /*  Ways in                                     */
  /* -------------------------------------------- */

  /** A change on a vendor: an open shop window on it redraws. */
  static async onVendorChanged(document) {
    const actor = document?.documentName === 'Actor' ? document : document?.parent
    if (actor?.documentName !== 'Actor') return
    const {
      SR5ShopWindow
    } = await import('./shop-window.js')
    const shop = SR5ShopWindow._instance
    if (shop?.rendered && shop._source?.actorUuid === actor.uuid) shop.render()
  }
}

/**
 * The window's source for a vendor (lot B contract): `label`, `isReady()`,
 * `load()`, `entries({equip})`, entries sorted by name. The stock is read
 * live, at each redraw: a sale or a restock shows at once.
 */
export class SR5ShopVendorSource {

  constructor(actor, storage) {
    this.actorUuid = actor.uuid
    this.storageId = storage.id
    this.key = `vendor:${actor.uuid}:${storage.id}`
    this.vendor = true
  }

  get resolved() {
    return SR5ShopVendor.resolve(this.actorUuid, this.storageId)
  }

  get actor() {
    return this.resolved?.actor ?? null
  }

  get storage() {
    return this.resolved?.storage ?? null
  }

  get shop() {
    return shopSettings(this.storage)
  }

  get label() {
    return SR5ShopVendor.labelOf(this.storage)
  }

  /** The counter is read from the actor; only a shop taking orders waits for the world's shelves. */
  isReady() {
    return !this.shop.onOrder || SR5ShopVendorSource._worldRead === true
  }

  async load(onProgress) {
    const {
      SR5ShopWorldSource
    } = await import('./shop-window.js')
    const entries = await new SR5ShopWorldSource().load(onProgress)
    SR5ShopVendorSource._worldRead = true
    return entries
  }

  async entries({
    equip = false, stockOnly = false
  } = {
  }) {
    const resolved = this.resolved
    if (!resolved) return []
    const {
      actor, storage
    } = resolved
    const shop = shopSettings(storage)
    const lists = SR5_EntityHelpers.sortTranslations(SR5)
    const entries = []
    const inStock = new Set()
    for (const item of stockOf(actor.items, storage.id)) {
      if (!SR5ShopStock.isSellableType(item.type)) continue
      const sourceUuid = item.flags?.sr5?.shopSource ?? item._stats?.compendiumSource
      if (sourceUuid) inStock.add(sourceUuid)
      const entry = {
        _id: item.id,
        itemId: item.id,
        name: item.name,
        img: item.img,
        type: item.type,
        docName: 'Item',
        uuid: item.uuid,
        packId: null,
        flags: {
          sr5: {
            notForSale: item.flags?.sr5?.notForSale === true
          }
        },
        system: SR5ShopCatalog.essentials(item.system),
        info: getEntryInfo({
          type: item.type, system: {
            ...item.system, price: undefined, grade: undefined
          }
        }, lists),
        margin: shop.margin,
        vendor: true,
        stock: piecesOf(item),
      }
      entry.shelf = SR5ShopCatalog.shelfOf(entry)
      entry.sub = SR5ShopCatalog.subOf(entry)
      entries.push(entry)
    }
    // A shop taking orders lists the rest of its shelves, to be looked for (SR5 p. 420)
    if (shop.onOrder && !stockOnly) {
      const {
        SR5ShopWorldSource
      } = await import('./shop-window.js')
      const index = await SR5ShopWorldSource.index()
      const excluded = SR5ShopStock.excludedPacks
      for (const entry of index) {
        if (inStock.has(entry.uuid)) continue
        if (!SR5ShopStock.canSell(entry, {
          equip, excluded
        })) continue
        if (!fitsRestock(SR5ShopCatalog.describe(entry), entry.shelf, shop)) continue
        entries.push({
          ...entry, margin: shop.margin, vendor: true, onOrder: true, _described: undefined,
        })
      }
    }
    const collator = new Intl.Collator(game.i18n.lang)
    return entries.sort((a, b) => collator.compare(a.name, b.name))
  }
}
