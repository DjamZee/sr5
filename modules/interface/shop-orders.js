/**
 * Purchases that arrive after the search time of SR5 p. 420 (table Délais de
 * recherche), counted on the world clock.
 *
 * An order is paid when it is placed and waits on the buyer, in
 * `flags.sr5.shopOrders`, until its due time. The calendar's deadlines then
 * give the gamemaster a card with a "Deliver" button: nothing reaches the
 * sheet without that click. The gamemaster may also deliver early or cancel
 * (full refund); a player may only ask for a cancellation, which the
 * gamemaster confirms, as with a buy-back.
 */
import {
  updateLedger
} from '../system/gm-ledger.js'

export const ORDERS_FLAG = 'shopOrders'
export const DELIVERY_SETTING = 'sr5ShopDelivery'
export const EXPRESS_SETTING = 'sr5ShopExpress'
export const EXPRESS_SURCHARGE_SETTING = 'sr5ShopExpressSurcharge'
export const EXPRESS_FACTOR_SETTING = 'sr5ShopExpressFactor'
const HOUR = 3600

/* -------------------------------------------- */
/*  Pure rules                                  */
/* -------------------------------------------- */

/**
 * Whether a line waits: only goods with an availability rating are searched
 * for (SR5 p. 419: "Les objets sans Disponibilité peuvent être achetés sans
 * soucis"), and what lies on a vendor's counter is already found.
 */
export function lineWaits({
  delayed, availability, onCounter = false, free = false
}) {
  return !!delayed && !free && !onCounter && Number(availability) > 0
}

/**
 * Express delivery is not in the book. Arbitrage de DjamZ (05/10): a world
 * option, off by default, that costs a share of the base price and divides the
 * search time.
 */
export function expressTerms({
  enabled, surcharge, factor
}) {
  if (!enabled) return null
  return {
    surcharge: Math.max(0, Number(surcharge) || 0),
    factor: Math.max(1, Number(factor) || 1),
  }
}

export function expressCost(basePrice, terms) {
  return terms ? Math.round(Math.max(0, basePrice) * terms.surcharge / 100) : 0
}

export function orderHours(hours, terms) {
  const h = Math.max(0, Number(hours) || 0)
  return terms ? h / terms.factor : h
}

export function dueTime(now, hours) {
  return Math.round(now + hours * HOUR)
}

/**
 * What express adds to an availability card: the lines found that wait, each
 * at its base price (the surcharge dice not counted), as the till charges it.
 */
export function cardExpressExtra(results, terms) {
  return (results ?? []).filter(r => r.obtained && Number(r.availability) > 0)
    .reduce((sum, r) => sum + expressCost(Number(r.basePrice) || 0, terms), 0)
}

/** The orders the clock has passed and the gamemaster has not been told of yet. */
export function freshlyDue(orders, now) {
  return (orders ?? []).filter(o => now >= o.due && !o.notified)
}

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

function setting(key, fallback) {
  try {
    return game.settings.get('sr5', key)
  } catch {
    return fallback
  }
}

export function deliveryDelayed() {
  return setting(DELIVERY_SETTING, 'delayed') === 'delayed'
}

export function currentExpress() {
  return expressTerms({
    enabled: setting(EXPRESS_SETTING, false),
    surcharge: setting(EXPRESS_SURCHARGE_SETTING, 25),
    factor: setting(EXPRESS_FACTOR_SETTING, 2),
  })
}

export function registerOrderSettings() {
  // SR5 p. 420: the goods are found after the search time. "Immediate" keeps the shop as it was
  game.settings.register('sr5', DELIVERY_SETTING, {
    name: 'SR5.SETTINGS_ShopDelivery_T',
    hint: 'SR5.SETTINGS_ShopDelivery_D',
    scope: 'world',
    config: true,
    type: String,
    default: 'delayed',
    choices: {
      delayed: 'SR5.SETTINGS_ShopDeliveryDelayed',
      immediate: 'SR5.SETTINGS_ShopDeliveryImmediate',
    },
  })
  // Arbitrage de DjamZ (05/10): paying to be delivered sooner is a house rule, off by default;
  // +25 % of the base price for half the time, better than the surcharge of p. 420 on purpose
  game.settings.register('sr5', EXPRESS_SETTING, {
    name: 'SR5.SETTINGS_ShopExpress_T',
    hint: 'SR5.SETTINGS_ShopExpress_D',
    scope: 'world', config: true, type: Boolean, default: false,
  })
  game.settings.register('sr5', EXPRESS_SURCHARGE_SETTING, {
    name: 'SR5.SETTINGS_ShopExpressSurcharge_T',
    hint: 'SR5.SETTINGS_ShopExpressSurcharge_D',
    scope: 'world', config: true, type: Number, default: 25,
  })
  game.settings.register('sr5', EXPRESS_FACTOR_SETTING, {
    name: 'SR5.SETTINGS_ShopExpressFactor_T',
    hint: 'SR5.SETTINGS_ShopExpressFactor_D',
    scope: 'world', config: true, type: Number, default: 2,
  })
}

