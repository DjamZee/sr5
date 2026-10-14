import {
  SR5
} from '../config.js'
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
  SR5ShopWorldSource
} from './shop-window.js'
import {
  deliveryDelayed, currentExpress, lineWaits, expressCost
} from './shop-orders.js'
import {
  dealerPrice, dealerEffectFor
} from '../system/rigger-qualities.js'
import {
  refuseByRule
} from '../system/rule-locks.js'
import {
  isFactoryMod
} from '../system/vehicle-factory.js'
import {
  MOD_CATEGORIES, modCost, workshopImage
} from '../system/vehicle-workshop.js'
import {
  pricedModData
} from '../system/vehicle-workshop-apply.js'
import {
  dealerCapacity, dealerGauges, buildSlotsRefusal, dealerTotals, dealerPointsGauge, buildPointsRefusal,
  dealerShelf, vehicleShowcase, isDroneModel
} from '../system/vehicle-dealership.js'
import {
  usesModPoints, droneModRule, vehicleStats, modPointsLines
} from '../system/drone-mod-points.js'
import {
  vendorBanner
} from '../system/item-workshop-apply.js'

const L = k => game.i18n.localize(k)
const yen = n => `${(Number(n) || 0).toLocaleString()} ¥`
// A mod's availability may hang on the vehicle too: its legality alone then, or a dash
const availabilityLabel = (availability, legality) => availability || legality ? `${availability || ''}${legality ?? ''}` : '—'
// The short labels of the showroom's figures
const STAT_LABELS = {
  handling: 'SR5.VehicleStat_HandlingAbbrev', acceleration: 'SR5.VehicleStat_AccelerationAbbrev', speed: 'SR5.VehicleStat_SpeedAbbrev',
  pilot: 'SR5.VehicleStat_PilotAbbrev', body: 'SR5.VehicleStat_BodyAbbrev', armor: 'SR5.VehicleStat_ArmorAbbrev',
  sensor: 'SR5.VehicleStat_SensorAbbrev', seating: 'SR5.VehicleStat_SeatingAbbrev',
}

/**
 * The dealership (lot R9 of the rigging plan; Q8 to Q10 of DjamZ): a window of its own where a vehicle or a drone of
 * the shelves is chosen, mods are added to it or taken off, the slots and the whole price are seen at once, then
 * bought through the shop's till (`SR5Shop.checkout`, option `assemble`), with the checks of any purchase. The mods
 * arrive aboard waiting to be installed by the book (Rigger 5.0 p. 153), from the workshop of the deployed drone;
 * the gamemaster may fit them at once, within the slots (lot R8).
 */
