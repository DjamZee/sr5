import {
  SR5ShopStock
} from './shop-stock.js'

/**
 * The gamemaster's shop settings: which compendiums are shelves, and who may buy.
 *
 * Opened from the system settings (`sr5ShopConfigMenu`). Plain world settings
 * underneath (`sr5ShopExcludedPacks`, `sr5ShopBuyerMode`, `sr5ShopBuyerFolder`),
 * so the shop window and the gamemaster's shop read the same values.
 */
export class SR5ShopConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {

  static DEFAULT_OPTIONS = {
    id: 'sr5-shop-config',
    tag: 'form',
    classes: ['sr5', 'sr-application', 'sr-shop-config'],
    position: {
      width: 520, height: 'auto'
    },
    window: {
      title: 'SR5.SETTINGS_ShopConfig_T', icon: 'fas fa-store', resizable: true
    },
    form: {
      handler: SR5ShopConfig.#onSubmit, closeOnSubmit: true
    },
  }

  static PARTS = {
    form: {
      template: 'systems/sr5/templates/interface/shop-config.hbs'
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    const excluded = SR5ShopStock.excludedPacks
    context.packs = game.packs
      .filter(pack => pack.documentName === 'Item')
      .map(pack => ({
        id: pack.collection,
        label: pack.metadata.label,
        source: pack.metadata.packageName ?? pack.metadata.package ?? '',
        checked: SR5ShopStock.isShelf(pack.collection, excluded),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

    const {
      mode, folderId
    } = SR5ShopStock.buyerRule
    context.modes = SR5ShopStock.BUYER_MODES.map(key => ({
      key, label: `SR5.ShopBuyerMode_${key}`, checked: key === mode,
    }))
    // Actor folders as a tree, indented by depth
    context.folders = game.folders
      .filter(folder => folder.type === 'Actor')
      .map(folder => ({
        id: folder.id,
        label: `${'  '.repeat(Math.max(0, (folder.depth ?? 1) - 1))}${folder.name}`,
        selected: folder.id === folderId,
      }))
    return context
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object
    const shelves = new Set(Object.entries(data)
      .filter(([key, value]) => key.startsWith('pack.') && value)
      .map(([key]) => key.slice(5)))
    const excluded = game.packs
      .filter(pack => pack.documentName === 'Item' && !shelves.has(pack.collection))
      .map(pack => pack.collection)
    await game.settings.set('sr5', 'sr5ShopExcludedPacks', excluded)
    const mode = SR5ShopStock.BUYER_MODES.includes(data.buyerMode) ? data.buyerMode : 'owned'
    await game.settings.set('sr5', 'sr5ShopBuyerMode', mode)
    await game.settings.set('sr5', 'sr5ShopBuyerFolder', data.buyerFolder ?? '')
  }
}