/* -------------------------------------------- */
/*  Orders on the buyer                         */
/* -------------------------------------------- */

// The orders live in a flag of the buyer, which its owner can write. Not guarded on purpose (Élise's
// choice, 05/10): a player can already create any item on her own sheet, so guarding it would protect nothing
export function ordersOf(actor) {
  return foundry.utils.deepClone(actor?.getFlag?.('sr5', ORDERS_FLAG) ?? [])
}

/**
 * An order as written on the buyer.
 * @param {object} line {source, quantity, grade, name, total}
 * @param {object} options {hours, express, extra, vendor}
 */
export function newOrder(line, {
  hours, express = false, extra = 0, vendor = null, now
}) {
  return {
    id: foundry.utils.randomID(),
    uuid: line.source.uuid,
    name: line.name,
    grade: line.grade ?? null,
    quantity: line.quantity,
    paid: line.total + extra,
    express: !!express,
    placed: now,
    due: dueTime(now, hours),
    vendor,
    notified: false,
  }
}

export async function addOrders(actor, orders) {
  if (!orders.length) return
  await actor.setFlag('sr5', ORDERS_FLAG, [...ordersOf(actor), ...orders])
}

async function removeOrder(actor, id) {
  const orders = ordersOf(actor)
  const order = orders.find(o => o.id === id)
  if (!order) return null
  await actor.setFlag('sr5', ORDERS_FLAG, orders.filter(o => o.id !== id))
  return order
}

function transaction(type, amount, name, description = '') {
  return {
    name,
    type: 'itemNuyen',
    img: 'systems/sr5/assets/img/items/itemNuyen.svg',
    system: {
      amount, type, date: new Date().toISOString().slice(0, 10), description,
    },
  }
}

function lineLabel(order) {
  return order.quantity > 1 ? `${order.name} (x${order.quantity})` : order.name
}

function owners(actor) {
  return game.users.filter(u => !u.isGM && actor.testUserPermission(u, 'OWNER')).map(u => u.id)
}

async function tell(actor, key, order) {
  await foundry.documents.ChatMessage.create({
    speaker: foundry.documents.ChatMessage.getSpeaker({
      actor
    }),
    whisper: [...owners(actor), ...game.users.filter(u => u.isGM).map(u => u.id)],
    content: `<p>${game.i18n.format(key, {
      actor: foundry.utils.escapeHTML(actor.name), name: foundry.utils.escapeHTML(lineLabel(order)),
      price: Number(order.paid).toLocaleString(),
    })}</p>`,
  })
}

/* -------------------------------------------- */
/*  The gamemaster's ledger                     */
/* -------------------------------------------- */

// The flag is the player's; the ledger is the GM's. An order paid at a vendor's is written here by the
// GM's till, with its amount and its vendor: a cancellation refunds and debits only what is written here,
// and an order missing from it never touches a vendor (Quitterie's review, Élise's decision, 05/10)
export const ORDER_LEDGER = 'sr5ShopOrderLedger'

