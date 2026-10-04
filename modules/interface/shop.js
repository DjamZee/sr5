import {
  SR5_EntityHelpers 
} from '../entities/helpers.js'
import {
  SR5_SystemHelpers 
} from '../system/utilitySystem.js'
import {
  SR5
} from '../config.js'
import {
  SR5ShopStock
} from './shop-stock.js'
import {
  SR5ShopGrades
} from './shop-grades.js'

/**
 * Purchases made from the compendium browser.
 *
 * A purchase is two documents: the gear itself, and an `itemNuyen` transaction
 * of type `loss` that the actor's nuyen total already knows how to subtract
 * (see `helpers.js`, where a modifier whose type ends in `_loss` is removed
 * from the value). Nothing writes `system.nuyen.value` directly.
 */
export class SR5Shop {

  /** Item types that carry their own quantity: they are bought as one stack. */
  static STACKABLE_TYPES = ['itemAmmunition', 'itemDrug', 'itemGear', 'itemWeapon']

  /**
   * The actors the current user may spend for, by the gamemaster's buyer rule
   * (`SR5ShopStock.isBuyer`); a player only sees those they own. In Equip mode,
   * every actor of the world for the gamemaster.
   */
  static getBuyers({
    equip = false
  } = {
  }) {
    return SR5ShopStock.buyers(game.actors, game.user, {
      equip: equip && game.user.isGM, ...SR5ShopStock.buyerRule,
    })
  }

  /** The grades offered for an augmentation, by the shop's mode and the world options. */
  static gradesFor(type, system, {
    equip = false
  } = {
  }) {
    if (!SR5ShopGrades.isGraded(type, system)) return []
    return SR5ShopGrades.available({
      augmentationType: system.type,
      // Equip mode places every grade, the world options aside — greyware still cyberware only
      all: equip,
      creation: SR5Shop.creationMode,
      gamma: game.settings.get('sr5', 'sr5ShopGradeGamma') === true,
      greyware: game.settings.get('sr5', 'sr5ShopGradeGreyware') === true,
    })
  }

  /** Unit price of `system`, regraded when a grade is chosen. */
  static gradedPrice(system, grade) {
    return grade ? SR5ShopGrades.price(system, grade) : SR5Shop.unitPrice(system)
  }

  /** The default buyer: the user's character, else the only actor they own. */
  static defaultBuyerId(buyers) {
    if (game.user.character && buyers.some(a => a.id === game.user.character.id)) {
      return game.user.character.id
    }
    return buyers.length === 1 ? buyers[0].id : null
  }

  /**
   * Can this entry go on the counter? A sellable type with a price, on one of
   * the shelves, and not flagged as a prototype — Equip mode skips the last two.
   */
  static isPurchasable(entry, {
    equip = false
  } = {
  }) {
    return SR5ShopStock.canSell(entry, {
      equip
    })
  }

  /**
   * What the character can actually spend.
   *
   * `system.nuyen.value` is the sum of every transaction, expenses included, so
   * it is not a balance. The sheet reads its total as gains minus losses (see
   * `money.hbs`, helpers `gainModifiersSum` / `lossModifiersSum`) and so do we,
   * otherwise a purchase would look affordable on a spent-out character.
   */
  static balance(actor) {
    const modifiers = actor?.system.nuyen?.modifiers ?? []
    const gains = SR5_EntityHelpers.modifiersOnlyPositivesSum(modifiers) || 0
    const losses = SR5_EntityHelpers.modifiersOnlyNegativesSum(modifiers) || 0
    return gains - losses
  }

  /** Unit price, falling back to the book value when nothing was derived. */
  static unitPrice(system) {
    return Number(system?.price?.value ?? system?.price?.base ?? 0) || 0
  }

  /**
   * Creation mode: gear is handed over without being charged.
   *
   * A character built outside Foundry arrives with its purchases already paid
   * for on paper, and a player fixing a badly entered item would be charged a
   * second time. DjamZ's ruling (2026-10-05): a world setting, in the
   * gamemaster's hands only — per user, a player could take free alphaware.
   */
  static get creationMode() {
    return game.settings.get('sr5', 'sr5ShopCreationMode') === true
  }

