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
  await actor.createEmbeddedDocuments('Item', SR5Shop._itemPayload(source, order.quantity, order.grade))
  await tell(actor, 'SR5.ShopOrderDelivered', order)
  return true
}

/** The gamemaster cancels an order: everything paid comes back, express included. */
export async function cancelOrder(actor, id) {
  if (!game.user.isGM || !actor) return false
  const order = await removeOrder(actor, id)
  if (!order) return false
  const name = game.i18n.format('SR5.ShopOrderRefundOf', {
    name: lineLabel(order)
  })
  if (order.paid > 0) {
    await actor.createEmbeddedDocuments('Item', [transaction('gain', order.paid, name)])
    // At a vendor's, the money it took goes back out of its accounts
    const vendor = order.vendor?.uuid ? await fromUuid(order.vendor.uuid) : null
    if (vendor?.createEmbeddedDocuments) await vendor.createEmbeddedDocuments('Item', [transaction('loss', order.paid, name)])
  }
  await tell(actor, 'SR5.ShopOrderCancelled', order)
  return true
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
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: game.i18n.localize('SR5.ShopOrderCancelTitle')
    },
    content: `<p>${game.i18n.format('SR5.ShopOrderCancelText', {
      user: foundry.utils.escapeHTML(requester?.name ?? '?'), actor: foundry.utils.escapeHTML(actor.name),
      name: foundry.utils.escapeHTML(lineLabel(order)), price: Number(order.paid).toLocaleString(),
    })}</p>`,
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

/** The cancel button of the sheet: the gamemaster confirms at once, a player asks. */
export function cancelFromSheet(actor, id) {
  return game.user.isGM ? confirmCancel(actor, id, game.user) : requestCancel(actor, id)
}
