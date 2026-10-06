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
import {
  SR5ShopCatalog
} from './shop-catalog.js'
import {
  SR5ShopAvailability
} from './shop-availability.js'
import {
  lineWaits, deliveryDelayed, currentExpress, expressCost, orderHours, newOrder, addOrders, testedHours, cardResult, cardSurcharge, surchargedUnit,
  requestRegister
} from './shop-orders.js'

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

  /**
   * The default buyer: the user's character, else the actor of the token they
   * control (how a gamemaster points at someone), else the only actor they own.
   */
  static defaultBuyerId(buyers) {
    const ids = new Set(buyers.map(a => a.id))
    if (game.user.character && ids.has(game.user.character.id)) return game.user.character.id
    const controlled = canvas?.tokens?.controlled?.map(t => t.actor?.id).find(id => ids.has(id))
    if (controlled) return controlled
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
   * Availability and rating allowed at creation: the level the gamemaster chose in the
   * world settings, the book's 12 and 6 by default (SR5 p. 66, p. 420; DjamZ's ruling, 2026-10-05).
   */
  static get creationLimits() {
    return SR5ShopCatalog.creationLimits(game.settings.get('sr5', 'sr5ShopCreationLevel'), {
      availability: game.settings.get('sr5', 'sr5ShopCreationMaxAvailability'),
      rating: game.settings.get('sr5', 'sr5ShopCreationMaxRating'),
    })
  }
  /**
   * The documents to create for `quantity` of `source`.
   *
   * Types that carry their own quantity become one stack; the others are
   * created as that many separate items.
   */
  /**
   * May the shop sell from this document? A compendium entry (the shelves), or an item on this vendor's
   * counter; never an item an actor carries, whose copy would bring its owner's state along — a
   * credstick its money, for one (R1, Anton: 3 500 ¥ for nothing).
   * @param {Item} source
   * @param {{actorUuid: string, storageId: string}|null} [counter] the vendor's counter, at a vendor's
   */
  static sellableSource(source, counter = null) {
    if (!source) return false
    if (counter?.actorUuid && source.parent?.uuid === counter.actorUuid &&
      source.system?.storedIn === counter.storageId) return true
    return !!source.pack && !source.isEmbedded
  }

  /**
   * What must not travel with a copy the shop hands over: the money loaded on a credstick is bearer
   * cash (SR5 p. 445), so a stick sold or put on a counter comes empty (R1, Anton).
   */
  static stripCarried(itemData) {
    if (itemData?.system?.funds && typeof itemData.system.funds === 'object') itemData.system.funds.value = 0
    return itemData
  }

  static _itemPayload(source, quantity, grade = null) {
    const itemData = SR5Shop.stripCarried(source.toObject())
    delete itemData._id
    // Where it was bought: a vendor buying it back reads its price there, not on the copy (lot C)
    if (source.pack) foundry.utils.setProperty(itemData, 'flags.sr5.shopSource', source.uuid)
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
    equip = false, express = false, messageId = null, userId = game.user.id, cashToken = null
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
    // The card serves its own buyer, once: cashed, only the gamemaster's cashing of it still reads it (R2)
    const card = {
      buyerId: actor.id, cashToken
    }
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
      // The shelves only: an item an actor carries is not for sale here, whatever uuid a request names (R1)
      if (!equip && !SR5Shop.sellableSource(source)) {
        ui.notifications.warn(game.i18n.format('SR5.WARN_ShopNotForSale', {
          name: source.name
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
      // Creation caps availability and rating (SR5 p. 66, p. 420), at the level the gamemaster
      // set (DjamZ's ruling, 2026-10-05); Equip mode is how the gamemaster goes past them
      const described = SR5ShopCatalog.describe(source, grade)
      const block = !equip && SR5Shop.creationMode ?
        SR5ShopCatalog.creationBlock(described, SR5Shop.creationLimits) :
        null
      if (block) {
        ui.notifications.warn(game.i18n.format(`SR5.WARN_ShopCreationLimit_${block}`, {
          name: SR5Shop.gradedName(source.name, grade), ...SR5Shop.creationLimits,
          source: game.i18n.localize(`SR5.ShopCreationSource_${SR5Shop.creationLimits.source}`),
        }))
        continue
      }
      const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1))
      const base = SR5Shop.gradedPrice(source.system, grade)
      // The surcharge that bought dice on the card is paid (SR5 p. 420); the search time and the express
      // surcharge stay on the base price (DjamZ's ruling, 05/10)
      const unit = surchargedUnit(base, cardSurcharge(messageId, line.uuid, userId, card))
      resolved.push({
        source, quantity, unit, grade, total: unit * quantity, baseTotal: base * quantity,
        name: SR5Shop.gradedName(source.name, grade),
        availability: Number(described.availability) || 0,
      })
    }
    if (!resolved.length) return false

    const free = equip || SR5Shop.creationMode
    // SR5 p. 420: what has an availability is found after the search time, and waits on the buyer
    const delayed = deliveryDelayed()
    const terms = express ? currentExpress() : null
    for (const line of resolved) {
      line.waits = lineWaits({
        delayed, availability: line.availability, free
      })
      line.extra = line.waits ? expressCost(line.baseTotal, terms) : 0
    }
    const total = resolved.reduce((sum, line) => sum + line.total + line.extra, 0)
    const balance = SR5Shop.balance(actor)

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

    const payload = [], orders = []
    const now = game.time.worldTime
    for (const line of resolved) {
      if (!line.waits) {
        payload.push(...SR5Shop._itemPayload(line.source, line.quantity, line.grade))
        continue
      }
      const order = newOrder(line, {
        hours: orderHours(SR5Shop.searchHours({
          ...line, total: line.baseTotal
        }, messageId, userId, card), line.extra ? terms : null),
        express: !!line.extra, extra: line.extra, now,
      })
      line.order = order
      orders.push(order)
    }

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
    const created = payload.length ? await actor.createEmbeddedDocuments('Item', payload) : []
    await addOrders(actor, orders)
    // The active GM enters the orders in his ledger, priced by himself, within this debit
    const debit = (created ?? []).find(item => item.type === 'itemNuyen' && item.system?.type === 'loss')
    if (!free && orders.length && debit) await requestRegister(actor, orders, debit.id)

    const rows = resolved.map(line =>
      `<li>${SR5Shop.lineLabel(line.name, line.quantity)} — ${(line.total + line.extra).toLocaleString()}&yen;${
        SR5Shop.orderNote(line.order)}</li>`).join('')
    const detail = resolved.length > 1 || orders.length ? `<ul>${rows}</ul>` : ''
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

  /**
   * The search time of a line that waits, worked out here from the line's
   * price and the test its card recorded (SR5 p. 420), never from a time the
   * player sends. Bought without a test, the time of the table, as for one
   * net hit (Élise's decision, 05/10).
   */
  static searchHours(line, messageId = null, userId = null, context = {
  }) {
    return testedHours(SR5ShopAvailability.delayFor(line.total), cardResult(messageId, line.source.uuid, userId, context))
  }

  /** " — on order, arrives on …" after a line that waits. */
  static orderNote(order) {
    if (!order) return ''
    return ` — ${game.i18n.format(order.express ? 'SR5.ShopOrderNoteExpress' : 'SR5.ShopOrderNote', {
      date: game.time.calendar?.format?.(order.due) ?? ''
    })}`
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