  /**
   * The documents to create for `quantity` of `source`.
   *
   * Types that carry their own quantity become one stack; the others are
   * created as that many separate items.
   */
  static _itemPayload(source, quantity, grade = null) {
    const itemData = source.toObject()
    delete itemData._id
    // The item computes Essence, price and availability from its grade itself
    if (grade) itemData.system.grade = grade
    const stackable = SR5Shop.STACKABLE_TYPES.includes(itemData.type) &&
      itemData.system.quantity !== undefined
    if (stackable) {
      itemData.system.quantity = quantity
      return [itemData]
    }
    const payload = []
    for (let i = 0; i < quantity; i++) payload.push(foundry.utils.deepClone(itemData))
    return payload
  }

  /** `Nom (x3)` when there is more than one. */
  static lineLabel(name, quantity) {
    return quantity > 1 ? `${name} (x${quantity})` : name
  }

  /**
   * Hand `lines` over to `actor` and charge for the lot in one transaction.
   *
   * Everything goes through here — a single buy button is a checkout of one
   * line — so the cart, the buy button and a purchase confirmed by an
   * availability test all write the same two things: the gear, and one
   * `itemNuyen` of type `loss` carrying the total.
   *
   * @param {Actor} actor
   * @param {Array<{uuid: string, quantity: number, grade?: string}>} lines
   * @param {object} [options]
   * @param {boolean} [options.equip] the gamemaster's Equip mode: free, no
   *   transaction, any actor, prototypes and every grade allowed
   * @returns {Promise<boolean>} whether the gear was added
   */
  static async checkout(actor, lines, {
    equip = false
  } = {
  }) {
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('SR5.WARN_ShopNoBuyer'))
      return false
    }
    if (!actor.isOwner) {
      ui.notifications.warn(game.i18n.localize('SR5.WARN_ShopNotOwner'))
      return false
    }
    if (!lines?.length) return false
    equip = equip && game.user.isGM
    // The buyer list is only a display: the gamemaster's rule is checked again at the till,
    // so a card cashed later or a call from a macro cannot spend for an actor outside it
    // (Élise's choice, 2026-10-05). Equip mode is the gamemaster's and skips it.
    if (!equip && !SR5ShopStock.isBuyer(actor, SR5ShopStock.buyerRule)) {
      ui.notifications.warn(game.i18n.format('SR5.WARN_ShopNotABuyer', {
        name: actor.name
      }))
      return false
    }

    // A line whose source has vanished from its compendium is dropped rather
    // than silently charged for; so is one the shop does not sell.
    const resolved = []
    for (const line of lines) {
      const source = await fromUuid(line.uuid)
      if (!source) {
        ui.notifications.warn(game.i18n.format('SR5.WARN_ShopItemGone', {
          name: line.name ?? line.uuid
        }))
        continue
      }
      if (!SR5ShopStock.canSell({
        documentName: 'Item', type: source.type, system: source.system, flags: source.flags,
        packId: source.pack
      }, {
        equip
      })) {
        ui.notifications.warn(game.i18n.format('SR5.WARN_ShopNotForSale', {
          name: source.name
        }))
        continue
      }
      // A grade the shop does not offer here falls back to none, never to a free upgrade
      const offered = SR5Shop.gradesFor(source.type, source.system, {
        equip
      })
      const grade = offered.includes(line.grade) ? line.grade : null
      const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1))
      const unit = SR5Shop.gradedPrice(source.system, grade)
      resolved.push({
        source, quantity, unit, grade, total: unit * quantity,
        name: SR5Shop.gradedName(source.name, grade),
      })
    }
    if (!resolved.length) return false

    const total = resolved.reduce((sum, line) => sum + line.total, 0)
    const balance = SR5Shop.balance(actor)
    const free = equip || SR5Shop.creationMode

    if (!free && total > balance) {
      ui.notifications.warn(game.i18n.format('SR5.WARN_ShopNotEnoughNuyen', {
        name: actor.name,
        price: total.toLocaleString(),
        balance: balance.toLocaleString(),
      }))
      return false
    }

    // Greyware on an Awakened character costs Magic (BTB p. 142): the buyer, or the gamemaster in
    // Equip mode, sees the penalty before anything is created and may cancel (DjamZ's ruling, 2026-10-05)
    const greyware = resolved
      .filter(line => line.grade === 'greyware')
      .reduce((sum, line) => sum + (SR5Shop._itemPayload(line.source, line.quantity, line.grade).length), 0)
    if (greyware && SR5ShopGrades.isAwakened(actor)) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: game.i18n.localize('SR5.ShopGreywareConfirmTitle')
        },
        content: `<p>${game.i18n.format('SR5.WARN_ShopGreywareAwakened', {
          name: actor.name, count: greyware
        })}</p>`,
        rejectClose: false,
      })
      if (!confirmed) return false
    }

    const payload = []
    for (const line of resolved) payload.push(...SR5Shop._itemPayload(line.source, line.quantity, line.grade))

    const labels = resolved.map(line => SR5Shop.lineLabel(line.name, line.quantity))
    const label = labels.length === 1 ?
      labels[0] :
      game.i18n.format('SR5.ShopPurchaseLines', {
        count: labels.length
      })

    if (!free) payload.push({
      name: game.i18n.format('SR5.ShopPurchaseOf', {
        name: label
      }),
      type: 'itemNuyen',
      img: 'systems/sr5/assets/img/items/itemNuyen.svg',
      system: {
        amount: total,
        type: 'loss',
        date: new Date().toISOString().slice(0, 10),
        description: game.i18n.format('SR5.ShopPurchaseDescription', {
          name: labels.join(', '), price: total.toLocaleString()
        }),
      },
    })

    SR5_SystemHelpers.srLog(3, `Shop: ${actor.name} ${equip ? 'is equipped with' : free ? 'receives' : 'buys'} ${label} (${total})`)
    await actor.createEmbeddedDocuments('Item', payload)

    const rows = resolved.map(line =>
      `<li>${SR5Shop.lineLabel(line.name, line.quantity)} — ${line.total.toLocaleString()}&yen;</li>`).join('')
    const detail = resolved.length > 1 ? `<ul>${rows}</ul>` : ''
    if (equip) {
      // Equip mode leaves a trace for the gamemaster alone (DjamZ's ruling, 2026-10-05)
      await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({
          actor
        }),
        whisper: game.users.filter(u => u.isGM).map(u => u.id),
        content: `<p>${game.i18n.format('SR5.ShopEquipChat', {
          actor: actor.name, name: label,
        })}</p>${detail}`,
      })
    } else if (!free) {
      // Creation mode charges nothing, so it says nothing to the table either.
      await foundry.documents.ChatMessage.create({
        speaker: foundry.documents.ChatMessage.getSpeaker({
          actor
        }),
        content: `<p>${game.i18n.format('SR5.ShopPurchaseChat', {
          actor: actor.name,
          name: label,
          price: total.toLocaleString(),
          balance: (balance - total).toLocaleString(),
        })}</p>${detail}`,
      })
    }

    ui.notifications.info(equip ?
      game.i18n.format('SR5.ShopEquipDone', {
        name: label, actor: actor.name
      }) :
      free ?
        game.i18n.format('SR5.ShopCreationDone', {
          name: label
        }) :
        game.i18n.format('SR5.ShopPurchaseDone', {
          name: label, price: total.toLocaleString()
        }))
    return true
  }

  /** `Nom (Alphaware)` when a grade was chosen. */
  static gradedName(name, grade) {
    return grade ? `${name} (${game.i18n.localize(SR5.augmentationGrades[grade])})` : name
  }

  /** Buy a single line — the buy button on a result row. */
  static async buy(actor, uuid, quantity = 1, {
    grade = null, equip = false
  } = {
  }) {
    return SR5Shop.checkout(actor, [{
      uuid, quantity, grade
    }], {
      equip
    })
  }
}
