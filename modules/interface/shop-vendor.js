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
  VENDOR_TEMPLATES, VENDOR_FAMILIES, vendorTemplate, templateBanners, templateShop, bannerFolderOf
} from './shop-vendor-templates.js'
import {
  isStoredAway
} from './storage-rules.js'
import {
  isShopStorage, shopSettings, stockOf, itemFigures, figureMismatches, piecesOf, fitsRestock, restockPicks, splitTakings,
  checkStockLines
} from './shop-vendor-rules.js'
import {
  lineWaits, deliveryDelayed, currentExpress, expressCost, orderHours, newOrder, addOrders, ledgerOrders
} from './shop-orders.js'

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
      clients: (shop.clients ?? []).map(client => ({
        actorId: client.actorId, loyalty: client.loyalty,
        name: game.actors?.get(client.actorId)?.name ?? client.actorId,
      })),
      clientCandidates: (game.actors?.filter(a => a.type === 'actorPc') ?? [])
        .filter(a => !(shop.clients ?? []).some(c => c.actorId === a.id))
        .map(a => ({
          id: a.id, name: a.name
        })),
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
    const shop = shopSettings(storage)
    const contact = actor?.items?.get(shop.contactId)
    if (contact?.type === 'itemContact') return {
      contact, pool: SR5ShopAvailability.contactPool(contact)
    }
    // A pool set on the shop (a template gives one): a Grunt never written up still haggles
    const set = Math.max(0, Math.floor(Number(shop.negotiationPool) || 0))
    if (set) return {
      contact: null, pool: {
        raw: set, pool: set, limit: 0, label: actor?.name ?? '', derived: false
      }
    }
    return {
      contact: null, pool: actor ? SR5ShopAvailability.buyerPool(actor) : null
    }
  }

  /* -------------------------------------------- */
  /*  Templates (lot C, part 2)                   */
  /* -------------------------------------------- */

  /** The banner folder set by the gamemaster; empty, the Megapack's when it is active, else none. */
  static get bannerFolder() {
    let setting = ''
    try {
      setting = game.settings.get('sr5', 'sr5ShopBannerFolder')
    } catch {
      setting = ''
    }
    return bannerFolderOf(setting, !!game.modules?.get('megapack-sr5-foundry-vtt')?.active)
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
    // One creation with every item: SR5Actor.create returns the actor only when the data carries
    // its items (otherwise it adds the base items itself and returns nothing), so the Grunt's base
    // items are fetched here, as it would, and the shop and its cashbox come with them
    // Loaded on demand: the compendium helpers bring half the system, which the sheets and the tests do without
    const baseItems = async () => {
      const {
        SR5_CompendiumUtility
      } = await import('../entities/actors/utilityCompendium.js')
      return await SR5_CompendiumUtility.getBaseItems('actorGrunt') ?? []
    }
    const storageId = foundry.utils.randomID()
    const cashboxId = foundry.utils.randomID()
    const shop = templateShop(template, {
      label, banner
    })
    shop.cashboxId = cashboxId
    const items = [
      ...(await baseItems()),
      {
        _id: storageId, name: label, type: 'itemStorage', system: {
          type: 'shop', shop
        }
      },
      {
        _id: cashboxId, name: game.i18n.localize('SR5.ShopVendorCashboxName'), type: 'itemGear',
        img: 'systems/sr5/assets/img/items/itemNuyen.svg',
        system: {
          isCredstick: true, funds: {
            value: 0, max: 0
          }
        },
      },
    ]
    const actor = await Actor.implementation.create({
      name: label, type: 'actorGrunt', items, prototypeToken: {
        actorLink: linked, name: label
      },
    }, {
      keepEmbeddedIds: true
    })
    if (!actor) return null
    if (restock) await SR5ShopVendor.restock(actor, actor.items.get(storageId))
    return {
      actor, storage: actor.items.get(storageId)
    }
  }

  /** Add a client contact to the shop, or change its Loyalty (gamemaster only). */
  static async setClient(storage, actorId, loyalty) {
    if (!game.user.isGM || !isShopStorage(storage) || !actorId) return
    const value = Math.max(1, Math.min(6, Math.floor(Number(loyalty) || 1)))
    const clients = (shopSettings(storage).clients ?? []).filter(c => c.actorId !== actorId)
    clients.push({
      actorId, loyalty: value
    })
    await storage.update({
      'system.shop.clients': clients
    })
  }

  /** Take a client contact off the shop (gamemaster only). */
  static async removeClient(storage, actorId) {
    if (!game.user.isGM || !isShopStorage(storage)) return
    await storage.update({
      'system.shop.clients': (shopSettings(storage).clients ?? []).filter(c => c.actorId !== actorId)
    })
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

  /** The gamemaster's browser receives a declined offer. */
  static async _socketDecline(message, senderId) {
    if (!game.user.isGM) return
    await SR5ShopVendor.decline(message?.data ?? {
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
    const terms = request.express === true ? currentExpress() : null
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
      // An order is searched for (SR5 p. 420): it waits on the buyer; the counter's stock does not
      const waits = lineWaits({
        delayed: deliveryDelayed(), availability: described.availability, free
      })
      const total = described.price * quantity
      const extra = waits ? expressCost(total, terms) : 0
      resolved.push({
        source, grade, quantity, unit: described.price, total, extra, waits,
        name: SR5Shop.gradedName(source.name, grade),
      })
    }
    if (!resolved.length) return false
    const total = resolved.reduce((sum, line) => sum + line.total + (line.extra ?? 0), 0)

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
    const toDelete = [], toUpdate = [], payload = [], orders = []
    for (const line of resolved) {
      if (line.waits) {
        line.order = newOrder(line, {
          // The time from the requester's own card, worked out here on the GM's browser
          hours: orderHours(SR5Shop.searchHours(line, typeof request.messageId === 'string' ? request.messageId : null, senderId),
            line.extra ? terms : null),
          express: !!line.extra, extra: line.extra, now: game.time.worldTime,
          // Shown on the sheet only: the money follows the GM's ledger, not this
          vendor: {
            label
          },
        })
        orders.push(line.order)
      } else if (line.item) {
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
    if (payload.length) await buyer.createEmbeddedDocuments('Item', payload)
    await addOrders(buyer, orders)
    // The GM's till writes what each order cost and who took the money: a cancellation follows this alone
    await ledgerOrders(Object.fromEntries(orders.map(o => [o.id, {
      actorUuid: buyer.uuid, paid: free ? 0 : o.paid, vendorUuid: free ? null : actor.uuid, storageId: storage.id,
      vendorLabel: label,
    }])))
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
      `<li>${SR5Shop.lineLabel(line.name, line.quantity)} — ${(line.total + (line.extra ?? 0)).toLocaleString()}&yen;${
        SR5Shop.orderNote(line.order)}</li>`).join('')
    await foundry.documents.ChatMessage.create({
      speaker: foundry.documents.ChatMessage.getSpeaker({
        actor: buyer
      }),
      whisper: equip ? game.users.filter(u => u.isGM).map(u => u.id) : [],
      content: `<p>${game.i18n.format(free ? 'SR5.ShopVendorChatFree' : 'SR5.ShopVendorChat', {
        actor: buyer.name, name: summary, shop: label, price: total.toLocaleString(),
      })}</p>${resolved.length > 1 || orders.length ? `<ul>${rows}</ul>` : ''}${overflow ? `<p>${game.i18n.format('SR5.ShopVendorOverflow', {
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
   * The Loyalty of a seller who is one of the vendor's client contacts, from the list the
   * gamemaster keeps on the shop (Nora's review: a player can write anything on her own sheet,
   * never on the gamemaster's vendor). 0: not a client contact.
   */
  static clientLoyalty(storage, sellerId) {
    const client = (shopSettings(storage).clients ?? []).find(entry => entry?.actorId === sellerId)
    return Math.max(0, Number(client?.loyalty) || 0)
  }

  /** What the vendor buys: its shelves, or everything with a price when the gamemaster says so. */
  static buysItem(item, storage) {
    if (!SR5ShopStock.isSellableType(item?.type) || item.system?.price === undefined) return false
    const shop = shopSettings(storage)
    return shop.buyAll || shop.shelves.includes(SR5ShopCatalog.shelfOf(item))
  }

  /**
   * The listed price the vendor proposes for an item a seller brings, and where it comes from.
   * The source the seller's copy declares (`flags.sr5.shopSource`, Foundry's compendium source)
   * proves nothing — its owner can write it (Nora's second review) — it only proposes a price;
   * then the item of that name on the world's shelves; then the copy's own. Whatever the origin,
   * the gamemaster confirms every buy-back, the item and its source side by side.
   */
  static async referencePrice(item) {
    for (const uuid of [item?.flags?.sr5?.shopSource, item?._stats?.compendiumSource, item?.flags?.core?.sourceId]) {
      if (typeof uuid !== 'string' || !uuid.startsWith('Compendium.')) continue
      let source = null
      try {
        source = await fromUuid(uuid)
      } catch {
        source = null
      }
      if (source && source.type === item.type) {
        return {
          listed: SR5ShopFence.listedPrice(source), origin: 'source', sourceUuid: uuid,
        }
      }
    }
    const byName = await SR5ShopVendor.#shelfPriceByName(item)
    if (byName) return {
      listed: byName.listed, origin: 'name', sourceUuid: byName.sourceUuid
    }
    return {
      listed: SR5ShopFence.listedPrice(item), origin: 'sheet', sourceUuid: null,
    }
  }

  /** The cheapest item of this type and name on the world's shelves, if any. */
  static async #shelfPriceByName(item) {
    let index = []
    try {
      const {
        SR5ShopWorldSource
      } = await import('./shop-window.js')
      index = await SR5ShopWorldSource.index()
    } catch {
      return null
    }
    const found = index.filter(entry => entry.type === item?.type && entry.name === item?.name)
      .map(entry => ({
        entry, price: Number(entry.system?.price?.value ?? entry.system?.price?.base ?? 0) || 0
      }))
      .filter(({
        price
      }) => price > 0)
      .sort((a, b) => a.price - b.price)[0]
    return found ? {
      listed: found.price, sourceUuid: found.entry.uuid, basePrice: found.entry.system?.price?.base ?? null,
    } : null
  }

  /** An offer still waiting for an answer: not taken, not declined, not cancelled. */
  static isOfferOpen(message) {
    return !!message?.flags?.sr5vendorOffer && !message.flags?.sr5?.vendorOfferTaken && !message.flags?.sr5?.vendorOfferClosed
  }

  /** The open offer of this vendor on one of these items of this seller, if any. */
  static openOfferOn(vendorUuid, sellerId, itemIds) {
    return game.messages?.find?.(message => {
      // Open, or declined by the seller and not unlocked by the gamemaster
      const blocking = SR5ShopVendor.isOfferOpen(message) || message.flags?.sr5?.vendorOfferLocked === true
      if (!message.author?.isGM || !blocking) return false
      const data = message.flags.sr5vendorOffer
      return data.vendorUuid === vendorUuid && data.sellerId === sellerId &&
        (data.results ?? []).some(line => itemIds.includes(line.itemId))
    }) ?? null
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

  /** Decline an offer (the seller) or cancel it (the gamemaster). */
  static async requestDecline(message) {
    if (game.user.isGM) return SR5ShopVendor.decline({
      messageId: message.id
    }, game.user.id)
    const {
      SR5_SocketHandler
    } = await import('../socket.js')
    await SR5_SocketHandler.emitForGM('shopVendorDecline', {
      messageId: message.id
    })
    return true
  }

  static offer(request, senderId) {
    return SR5ShopVendor.#serial(() => SR5ShopVendor.#offer(request, senderId))
  }

  /**
   * The vendor's offer, worked out on the gamemaster's browser so that no client writes its own
   * price. SR5 p. 421: a contact of the seller's takes the goods on the spot for 5 % of the listed
   * price per point of Loyalty; anyone else haggles, an opposed Negotiation + Charisma test, 25 %
   * of the listed price, 5 % more or less per net hit. The vendor is there: the "find a buyer"
   * step is skipped (DjamZ's ruling, 2026-10-05). One open offer per item: asking again rolls
   * nothing until the last one is accepted, declined or cancelled.
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
        item, quantity, ...(await SR5ShopVendor.referencePrice(item))
      })
    }
    if (!lines.length) return false
    const open = SR5ShopVendor.openOfferOn(actor.uuid, seller.id, lines.map(line => line.item.id))
    if (open) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorOfferOpen', {
        shop: label
      })
      return false
    }

    const loyalty = SR5ShopVendor.clientLoyalty(storage, seller.id)
    const viaContact = loyalty > 0
    let percent, test = null
    if (viaContact) {
      percent = SR5ShopFence.rules.contactPercent * loyalty
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
      item, quantity, listed, origin, sourceUuid
    }) => {
      const unit = Math.round(listed * percent / 100)
      return {
        itemId: item.id, name: item.name, quantity, listed, unit, total: unit * quantity, origin, sourceUuid,
      }
    })
    const total = results.reduce((sum, line) => sum + line.total, 0)
    const data = {
      vendorUuid: actor.uuid, storageId: storage.id, sellerId: seller.id, shop: label,
      viaContact, loyalty, percent, test, results, total,
    }
    const rows = results.map(line => `<li>${SR5Shop.lineLabel(line.name, line.quantity)} — ${
      line.total.toLocaleString()}&yen; <small>(${line.listed.toLocaleString()}&yen; × ${percent}%)</small>${
      ` <small class="muted">${game.i18n.localize(`SR5.ShopVendorOrigin_${line.origin}`)}</small>`}</li>`).join('')
    const how = viaContact ?
      game.i18n.format('SR5.ShopVendorOfferContact', {
        name: seller.name, loyalty, percent
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
          game.i18n.localize('SR5.ShopVendorOfferAccept')}</button><button type="button" data-vendor-offer="decline">${
          game.i18n.localize('SR5.ShopVendorOfferDecline')}</button></footer></div>`,
      flags: {
        sr5vendorOffer: data
      },
    })
    return true
  }

  /** Close a card: its footer says how, and its buttons go. */
  static async #closeCard(message, flags, labelKey) {
    await message.update({
      ...flags,
      content: message.content.replace(/<footer class="sr-shop-card-footer">[\s\S]*?<\/footer>/,
        `<footer class="sr-shop-card-footer"><span class="sr-shop-cashed">${game.i18n.localize(labelKey)}</span></footer>`),
    })
  }

  /**
   * Buy-back offers being looked at by the gamemaster: one dialog per card, and no second
   * acceptance while it is open.
   */
  static #reviewing = new Set()

  /**
   * The seller takes the offer. Three steps (Élise's ruling after Nora's second review):
   * 1. in the queue, everything is checked — the card is the gamemaster's own, still open, the
   *    goods still there, the cashbox able to pay;
   * 2. out of the queue, the gamemaster looks at each item against its source and accepts,
   *    refuses or corrects the price: a source the seller's copy declares proves nothing, its
   *    owner writes it. The dialog holds up neither the purchases nor the other requests;
   * 3. back in the queue, everything is checked again, then the goods and the money move.
   */
  static async accept(request, senderId) {
    const review = await SR5ShopVendor.#serial(() => SR5ShopVendor.#checkAccept(request, senderId))
    if (!review) return false
    let answer = null
    try {
      answer = await SR5ShopVendor.confirmBuyBack(review)
    } catch (err) {
      console.error('SR5 Shop: the buy-back confirmation failed', err)
    } finally {
      SR5ShopVendor.#reviewing.delete(review.messageId)
    }
    if (!answer?.accepted) {
      SR5ShopVendor.#notify(review.requester, 'warn', 'SR5.WARN_ShopVendorRefused', {
        name: review.data.shop
      })
      return false
    }
    return SR5ShopVendor.#serial(() => SR5ShopVendor.#finishAccept(request, senderId, answer))
  }

  static decline(request, senderId) {
    return SR5ShopVendor.#serial(() => SR5ShopVendor.#decline(request, senderId))
  }

  static unlock(request, senderId) {
    return SR5ShopVendor.#serial(() => SR5ShopVendor.#unlock(request, senderId))
  }

  /**
   * Everything an acceptance needs, read again from the documents: null when it cannot go on.
   * `units` replaces the offer's unit prices (the gamemaster's correction).
   */
  static #acceptState(request, senderId, units = null) {
    const requester = game.users.get(senderId)
    const message = game.messages.get(request?.messageId)
    const data = message?.flags?.sr5vendorOffer
    if (!requester || !data || !message.author?.isGM) return null
    if (!SR5ShopVendor.isOfferOpen(message)) return null
    const seller = game.actors.get(data.sellerId)
    const vendor = SR5ShopVendor.resolve(data.vendorUuid, data.storageId)
    if (!seller || !vendor || !seller.testUserPermission(requester, 'OWNER')) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopNotOwner')
      return null
    }
    const lines = []
    for (const [index, line] of data.results.entries()) {
      const item = seller.items.get(line.itemId)
      if (!item || isStoredAway(item, seller) || piecesOf(item) < line.quantity) {
        SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorOfferGone', {
          name: line.name
        })
        return null
      }
      const corrected = units?.[index]
      const unit = Number.isFinite(corrected) && corrected >= 0 ? Math.floor(corrected) : line.unit
      lines.push({
        ...line, item, offeredUnit: line.unit, unit, total: unit * line.quantity
      })
    }
    const total = lines.reduce((sum, line) => sum + line.total, 0)
    const cashbox = SR5ShopVendor.cashboxOf(vendor.actor, vendor.storage)
    if (!cashbox || SR5Credstick.funds(cashbox) < total) {
      SR5ShopVendor.#notify(requester, 'warn', 'SR5.WARN_ShopVendorCannotPay', {
        name: data.shop, price: total.toLocaleString()
      })
      return null
    }
    return {
      requester, message, messageId: message.id, data, seller, ...vendor, cashbox, lines, total,
    }
  }

  /** Step 1: checked in the queue, then the card waits for the gamemaster. */
  static async #checkAccept(request, senderId) {
    if (SR5ShopVendor.#reviewing.has(request?.messageId)) return null
    const state = SR5ShopVendor.#acceptState(request, senderId)
    if (!state) return null
    SR5ShopVendor.#reviewing.add(state.messageId)
    // What the gamemaster compares: each item against the source its copy declares, if any
    for (const line of state.lines) {
      let source = null
      if (typeof line.sourceUuid === 'string' && line.sourceUuid.startsWith('Compendium.')) {
        try {
          source = await fromUuid(line.sourceUuid)
        } catch {
          source = null
        }
      }
      line.figures = itemFigures(line.item)
      line.sourceFigures = source ? itemFigures(source) : null
      line.sourceName = source?.name ?? ''
      line.mismatches = figureMismatches(line.item, source)
    }
    return state
  }

  /** Step 3: everything again, in the queue, then the goods and the money move. */
  static async #finishAccept(request, senderId, answer) {
    const state = SR5ShopVendor.#acceptState(request, senderId, answer.units)
    if (!state) return false
    const {
      requester, message, data, seller, actor, storage, cashbox, lines, total
    } = state
    const toDelete = [], toUpdate = [], payload = []
    for (const line of lines) {
      const item = line.item
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
      // On the counter at the price the gamemaster accepted, as a listed price
      if (stocked.system.price) {
        // The listed price proposed, or the one the gamemaster's correction stands for
        const corrected = line.unit !== line.offeredUnit && data.percent
        const listed = corrected ? Math.round(line.unit * 100 / data.percent) : line.listed
        stocked.system.price.base = listed
      }
      payload.push(stocked)
    }
    await SR5ShopVendor.#closeCard(message, {
      'flags.sr5.vendorOfferTaken': requester.id,
      'flags.sr5vendorOffer.total': total,
    }, 'SR5.ShopVendorOfferTaken')
    if (toUpdate.length) await seller.updateEmbeddedDocuments('Item', toUpdate)
    if (toDelete.length) await seller.deleteEmbeddedDocuments('Item', toDelete)
    await actor.createEmbeddedDocuments('Item', payload)
    await cashbox.update({
      'system.funds.value': SR5Credstick.funds(cashbox) - total
    })
    await seller.createEmbeddedDocuments('Item', [SR5ShopVendor.#transaction('gain', total,
      game.i18n.format('SR5.ShopVendorSoldTo', {
        shop: data.shop
      }), lines.map(line => SR5Shop.lineLabel(line.name, line.quantity)).join(', '))])
    SR5ShopVendor.#notify(requester, 'info', 'SR5.ShopVendorOfferDone', {
      shop: data.shop, price: total.toLocaleString()
    })
    return true
  }

  /**
   * The gamemaster's look at a buy-back, on his browser: for each item its name, kind, category
   * and key figures, the price proposed and where it comes from, a warning when the item and the
   * source it declares differ. He accepts, refuses or corrects the unit prices.
   * Replaced in the tests.
   *
   * @returns {Promise<{accepted: boolean, units?: number[]}>}
   */
  static async confirmBuyBack(review) {
    const figuresLabel = figures => figures ? [
      game.i18n.localize(`TYPES.Item.${figures.type}`),
      // The category and the damage type in words: "Pistolet lourd", "P"
      figures.category ? game.i18n.localize(SR5.weaponCategories?.[figures.category] ?? figures.category) : '',
      figures.damage ? game.i18n.format('SR5.ShopVendorFiguresWeapon', {
        ...figures,
        damage: `${figures.damageBase}${game.i18n.localize(SR5.damageTypesShort?.[figures.damageType] ?? figures.damageType)}`,
      }) : '',
      'rating' in figures ? game.i18n.format('SR5.ShopVendorFiguresRating', figures) : '',
    ].filter(Boolean).join(' · ') : '—'
    const rows = review.lines.map((line, index) => {
      const origin = game.i18n.localize(`SR5.ShopVendorOrigin_${line.origin ?? 'sheet'}`)
      const warning = line.mismatches?.length ? `<p class="sr-shop-blocked"><i class="fas fa-triangle-exclamation"></i> ${
        game.i18n.format('SR5.ShopVendorMismatch', {
          what: line.mismatches.map(key => game.i18n.localize(`SR5.ShopVendorMismatch_${key}`)).join(', '),
          source: line.sourceName,
        })}</p>` : ''
      return `<li class="sr-shop-review-line"><b>${line.name}</b> (x${line.quantity})
        <p>${figuresLabel(line.figures)}</p>
        ${line.sourceFigures ? `<p class="muted">${game.i18n.format('SR5.ShopVendorSourceFigures', {
    name: line.sourceName, figures: figuresLabel(line.sourceFigures)
  })}</p>` : ''}
        <p>${game.i18n.format('SR5.ShopVendorProposed', {
    listed: line.listed.toLocaleString(), origin, percent: review.data.percent
  })}</p>${warning}
        <label>${game.i18n.localize('SR5.ShopVendorUnitPrice')}
          <input type="number" min="0" step="1" name="unit-${index}" value="${line.unit}"></label></li>`
    }).join('')
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format('SR5.ShopVendorReviewTitle', {
          name: review.data.shop
        })
      },
      position: {
        width: 520
      },
      content: `<p>${game.i18n.format('SR5.ShopVendorReviewText', {
        seller: review.seller.name, price: review.total.toLocaleString()
      })}</p><ul class="sr-shop-review">${rows}</ul>`,
      rejectClose: false,
      buttons: [{
        action: 'accept', label: game.i18n.localize('SR5.ShopVendorReviewAccept'), icon: 'fas fa-check', default: true,
        callback: (_event, button) => ({
          accepted: true,
          units: review.lines.map((_line, index) => Number(button.form.elements[`unit-${index}`]?.value)),
        }),
      }, {
        action: 'refuse', label: game.i18n.localize('SR5.ShopVendorReviewRefuse'), icon: 'fas fa-xmark',
        callback: () => ({
          accepted: false
        }),
      }],
    })
    return result && typeof result === 'object' ? result : {
      accepted: false
    }
  }

  /**
   * The seller says no, or the gamemaster withdraws the offer. A seller's no locks the item at this
   * vendor until the gamemaster unlocks it from the card: a player does not roll again alone.
   */
  static async #decline(request, senderId) {
    const requester = game.users.get(senderId)
    const message = game.messages.get(request?.messageId)
    const data = message?.flags?.sr5vendorOffer
    if (!requester || !data || !message.author?.isGM || !SR5ShopVendor.isOfferOpen(message)) return false
    if (SR5ShopVendor.#reviewing.has(message.id)) return false
    const seller = game.actors.get(data.sellerId)
    if (!requester.isGM && !seller?.testUserPermission(requester, 'OWNER')) return false
    if (requester.isGM) {
      await SR5ShopVendor.#closeCard(message, {
        'flags.sr5.vendorOfferClosed': requester.id
      }, 'SR5.ShopVendorOfferCancelled')
      return true
    }
    await message.update({
      'flags.sr5.vendorOfferClosed': requester.id,
      'flags.sr5.vendorOfferLocked': true,
      content: message.content.replace(/<footer class="sr-shop-card-footer">[\s\S]*?<\/footer>/,
        `<footer class="sr-shop-card-footer"><span class="sr-shop-cashed">${game.i18n.localize('SR5.ShopVendorOfferDeclined')}</span>` +
        `<button type="button" data-vendor-offer="unlock">${game.i18n.localize('SR5.ShopVendorOfferUnlock')}</button></footer>`),
    })
    return true
  }

  /** The gamemaster lifts the lock a seller's no put on the item. */
  static async #unlock(request, senderId) {
    const requester = game.users.get(senderId)
    const message = game.messages.get(request?.messageId)
    if (!requester?.isGM || !message?.flags?.sr5vendorOffer || !message.flags?.sr5?.vendorOfferLocked) return false
    await SR5ShopVendor.#closeCard(message, {
      'flags.sr5.vendorOfferLocked': false
    }, 'SR5.ShopVendorOfferUnlocked')
    return true
  }

  /** Wire the buttons of an offer card. */
  static chatListeners(html, message) {
    html.querySelectorAll('[data-vendor-offer]').forEach(button => {
      const action = button.dataset.vendorOffer
      const live = action === 'unlock' ? !!message.flags?.sr5?.vendorOfferLocked : SR5ShopVendor.isOfferOpen(message)
      // The lock is the gamemaster's to lift
      if (!live || (action === 'unlock' && !game.user.isGM)) {
        button.disabled = true
        return
      }
      button.addEventListener('click', async event => {
        event.preventDefault()
        if (button.disabled) return
        const seller = game.actors.get(message.flags?.sr5vendorOffer?.sellerId)
        if (!game.user.isGM && !seller?.isOwner) {
          ui.notifications.warn(game.i18n.localize('SR5.WARN_ShopNotOwner'))
          return
        }
        button.disabled = true
        if (action === 'decline') await SR5ShopVendor.requestDecline(message)
        else if (action === 'unlock') await SR5ShopVendor.unlock({
          messageId: message.id
        }, game.user.id)
        else await SR5ShopVendor.requestAccept(message)
        // A refusal leaves the card as it was: the button comes back once the answer had time to
        // arrive (Nora's review); a card taken or closed is drawn again without it
        setTimeout(() => {
          if (SR5ShopVendor.isOfferOpen(game.messages?.get(message.id) ?? message)) button.disabled = false
        }, 1500)
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
