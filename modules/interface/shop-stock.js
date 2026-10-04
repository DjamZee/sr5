/**
 * What the shop sells, and to whom.
 *
 * Shelves: the compendiums the gamemaster ticks, the item types that can be
 * sold at all, and the "not for sale / prototype" flag. Buyers: who may spend,
 * chosen by the gamemaster. Pure functions over documents, no DOM: the shop
 * window (lot B) and the gamemaster's shop (lot C) call them as they are.
 */
export class SR5ShopStock {

  /**
   * The item types a shop can sell. Fixed: qualities, spells, powers, martial
   * arts, spirit types and the like are never goods, whatever the table does.
   */
  static SELLABLE_TYPES = [
    'itemAmmunition', 'itemArmor', 'itemAugmentation', 'itemDevice', 'itemDrug', 'itemFocus',
    'itemGear', 'itemProgram', 'itemSin', 'itemStorage', 'itemVehicle', 'itemVehicleMod', 'itemWeapon',
  ]

  /** Who may buy: the four choices of the `sr5ShopBuyerMode` setting. */
  static BUYER_MODES = ['owned', 'folder', 'flag', 'folderOrFlag']

  /* -------------------------------------------- */
  /*  Shelves                                     */
  /* -------------------------------------------- */

  /** Compendiums left off the shelves. Stored as exclusions, so a new compendium is sold by default. */
  static get excludedPacks() {
    const value = game.settings.get('sr5', 'sr5ShopExcludedPacks')
    return Array.isArray(value) ? value : []
  }

  /** Is this compendium one of the shop's shelves? */
  static isShelf(packId, excluded = SR5ShopStock.excludedPacks) {
    return !excluded.includes(packId)
  }

  /** Is this type of item ever sold? */
  static isSellableType(type) {
    return SR5ShopStock.SELLABLE_TYPES.includes(type)
  }

  /** The gamemaster's "not for sale / prototype" flag. */
  static isNotForSale(document) {
    return foundry.utils.getProperty(document ?? {
    }, 'flags.sr5.notForSale') === true
  }

  /**
   * Can this compendium entry be put on the counter?
   *
   * @param {object} entry an index entry or a document: `docName`/`documentName`,
   *   `type`, `system`, `flags`, `packId`
   * @param {object} [options]
   * @param {boolean} [options.equip] the gamemaster's Equip mode: every shelf,
   *   and the prototypes too
   * @param {string[]} [options.excluded] packs left off the shelves
   */
  static canSell(entry, {
    equip = false, excluded
  } = {
  }) {
    const docName = entry?.docName ?? entry?.documentName
    if (docName !== 'Item' || !SR5ShopStock.isSellableType(entry.type)) return false
    if (entry.system?.price === undefined) return false
    if (equip) return true
    if (entry.packId && !SR5ShopStock.isShelf(entry.packId, excluded ?? SR5ShopStock.excludedPacks)) return false
    return !SR5ShopStock.isNotForSale(entry)
  }

  /* -------------------------------------------- */
  /*  Buyers                                      */
  /* -------------------------------------------- */

  /** Is `actor` inside `folderId`, sub-folders included? */
  static inFolder(actor, folderId) {
    if (!folderId) return false
    let folder = actor?.folder
    while (folder) {
      if (folder.id === folderId) return true
      folder = folder.folder
    }
    return false
  }

  /**
   * Does the gamemaster's rule make `actor` a buyer?
   *
   * `owned` is the behaviour before the setting existed: every player character.
   */
  static isBuyer(actor, {
    mode = 'owned', folderId = ''
  } = {
  }) {
    const flagged = foundry.utils.getProperty(actor ?? {
    }, 'flags.sr5.canShop') === true
    switch (mode) {
      case 'folder': return SR5ShopStock.inFolder(actor, folderId)
      case 'flag': return flagged
      case 'folderOrFlag': return flagged || SR5ShopStock.inFolder(actor, folderId)
      default: return actor?.type === 'actorPc'
    }
  }

  /**
   * The actors `user` may spend for, sorted by name.
   *
   * A player only ever sees the actors they own — observer or limited is not
   * enough to spend someone's money. In Equip mode the gamemaster sees every
   * actor of the world: NPCs, creatures, drones.
   */
  static buyers(actors, user, {
    equip = false, mode, folderId
  } = {
  }) {
    const list = [...actors].filter(actor => {
      if (equip) return user.isGM
      if (!SR5ShopStock.isBuyer(actor, {
        mode, folderId
      })) return false
      return user.isGM || actor.testUserPermission(user, 'OWNER')
    })
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }

  /* -------------------------------------------- */
  /*  Gamemaster switches                         */
  /* -------------------------------------------- */

  /**
   * `getHeaderControlsDocumentSheetV2`: the gamemaster's two switches, in the
   * header menu of every sheet rather than in the sheet templates —
   * "Not for sale / prototype" on an item, "Can shop" on an actor.
   */
  static onHeaderControls(app, controls) {
    if (!game.user.isGM) return
    const document = app.document
    let flag, on, off
    if (document?.documentName === 'Item' && SR5ShopStock.isSellableType(document.type)) {
      flag = 'notForSale'; on = 'SR5.ShopNotForSaleOff'; off = 'SR5.ShopNotForSaleOn'
    } else if (document?.documentName === 'Actor') {
      flag = 'canShop'; on = 'SR5.ShopCanShopOff'; off = 'SR5.ShopCanShopOn'
    } else return
    const look = (active) => ({
      icon: active ? 'fas fa-store-slash' : 'fas fa-store', label: active ? on : off,
    })
    controls.push({
      ...look(document.getFlag('sr5', flag) === true),
      action: `sr5Shop-${flag}`,
      onClick: async (event) => {
        // Read at click time: the header menu is built once, with the window
        const active = document.getFlag('sr5', flag) === true
        // currentTarget is gone once the event has been dispatched, so it is taken now
        const button = event?.currentTarget ?? app.element?.querySelector(`[data-action="sr5Shop-${flag}"] button`)
        // A locked compendium refuses the write: one message of ours, rather than
        // letting Foundry raise its own error on top of it
        if (document.pack && game.packs.get(document.pack)?.locked) {
          ui.notifications.warn(game.i18n.localize('SR5.WARN_ShopFlagLocked'))
          return
        }
        await document.setFlag('sr5', flag, !active)
        // ...and a render does not rebuild it, so the entry is relabelled in place
        const now = look(!active)
        button?.querySelector('.control-icon')?.setAttribute('class', `control-icon fa-fw ${now.icon}`)
        const label = button?.querySelector('.control-label')
        if (label) label.innerText = game.i18n.localize(now.label)
        // An open shop drops what it had read of that entry and redraws, so the
        // buy button follows the flag without a refresh
        const browser = game.sr5?.compendiumBrowser?._instance
        const entry = browser?._indexCache?.find(e => e.uuid === document.uuid)
        if (entry) {
          entry._detailed = false
          if (browser.rendered) browser.render()
        }
      },
    })
  }

  /** The buyer rule as the settings hold it. */
  static get buyerRule() {
    return {
      mode: game.settings.get('sr5', 'sr5ShopBuyerMode'),
      folderId: game.settings.get('sr5', 'sr5ShopBuyerFolder'),
    }
  }
}