export class SR5DealershipWindow extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static _instance = null

  /** Open the dealership, or bring it forward; `vehicle` an itemVehicle of the shelves to start from */
  static open({
    actor = null, vehicle = null
  } = {
  }) {
    let win = SR5DealershipWindow._instance
    if (!win?.rendered) {
      win = new SR5DealershipWindow()
      SR5DealershipWindow._instance = win
    }
    if (actor) win._buyerId = actor.id
    const ready = vehicle?.pack ? win.setVehicle(vehicle.uuid) : Promise.resolve()
    ready.then(() => win.render(true)).then(() => win.bringToFront?.()).catch(err => {
      console.error('SR5 Dealership: failed to open', err)
      ui.notifications?.error(L('SR5.ShopWindowFailed'))
    })
    return win
  }

  static DEFAULT_OPTIONS = {
    id: 'sr5-dealership',
    classes: ['sr5', 'sr-application', 'sr-shop-window', 'sr-dealership'],
    position: {
      width: 1250, height: 820
    },
    window: {
      title: 'SR5.Dealership',
      icon: 'fas fa-car-side',
      resizable: true,
    },
    actions: {
      selectModel: SR5DealershipWindow.#onSelectModel,
      selectShelf: SR5DealershipWindow.#onSelectShelf,
      addMod: SR5DealershipWindow.#onAddMod,
      removeMod: SR5DealershipWindow.#onRemoveMod,
      toggleFit: SR5DealershipWindow.#onToggleFit,
      viewItem: SR5DealershipWindow.#onViewItem,
      buy: SR5DealershipWindow.#onBuy,
      clearBuild: SR5DealershipWindow.#onClearBuild,
    },
  }

  static PARTS = {
    dealership: {
      template: 'systems/sr5/templates/interface/dealership-window.hbs',
      scrollable: ['.sr-dealer-models', '.sr-dealer-catalog', '.sr-dealer-center'],
    },
  }

  constructor(options = {
  }) {
    super(options)
    this._buyerId = null
    this._equip = false
    this._express = false
    // The vehicle chosen (its document, read from its shelf) and the mods added: [{key, uuid, source, fitted}]
    this._vehicle = null
    this._mods = []
    this._modCategory = ''
    this._modelSearch = ''
    this._modSearch = ''
    // The shelf shown on the left: vehicles or drones, apart (Adrore's feedback C8)
    this._shelf = 'vehicles'
  }

  /** Choose a model: the build starts again from it */
  async setVehicle(uuid) {
    const vehicle = await fromUuid(uuid)
    if (vehicle?.type !== 'itemVehicle') return
    this._vehicle = vehicle
    this._mods = []
    this._shelf = isDroneModel(vehicle.system) ? 'drones' : 'vehicles'
  }

  /** Add a mod of the shelves to the build; one the gamemaster fits at once is refused past the slots (lot R8) */
  async addMod(uuid) {
    if (!this._vehicle) return ui.notifications.warn(L('SR5.WARN_DealerNoVehicle'))
    const source = await fromUuid(uuid)
    if (source?.type !== 'itemVehicleMod') return ui.notifications.warn(L('SR5.WARN_WorkshopNotAMod'))
    if (!SR5Shop.sellableSource(source)) return ui.notifications.warn(game.i18n.format('SR5.WARN_ShopNotForSale', {
      name: source.name
    }))
    const mod = {
      key: foundry.utils.randomID(), uuid, source, fitted: false
    }
    this._mods.push(mod)
    // The gamemaster's mods are fitted at once when they fit (Adrore's feedback C8); one past the slots or the points
    // stays waiting to be installed, with the refusal's warning
    if (game.user.isGM) mod.fitted = !this.#fitRefused(mod)
    this.render()
  }

  /** Whether fitting this mod at once goes past the slots, or the points of a drone (lot R8): the same refusal as on a
   *  drone, which warns and may let it pass by the rule locks */
  #fitRefused(mod) {
    if (this.#points()) {
      const refusal = buildPointsRefusal(vehicleStats(this._vehicle.system), this.#buildMods(), {
        ...mod.source.system, slots: {
          value: pricedModData(mod.source, this._vehicle).slots
        }
      })
      const key = refusal?.floor !== undefined ? 'SR5.WARN_DroneModBodyFloor' : refusal?.attribute ? 'SR5.WARN_DroneModAttributeCap' : 'SR5.WARN_DroneModPointsFull'
      return !!refusal && refuseByRule('objects', key, {
        name: mod.source.name, needed: refusal.needed, free: refusal.free, cap: refusal.cap, floor: refusal.floor,
        attribute: L(SR5.vehicleAttributes[refusal.attribute] ?? '')
      })
    }
    const refusal = buildSlotsRefusal(this.#capacity(), this.#buildMods(), mod.source)
    return !!refusal && refuseByRule('objects', 'SR5.WARN_VehicleModSlotsFull', {
      name: mod.source.name, needed: refusal.needed, free: refusal.free,
      category: L(SR5.vehicleModType[refusal.category])
    })
  }

  /* -------------------------------------------- */
  /*  Data                                        */
  /* -------------------------------------------- */

  /** The mods of the build as the gauges read them: the vehicle's own (as delivered), then the ones added */
  #buildMods() {
    const own = (this._vehicle?.system?.vehiclesMod ?? []).map(m => ({
      ...m, pending: !(isFactoryMod(m) || m.system?.isActive === true)
    }))
    // Their slots as on this vehicle (a count multiplied by the rating or an attribute of the vehicle)
    const added = this._mods.map(m => ({
      name: m.source.name, pending: !m.fitted, system: {
        ...m.source.system, slots: {
          value: pricedModData(m.source, this._vehicle).slots
        }
      },
    }))
    return [...own, ...added]
  }

  #capacity() {
    return dealerCapacity(this._vehicle?.system?.attributes?.body)
  }

  /** Under the optional Modification Points, a drone has one pool of points (Rigger 5.0 p. 126-128) */
  #points() {
    return usesModPoints(droneModRule(), this._vehicle?.system?.type)
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const isGM = game.user.isGM
    const equip = this._equip && isGM
    const buyers = SR5Shop.getBuyers({
      equip
    })
    if (this._buyerId && !buyers.some(a => a.id === this._buyerId)) this._buyerId = null
    if (!this._buyerId) this._buyerId = SR5Shop.defaultBuyerId(buyers)
    const buyer = buyers.find(a => a.id === this._buyerId) ?? null
    const free = equip || SR5Shop.creationMode
    const balance = buyer ? SR5Shop.balance(buyer) : 0

    // The shelves: the vehicles and the mods the shop sells, read once per session with the shop's own index
    const ready = new SR5ShopWorldSource().isReady()
    if (!ready) SR5ShopWorldSource.index().then(() => this.rendered && this.render())
    const excluded = SR5ShopStock.excludedPacks
    const index = ready ? await SR5ShopWorldSource.index() : []
    // A mod has no price of its own until it is on a vehicle (R5 p. 156): its list price is its base
    const listPrice = entry => entry.type === 'itemVehicleMod' ? Number(entry.system?.price?.base) || 0 : SR5ShopCatalog.describe(entry).price
    const onShelf = entry => SR5ShopStock.canSell(entry, {
      equip, excluded
    }) && (equip || listPrice(entry) > 0)
    const row = entry => {
      const d = SR5ShopCatalog.describe(entry)
      return {
        uuid: entry.uuid, name: entry.name, img: entry.img, search: entry.name.toLowerCase(),
        price: yen(listPrice(entry)), availability: availabilityLabel(d.availability, d.legality),
        category: entry.system?.type ? L(SR5.vehicleModType[entry.system.type] ?? '') : '',
      }
    }
    const vehicle = this._vehicle
    // The vehicles and the drones apart, by category then name, each with its figures (Adrore's feedback C8)
    const showcase = system => vehicleShowcase(system).map(s => ({
      ...s, label: L(STAT_LABELS[s.key])
    }))
    const models = index.filter(e => e.type === 'itemVehicle' && onShelf(e)).map(e => ({
      ...row(e), system: e.system, stats: showcase(e.system), selected: e.uuid === vehicle?.uuid
    }))
    const categoryLabels = {
      ...SR5.vehicleCategories, ...SR5.droneCategories
    }
    context.shelves = ['vehicles', 'drones'].map(key => ({
      key, label: L(key === 'drones' ? 'SR5.DealerShelfDrones' : 'SR5.DealerShelfVehicles'), selected: key === this._shelf,
      count: models.filter(m => isDroneModel(m.system) === (key === 'drones')).length,
    }))
    // The banner of the shelf, read in the Megapack's banner folder (agreed with Élise and DjamZ, 14/10)
    context.banner = await vendorBanner(this._shelf === 'drones' ? 'droneDealer' : 'ordinaryCars')
    context.modelGroups = dealerShelf(models, this._shelf).map(g => ({
      label: g.key ? L(categoryLabels[g.key]) : L('SR5.DealerOtherCategory'), models: g.rows
    }))
    context.catalog = vehicle ? index.filter(e => e.type === 'itemVehicleMod' && onShelf(e) &&
      (!this._modCategory || e.system?.type === this._modCategory)).map(row) : []
    context.categories = MOD_CATEGORIES.map(key => ({
      key, label: L(SR5.vehicleModType[key]), selected: key === this._modCategory
    }))
    context.loading = !ready
    context.loadingLabel = game.i18n.format('SR5.ShopLoading', SR5ShopWorldSource.progress)
    context.modelSearch = this._modelSearch
    context.modSearch = this._modSearch

    Object.assign(context, {
      isGM, equip, free, express: this._express, expressOffered: !!currentExpress(),
      buyers: buyers.map(a => ({
        id: a.id, name: a.name, selected: a.id === this._buyerId
      })),
      buyer, balanceLabel: buyer ? yen(balance) : '',
    })
    if (!vehicle) return context

    // The lines of the build and their price on this vehicle, as the till will charge them
    const vehicleDescribed = SR5ShopCatalog.describe(vehicle)
    const vehicleUnit = buyer ? dealerPrice(vehicleDescribed.price, vehicle, buyer.items) : vehicleDescribed.price
    const lines = [{
      price: vehicleUnit, availability: vehicleDescribed.availability, legality: vehicleDescribed.legality,
    }]
    const points = this.#points()
    // The free +1 is once per drone: one line of the build takes it, not each upgrade (review 40)
    const pointLines = points ? modPointsLines(this.#buildMods(), m => !m.pending, vehicleStats(vehicle.system)) : []
    const ownCount = (vehicle.system.vehiclesMod ?? []).length
    const own = (vehicle.system.vehiclesMod ?? []).map((m, i) => ({
      name: m.name, factory: isFactoryMod(m), price: yen(modCost(m)), fitted: isFactoryMod(m) || m.system?.isActive === true,
      slots: points ? pointLines[i] : Number(m.system?.slots?.value) || 0, category: L(SR5.vehicleModType[m.system?.type] ?? 'SR5.VehicleModWorkshopOther'),
    }))
    const added = this._mods.map((m, i) => {
      const {
        price, slots
      } = pricedModData(m.source, vehicle)
      const d = SR5ShopCatalog.describe(m.source)
      lines.push({
        price, availability: d.availability, legality: d.legality
      })
      const s = m.source.system
      return {
        key: m.key, uuid: m.uuid, name: m.source.name, img: m.source.img, fitted: m.fitted, price: yen(price),
        slots: points ? pointLines[ownCount + i] : slots,
        threshold: Number(s.threshold?.value) || 0,
        tools: s.tools ? L(SR5.vehicleModTools[s.tools] ?? s.tools) : '—',
        category: L(SR5.vehicleModType[s.type] ?? 'SR5.VehicleModWorkshopOther'),
        availability: availabilityLabel(d.availability, d.legality),
      }
    })
    const totals = dealerTotals(lines)
    const terms = this._express ? currentExpress() : null
    const waits = lineWaits({
      delayed: deliveryDelayed(buyer), availability: totals.availability, free
    })
    const extra = waits && terms ? lines.reduce((sum, l, i) => sum + expressCost(i === 0 ? vehicleDescribed.price : l.price, terms), 0) : 0
    const total = totals.total + extra
    const gauges = points ? [{
      ...dealerPointsGauge(vehicleStats(vehicle.system), this.#buildMods()), label: L('SR5.DroneModPoints')
    }] : dealerGauges(this.#capacity(), this.#buildMods()).map(g => ({
      ...g, label: L(SR5.vehicleModType[g.key])
    }))
    const dealer = !!buyer && vehicleUnit < vehicleDescribed.price && !!dealerEffectFor(vehicle)
    context.build = {
      name: vehicle.name, uuid: vehicle.uuid, stats: showcase(vehicle.system),
      img: workshopImage(vehicle.img, {
        type: vehicle.system.type, category: vehicle.system.category
      }),
      gaugesLeft: gauges.slice(0, 3), gaugesRight: gauges.slice(3), over: gauges.some(g => g.over), points,
      own, added,
      vehicleLabel: yen(vehicleUnit), vehicleListLabel: dealer ? yen(vehicleDescribed.price) : '', dealer,
      modsLabel: yen(totals.total - vehicleUnit), extraLabel: extra ? yen(extra) : '', totalLabel: yen(total),
      availability: availabilityLabel(totals.availability, totals.legality), waits,
      afterLabel: buyer && !free ? yen(balance - total) : '', short: !!buyer && !free && total > balance,
      buyLabel: free ? (equip ? L('SR5.DealerEquip') : L('SR5.DealerTake')) : game.i18n.format('SR5.DealerBuy', {
        price: yen(total)
      }),
    }
    return context
  }

  _onRender(context, options) {
    super._onRender(context, options)
    const el = this.element
    // The two searches filter the rows in place: no redraw, the caret stays where it is
    const filter = (input, list) => {
      const apply = () => {
        const q = input.value.trim().toLowerCase()
        list?.querySelectorAll('[data-search]').forEach(li => {
          li.hidden = !!q && !li.dataset.search.includes(q)
        })
      }
      input.addEventListener('input', () => {
        this[input.dataset.dealerSearch] = input.value
        apply()
      })
      apply()
    }
    el.querySelectorAll('[data-dealer-search]').forEach(input => filter(input, el.querySelector(input.dataset.target)))
    el.querySelector('[data-dealer-buyer]')?.addEventListener('change', event => {
      this._buyerId = event.target.value || null
      this.render()
    })
    el.querySelector('[data-dealer-category]')?.addEventListener('change', event => {
      this._modCategory = event.target.value
      this.render()
    })
    el.querySelector('[data-dealer-equip]')?.addEventListener('change', event => {
      this._equip = event.target.checked
      this.render()
    })
    el.querySelector('[data-dealer-express]')?.addEventListener('change', event => {
      this._express = event.target.checked
      this.render()
    })
    // A vehicle or a mod dragged from a compendium onto the window
    el.addEventListener('dragover', event => event.preventDefault())
    el.addEventListener('drop', event => this.#onDrop(event))
  }

  async #onDrop(event) {
    event.preventDefault()
    let data
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'))
    } catch {
      return
    }
    if (data?.type !== 'Item' || !data.uuid) return
    const item = await fromUuid(data.uuid)
    if (item?.type === 'itemVehicle') {
      if (!SR5Shop.sellableSource(item)) return ui.notifications.warn(game.i18n.format('SR5.WARN_ShopNotForSale', {
        name: item.name
      }))
      await this.setVehicle(item.uuid)
      return this.render()
    }
    return this.addMod(data.uuid)
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onSelectModel(event, target) {
    await this.setVehicle(target.closest('[data-uuid]').dataset.uuid)
    this.render()
  }

  static #onSelectShelf(event, target) {
    this._shelf = target.dataset.shelf === 'drones' ? 'drones' : 'vehicles'
    this.render()
  }

  static #onAddMod(event, target) {
    return this.addMod(target.closest('[data-uuid]').dataset.uuid)
  }

  static #onRemoveMod(event, target) {
    const key = target.closest('[data-key]').dataset.key
    this._mods = this._mods.filter(m => m.key !== key)
    this.render()
  }

  static #onClearBuild() {
    this._mods = []
    this.render()
  }

  /** The gamemaster fits a mod at once, or leaves it waiting to be installed (Q7 of DjamZ) */
  static #onToggleFit(event, target) {
    if (!game.user.isGM) return
    const mod = this._mods.find(m => m.key === target.closest('[data-key]').dataset.key)
    if (!mod) return
    if (!mod.fitted && this.#fitRefused(mod)) return this.render()
    mod.fitted = !mod.fitted
    this.render()
  }

  static async #onViewItem(event, target) {
    const item = await fromUuid(target.closest('[data-uuid]').dataset.uuid)
    item?.sheet?.render(true)
  }

  /** Buy the build: the till checks it as any purchase, the vehicle arrives with its mods aboard */
  static async #onBuy() {
    if (!this._vehicle) return ui.notifications.warn(L('SR5.WARN_DealerNoVehicle'))
    const equip = this._equip && game.user.isGM
    const buyer = SR5Shop.getBuyers({
      equip
    }).find(a => a.id === this._buyerId)
    const lines = [{
      uuid: this._vehicle.uuid, quantity: 1, name: this._vehicle.name
    }, ...this._mods.map(m => ({
      uuid: m.uuid, quantity: 1, name: m.source.name, fitted: m.fitted
    }))]
    const done = await SR5Shop.checkout(buyer, lines, {
      equip, express: this._express, assemble: true
    })
    if (done) {
      this._mods = []
      this.render()
    }
  }

  /** The sidebar button, next to the shop's */
  static onRenderSidebar(sidebar) {
    const menu = sidebar?.element?.querySelector('#sidebar-tabs > menu')
    if (!menu || menu.querySelector('[data-sr5-dealership]')) return
    const shop = menu.querySelector('[data-sr5-shop]')?.closest('li')
    const li = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ui-control plain icon fa-solid fa-car-side'
    button.dataset.sr5Dealership = ''
    button.dataset.tooltip = L('SR5.Dealership')
    button.setAttribute('aria-label', L('SR5.Dealership'))
    button.addEventListener('click', () => SR5DealershipWindow.open())
    li.append(button)
    if (shop) shop.after(li)
    else menu.append(li)
  }
}