function isWriter() {
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

export function orderLedger() {
  try {
    return game.settings.get('sr5', ORDER_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

export async function ledgerOrders(entries) {
  if (!isWriter() || !Object.keys(entries).length) return
  await updateLedger(ORDER_LEDGER, ledger => ({
    ...ledger, ...entries
  }))
}

async function ledgerDrop(id) {
  if (!isWriter() || !(id in orderLedger())) return
  await updateLedger(ORDER_LEDGER, ledger => {
    if (!(id in ledger)) return null
    delete ledger[id]
    return ledger
  })
}

export function registerOrderLedger() {
  game.settings.register('sr5', ORDER_LEDGER, {
    scope: 'world',
    config: false,
    type: Object,
    default: {
    },
  })
  game.settings.register('sr5', USED_DEBITS, {
    scope: 'world',
    config: false,
    type: Object,
    default: {
    },
  })
}

// The debits that already stood behind ledger entries, kept after the entries go (a cancelled order
// leaves the ledger): a debit used once never stands behind a second purchase
export const USED_DEBITS = 'sr5ShopOrderDebits'

const PENDING_DEBITS = new Set()

function usedDebits() {
  try {
    return game.settings.get('sr5', USED_DEBITS) ?? {
    }
  } catch {
    return {
    }
  }
}

/**
 * What a cancellation moves: what the GM's ledger recorded at the sale, and
 * nothing else. The order on the sheet is its owner's writing, its amount,
 * quantity and source alike: an order missing from the ledger refunds nothing
 * (Zélia's review: a forged order of 1000 pieces was refunded at the catalogue's
 * price). The gamemaster refunds by hand what he wants beyond that. Only a
 * ledger entry names a vendor, and the vendor gives back from the cashbox that
 * took the money first, its accounts for the rest (what the cashbox could not
 * hold went there at the sale).
 */
export function cancelPlan(order, entry, cashboxFunds = 0) {
  const refund = entry ? Math.max(0, Number(entry.paid) || 0) : 0
  if (!entry?.vendorUuid) return {
    refund, vendorUuid: null, fromCashbox: 0, fromAccounts: 0
  }
  const fromCashbox = Math.min(refund, Math.max(0, Number(cashboxFunds) || 0))
  return {
    refund, vendorUuid: entry.vendorUuid, fromCashbox, fromAccounts: refund - fromCashbox
  }
}

/**
 * The search time of a line, from the test the card recorded (SR5 p. 420):
 * net hits divide the time of the table, a tie doubles it. No test found for
 * the line, or a line the test did not find: the time of the table.
 * Never a time sent by the player.
 */
export function testedHours(baseHours, result) {
  const base = Math.max(0, Number(baseHours) || 0)
  if (!result?.obtained) return base
  if (String(result.outcome).startsWith('tie')) return base * 2
  const net = Number(result.netHits)
  return net > 0 ? base / net : base
}

/**
 * The test of an availability card for a line: only a card the gamemaster rolled (every test is his,
 * shop-retry.js), for a buyer the requester owns. The outcome is the one his ledger froze when the card
 * appeared; the card itself only for a card the ledger missed.
 *
 * A card serves one purchase, for its own buyer (R2, Anton): it is read only inside the gamemaster's own
 * cashing of it, which holds a token no request carries. Cashed or not, a direct purchase naming it gets
 * the time of the table and no surcharge.
 * @param {object} [context]
 * @param {string} [context.buyerId] the actor being sold to: the card must have been rolled for it
 * @param {symbol} [context.cashToken] the token of the gamemaster's cashing of this card (openCashing)
 */
export function cardResult(messageId, uuid, userId, {
  buyerId = null, cashToken = null
} = {
}) {
  const message = messageId ? game.messages?.get(messageId) : null
  if (!message?.author?.isGM) return null
  if (buyerId && message.flags?.sr5shop?.buyerId !== buyerId) return null
  if (userId) {
    const user = game.users?.get(userId)
    if (!user || !(user.isGM || game.actors?.get(message.flags?.sr5shop?.buyerId)?.testUserPermission?.(user, 'OWNER'))) return null
  }
  let entry
  try {
    entry = game.settings.get('sr5', 'sr5ShopRetryLedger')?.[messageId]
  } catch {
    entry = undefined
  }
  // Every card is cashed by the gamemaster's cashCard, which holds the token: a messageId alone, cashed or
  // not, reads nothing, or one successful card would shorten any number of direct purchases (R2, Anton)
  if (!(cashToken && cashTokens.get(messageId) === cashToken)) return null
  if (Array.isArray(entry?.lines)) return entry.lines.find(l => l.uuid === uuid) ?? null
  return message.flags?.sr5shop?.results?.find(r => r.uuid === uuid) ?? null
}

// The cashings under way on the gamemaster's browser: a symbol cannot travel through a socket
const cashTokens = new Map()

/** The gamemaster starts cashing a card: the token lets its own checkout read the card it has marked cashed. */
export function openCashing(messageId) {
  const token = Symbol(messageId)
  cashTokens.set(messageId, token)
  return token
}

export function closeCashing(messageId) {
  cashTokens.delete(messageId)
}

/**
 * The surcharge a line was tested with (SR5 p. 420: "pour chaque tranche de 25 % du prix de l'objet que
 * l'acheteur est prêt à payer en plus"), in percent: the dice were bought with it, so the till charges it.
 * The gamemaster's ledger froze it when the card appeared (shop-retry.js), so a card edited afterwards does
 * not lower it; a card the ledger missed gives its own figure. No card for the line: none.
 */
export function cardSurcharge(messageId, uuid, userId, context = {
}) {
  if (!cardResult(messageId, uuid, userId, context)) return 0
  let frozen
  try {
    frozen = game.settings.get('sr5', 'sr5ShopRetryLedger')?.[messageId]?.surcharge
  } catch {
    frozen = undefined
  }
  const percent = Number(frozen ?? game.messages.get(messageId)?.flags?.sr5shop?.surcharge)
  return Number.isFinite(percent) && percent > 0 ? percent : 0
}

/** A unit price with its surcharge, rounded as the availability card rounds it. */
export function surchargedUnit(unit, percent) {
  return Math.round(Math.max(0, Number(unit) || 0) * (1 + Math.max(0, Number(percent) || 0) / 100))
}

/* -------------------------------------------- */

/** The gamemaster hands an order over: the goods reach the sheet, the order goes. */
export async function deliverOrder(actor, id) {
  if (!game.user.isGM || !actor) return false
  const order = ordersOf(actor).find(o => o.id === id)
  if (!order) {
    ui.notifications.warn(game.i18n.localize('SR5.WARN_ShopOrderGone'))
    return false
  }
  const source = await fromUuid(order.uuid)
  if (!source) {
    ui.notifications.warn(game.i18n.format('SR5.WARN_ShopItemGone', {
      name: order.name
    }))
    return false
  }
  const {
    SR5Shop
  } = await import('./shop.js')
  await removeOrder(actor, id)
  await ledgerDrop(id)
  await actor.createEmbeddedDocuments('Item', SR5Shop._itemPayload(source, order.quantity, order.grade))
  await tell(actor, 'SR5.ShopOrderDelivered', order)
  return true
}

/** The gamemaster cancels an order: everything paid comes back, express included. */
export async function cancelOrder(actor, id) {
  if (!game.user.isGM || !actor) return false
  const entry = orderLedger()[id]
  // A ledger entry belongs to one buyer: an order id copied onto another sheet refunds nothing of it
  if (entry && entry.actorUuid !== actor.uuid) return false
  const order = await removeOrder(actor, id)
  if (!order) return false
  const name = game.i18n.format('SR5.ShopOrderRefundOf', {
    name: ledgerLabel(order, entry)
  })
  const vendor = await vendorOf(entry)
  const plan = cancelPlan(order, entry, vendor?.cashbox ? creditFunds(vendor.cashbox) : 0)
  if (plan.refund > 0) {
    await actor.createEmbeddedDocuments('Item', [transaction('gain', plan.refund, name)])
    // The vendor gives back from the cashbox that took the money, then from its accounts
    if (vendor && plan.fromCashbox) await vendor.cashbox.update({
      'system.funds.value': creditFunds(vendor.cashbox) - plan.fromCashbox
    })
    if (vendor && plan.fromAccounts) await vendor.actor.createEmbeddedDocuments('Item', [transaction('loss', plan.fromAccounts, name)])
  }
  await ledgerDrop(id)
  await tell(actor, 'SR5.ShopOrderCancelled', {
    ...order, paid: plan.refund
  })
  return true
}

/* -------------------------------------------- */
/*  Orders of the shop without vendor            */
/* -------------------------------------------- */
// The shop without vendor runs on the buyer's browser: it debits her and writes her orders. The
// active GM enters them in the ledger at once (Élise's ruling after Zélia's review), from what he
// works out himself: the price of the catalogue's item, never one read on the request, and never
// more than the purchase she was debited, a loss transaction on her sheet used once.

/**
 * The ledger entries for a purchase, or null when it cannot be entered.
 * @param {object[]} priced [{order, paid}], `paid` worked out by the GM from the catalogue
 * @param {number} debited the amount of the purchase's loss transaction
 * @param {string} actorUuid the buyer
 * @param {string} transactionId that transaction, entered once
 */
export function registrationPlan(priced, debited, actorUuid, transactionId) {
  if (!priced.length || priced.some(line => !(line.paid >= 0))) return null
  const total = priced.reduce((sum, line) => sum + line.paid, 0)
  if (total > Math.max(0, Number(debited) || 0)) return null
  return Object.fromEntries(priced.map(({
    order, paid
  }) => [order.id, {
    actorUuid, paid, vendorUuid: null, name: order.name, quantity: order.quantity, uuid: order.uuid, transactionId,
  }]))
}

/** How long after its purchase a debit may stand behind its orders: the request follows it at once. */
export const DEBIT_FRESHNESS = 2 * 60 * 1000

/** Whether a debit created at `createdTime` (ms, set by the server) is the purchase being entered. */
export function debitIsFresh(createdTime, now) {
  const created = Number(createdTime)
  return Number.isFinite(created) && created > 0 && now - created >= -5000 && now - created <= DEBIT_FRESHNESS
}

/** What an order costs at the catalogue, read on the GM's browser: null when its item is gone. */
async function catalogueCost(order) {
  let source = null
  try {
    source = await fromUuid(order?.uuid ?? '')
  } catch {
    source = null
  }
  if (!source?.system) return null
  const {
    SR5Shop
  } = await import('./shop.js')
  const base = SR5Shop.gradedPrice(source.system, order.grade ?? null) * Math.max(1, Math.floor(Number(order.quantity) || 1))
  return base + (order.express ? expressCost(base, currentExpress()) : 0)
}

/**
 * Enter the orders of a purchase in the ledger, on the active GM's browser.
 * @param {Actor} actor the buyer
 * @param {string[]} ids the orders the purchase placed
 * @param {string} transactionId the loss transaction of the purchase
 * @param {User} requester who asks: an owner of the buyer
 */
export async function registerOrders(actor, ids, transactionId, requester) {
  if (!isWriter() || !actor || !requester) return false
  if (!requester.isGM && !actor.testUserPermission?.(requester, 'OWNER')) return false
  const ledger = orderLedger()
  const debit = actor.items?.get(transactionId)
  if (!debit || debit.type !== 'itemNuyen' || debit.system?.type !== 'loss') return false
  // The debit of this very purchase: created just now, by the server's clock (an older one, from
  // before the ledger kept the used debits, would stand behind a forged order)
  if (!debitIsFresh(debit._stats?.createdTime, Date.now())) return false
  // One purchase, one entry: a transaction already used stands behind nothing more
  const debitKey = `${actor.uuid}.${transactionId}`
  if (usedDebits()[debitKey] || Object.values(ledger).some(entry => entry?.transactionId === transactionId)) return false
  const orders = ordersOf(actor).filter(o => (ids ?? []).includes(o.id) && !(o.id in ledger))
  if (!orders.length) return false
  const priced = []
  for (const order of orders) {
    const paid = await catalogueCost(order)
    if (paid === null) return false
    priced.push({
      order, paid
    })
  }
  const entries = registrationPlan(priced, debit.system.amount, actor.uuid, transactionId)
  if (!entries) return false
  // Marked used first, with nothing awaited since the test: a second request arriving meanwhile finds it spent
  if (usedDebits()[debitKey] || PENDING_DEBITS.has(debitKey)) return false
  PENDING_DEBITS.add(debitKey)
  await updateLedger(USED_DEBITS, debits => ({
    ...debits, [debitKey]: true
  }))
  await ledgerOrders(entries)
  return true
}

/** The buyer's browser asks the active GM to enter its orders. */
export async function requestRegister(actor, orders, transactionId) {
  if (!orders.length || !transactionId) return
  const ids = orders.map(o => o.id)
  if (game.user.isGM) return registerOrders(actor, ids, transactionId, game.user)
  const {
    SR5_SocketHandler
  } = await import('../socket.js')
  await SR5_SocketHandler.emitForGM('shopOrderLedger', {
    actorUuid: actor.uuid, ids, transactionId
  })
}

/** The server stamps `senderId`: the GM checks who asks, and works the prices out himself. */
export async function socketRegister(message, senderId) {
  if (!isWriter()) return
  const actor = await fromUuid(message?.data?.actorUuid ?? '')
  await registerOrders(actor, message?.data?.ids, message?.data?.transactionId, game.users.get(senderId))
}

/** The line the GM is shown: the ledger's name and quantity when the order is in it, never the sheet's. */
export function ledgerLabel(order, entry) {
  if (!entry?.name) return lineLabel(order)
  const quantity = Math.max(1, Number(entry.quantity) || 1)
  return quantity > 1 ? `${entry.name} (x${quantity})` : entry.name
}

function creditFunds(item) {
  return Number(item?.system?.funds?.value ?? 0) || 0
}

/** The vendor of a ledger entry, its actor and its cashbox; never read from the player's flag. */
async function vendorOf(entry) {
  if (!entry?.vendorUuid) return null
  const actor = await fromUuid(entry.vendorUuid)
  if (!actor) return null
  const {
    SR5ShopVendor
  } = await import('./shop-vendor.js')
  const storage = actor.items?.get(entry.storageId)
  return {
    actor, cashbox: storage ? SR5ShopVendor.cashboxOf(actor, storage) : null, label: entry.vendorLabel ?? actor.name,
  }
}

/** A player asks; the gamemaster's browser asks the gamemaster. */
export async function requestCancel(actor, id) {
  if (game.user.isGM) return confirmCancel(actor, id, game.user)
  const {
    SR5_SocketHandler
  } = await import('../socket.js')
  await SR5_SocketHandler.emitForGM('shopOrderCancel', {
    actorUuid: actor.uuid, id
  })
  ui.notifications.info(game.i18n.localize('SR5.ShopOrderCancelAsked'))
}

async function confirmCancel(actor, id, requester) {
  const order = ordersOf(actor).find(o => o.id === id)
  if (!order) return false
  const entry = orderLedger()[id]
  const own = entry?.actorUuid === actor.uuid ? entry : null
  const plan = cancelPlan(order, own, 0)
  const vendor = plan.vendorUuid ? await vendorOf(entry) : null
  const esc = foundry.utils.escapeHTML
  const where = !own ? game.i18n.localize('SR5.ShopOrderCancelNotInLedger') : vendor ?
    game.i18n.format('SR5.ShopOrderCancelVendor', {
      vendor: esc(vendor.label)
    }) : game.i18n.localize('SR5.ShopOrderCancelNoVendor')
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: game.i18n.localize('SR5.ShopOrderCancelTitle')
    },
    content: `<p>${game.i18n.format('SR5.ShopOrderCancelText', {
      user: esc(requester?.name ?? '?'), actor: esc(actor.name),
      name: esc(ledgerLabel(order, own)), price: plan.refund.toLocaleString(),
    })}</p><p>${where}</p>`,
    rejectClose: false,
  })
  if (!ok) {
    if (!requester?.isGM) await tell(actor, 'SR5.ShopOrderCancelRefused', order)
    return false
  }
  return cancelOrder(actor, id)
}

/** The server stamps `senderId`: only an owner of the buyer may ask. */
export async function socketCancel(message, senderId) {
  if (!game.user.isGM) return
  const requester = game.users.get(senderId)
  const actor = await fromUuid(message?.data?.actorUuid ?? '')
  if (!requester || !actor?.testUserPermission?.(requester, 'OWNER')) return
  await confirmCancel(actor, message.data.id, requester)
}

/** The "On order" block of the sheet: what it shows. */
export function ordersForSheet(actor) {
  const fmt = (t) => game.time?.calendar?.format?.(t) ?? ''
  return ordersOf(actor).sort((a, b) => a.due - b.due).map(o => ({
    ...o, label: lineLabel(o), dueLabel: fmt(o.due), arrived: game.time.worldTime >= o.due,
    gm: game.user.isGM,
    cancelLabel: game.i18n.localize(game.user.isGM ? 'SR5.ShopOrderCancel' : 'SR5.ShopOrderAskCancel'),
  }))
}

/**
 * Bind the sheet's order buttons on this element, once per element: V13 draws
 * a new element when a sheet is closed and opened again, and a mark kept on
 * the sheet instance would leave the new one deaf (Quitterie's review).
 */
const boundElements = new WeakSet()
export function bindOrderClicks(element, handler) {
  if (!element || typeof element.addEventListener !== 'function' || boundElements.has(element)) return false
  boundElements.add(element)
  element.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-shop-order]')
    if (target) handler(event, target)
  })
  return true
}

/** The cancel button of the sheet: the gamemaster confirms at once, a player asks. */
export function cancelFromSheet(actor, id) {
  return game.user.isGM ? confirmCancel(actor, id, game.user) : requestCancel(actor, id)
}
