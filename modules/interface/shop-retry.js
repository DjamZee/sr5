/**
 * A new availability test after a failure, SR5 p. 420: "En cas d'échec, il
 * est possible de réessayer après avoir attendu le double du délai de
 * recherche indiqué dans la table." A critical glitch gives no second chance.
 *
 * The card is only a request. When an availability card appears, the active
 * gamemaster's browser writes in its own ledger the world time, the surcharge,
 * and the lines that failed, counted again from the dice on the card, never
 * from their label: a card edited afterwards changes nothing, and a card the
 * ledger never saw is refused. At the click, the gamemaster recomputes the
 * wait from the item's price, checks the requester owns the buyer and, at a
 * vendor's, that the shop is open and the item under its ceiling, then rolls
 * the new test itself. The same searcher and contact look again; the buyer may
 * change the surcharge (arbitrage de DjamZ, 06/10). A failure is retried once.
 * The shop itself never forbids testing again: the gamemaster judges (DjamZ, 06/10).
 *
 * A card the gamemaster rolled cannot be edited by the player, so it is cashed
 * by the gamemaster: marked cashed in the ledger before any money moves, once.
 */
import {
  SR5ShopAvailability
} from './shop-availability.js'

export const RETRY_LEDGER = 'sr5ShopRetryLedger'
const HOUR = 3600

/* -------------------------------------------- */
/*  Pure rules                                  */
/* -------------------------------------------- */

/** The wait before a new test: twice the time of the table. */
export function retryWaitHours(tableHours) {
  return 2 * Math.max(0, Number(tableHours) || 0)
}

/**
 * The outcome of a line, from its dice (SR5 p. 47 and p. 420): a critical
 * glitch is more than half ones and no hit; otherwise the hits, capped by the
 * limit, against the availability's hits. Null without dice to count.
 */
export function outcomeFromDice(line, limit = 0) {
  const faces = line?.faces, against = line?.oppositionFaces
  if (!Array.isArray(faces) || !faces.length || !Array.isArray(against)) return null
  const n = v => Number(v)
  const hits = faces.filter(f => n(f) >= 5).length
  const ones = faces.filter(f => n(f) === 1).length
  if (ones * 2 > faces.length && hits === 0) return 'criticalGlitch'
  const capped = Number(limit) > 0 ? Math.min(hits, Number(limit)) : hits
  const net = capped - against.filter(f => n(f) >= 5).length
  return net > 0 ? 'success' : net === 0 ? 'tie' : 'failure'
}

/** What the ledger keeps of a card when it appears. */
export function cardEntry(data, time) {
  const failed = (data?.results ?? []).filter(r => r && outcomeFromDice(r, data.limit) === 'failure')
    .map(r => ({
      uuid: String(r.uuid), quantity: Math.max(1, Math.floor(Number(r.quantity) || 1)), grade: r.grade ?? null
    }))
  return {
    time, surcharge: Math.max(0, Number(data?.surcharge) || 0), failed, used: [], cashed: false
  }
}

/**
 * Why a new test is refused, or null when it may go.
 * @param {object} p
 * @param {object|undefined} p.entry the ledger's entry for the card
 * @param {number} p.now the world time
 * @param {number} p.waitHours the wait, recomputed by the gamemaster
 * @param {string} p.uuid the line
 */
export function retryRefusal({
  entry, now, waitHours, uuid
}) {
  if (!entry || !Number.isFinite(Number(entry.time))) return 'unknown'
  if (!(entry.failed ?? []).some(l => l.uuid === uuid)) return 'notFailed'
  if ((entry.used ?? []).includes(uuid)) return 'used'
  if (Number(now) < Number(entry.time) + waitHours * HOUR) return 'early'
  return null
}

/** The world time the new test may be rolled at. */
export function retryAt(entry, waitHours) {
  return Number(entry?.time) + waitHours * HOUR
}

/** At a vendor's: closed, or the item over its availability ceiling. */
export function vendorRefusal(shop, availability, byGM = false) {
  if (!shop) return 'vendorGone'
  if (!shop.isOpen && !byGM) return 'vendorClosed'
  if (Number(shop.maxAvailability) > 0 && Number(availability) > Number(shop.maxAvailability)) return 'vendorCeiling'
  return null
}

/* -------------------------------------------- */
/*  The gamemaster's ledger                     */
/* -------------------------------------------- */

function isWriter() {
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

export function retryLedger() {
  try {
    return game.settings.get('sr5', RETRY_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

async function writeLedger(id, entry) {
  if (!isWriter()) return
  await game.settings.set('sr5', RETRY_LEDGER, {
    ...retryLedger(), [id]: entry
  })
}

/** An availability card appears: the active gamemaster writes what it is worth, once. */
export async function recordShopCard(message) {
  if (!isWriter()) return
  const data = message?.flags?.sr5shop
  if (!data || !Array.isArray(data.results) || retryLedger()[message.id]) return
  await writeLedger(message.id, cardEntry(data, game.time.worldTime))
}

export function registerRetryLedger() {
  game.settings.register('sr5', RETRY_LEDGER, {
    scope: 'world',
    config: false,
    type: Object,
    default: {
    },
  })
  Hooks.on('createChatMessage', message => recordShopCard(message))
}

/* -------------------------------------------- */
/*  Asking and rolling                          */
/* -------------------------------------------- */

/** The click on "New test": the buyer may change the surcharge, then the gamemaster rolls. */
export async function requestRetry(message, uuid) {
  const data = message?.flags?.sr5shop
  if (!data) return
  const surcharge = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.localize('SR5.ShopRetryTitle')
    },
    content: `<p>${game.i18n.localize('SR5.ShopRetryText')}</p>
      <div class="form-group"><label>${game.i18n.localize('SR5.ShopSurcharge')}</label>
      <input type="number" name="surcharge" min="0" step="1" value="${Math.max(0, Number(data.surcharge) || 0)}"></div>`,
    ok: {
      callback: (event, button) => Number(button.form.elements.surcharge.value) || 0
    },
    rejectClose: false,
  })
  if (surcharge === null || surcharge === undefined) return
  const payload = {
    messageId: message.id, uuid, surcharge
  }
  if (game.user.isGM) return rollRetry(payload, game.user.id)
  const {
    SR5_SocketHandler
  } = await import('../socket.js')
  await SR5_SocketHandler.emitForGM('shopAvailabilityRetry', payload)
}

/** The server stamps `senderId`; only the active gamemaster rolls or cashes. */
export async function socketRetry(message, senderId) {
  if (!isWriter()) return
  const data = message?.data ?? {
  }
  if (data.cash) return cashCard(data, senderId)
  await rollRetry(data, senderId)
}

async function refuse(userId, key, data = {
}) {
  const text = game.i18n.format(key, data)
  if (userId === game.user.id) return ui.notifications.warn(text)
  await foundry.documents.ChatMessage.create({
    content: `<p>${foundry.utils.escapeHTML(text)}</p>`, whisper: [userId, game.user.id],
  })
}

/** The vendor of a card, read again: its actor, its shop's settings, what it gives the test (lot C). */
async function vendorOf(vendor) {
  const {
    SR5ShopVendor
  } = await import('./shop-vendor.js')
  const resolved = SR5ShopVendor.resolve(vendor.uuid, vendor.storageId)
  if (!resolved) return null
  const {
    shopSettings
  } = await import('./shop-vendor-rules.js')
  const shop = shopSettings(resolved.storage)
  return {
    shop,
    options: {
      searcher: resolved.actor, margin: shop.margin,
      searcherContact: SR5ShopVendor.searcherOf(resolved.actor, resolved.storage).contact,
      vendor: {
        uuid: vendor.uuid, storageId: vendor.storageId
      },
    },
  }
}

export async function rollRetry({
  messageId, uuid, surcharge
}, senderId) {
  const requester = game.users.get(senderId)
  const message = game.messages.get(messageId)
  const data = message?.flags?.sr5shop
  const buyer = data ? game.actors.get(data.buyerId) : null
  // The requester must own the buyer: a card names any actor
  if (!requester || !buyer || !(requester.isGM || buyer.testUserPermission(requester, 'OWNER'))) return false
  // What failed is the ledger's, written when the card appeared; the card's labels are never read
  const entry = retryLedger()[messageId]
  const line = entry?.failed?.find(l => l.uuid === uuid)
  const source = await fromUuid(String(uuid))
  if (!source) return false

  // The same searcher: the vendor of the card, or the buyer's own contact, nobody else's
  const vendor = data.vendor?.uuid ? await vendorOf(data.vendor) : null
  const contact = data.vendor ? null : buyer.items.get(data.contactId ?? '')
  const searchingContact = contact?.type === 'itemContact' ? contact : null

  // The wait is recomputed from the item, never read on the card
  const {
    SR5Shop
  } = await import('./shop.js')
  const {
    SR5ShopCatalog
  } = await import('./shop-catalog.js')
  const grade = line && SR5Shop.gradesFor(source.type, source.system).includes(line.grade) ? line.grade : null
  const quantity = line?.quantity ?? 1
  const described = SR5ShopCatalog.describe({
    type: source.type, system: source.system, margin: vendor?.shop.margin
  }, grade)
  const waitHours = retryWaitHours(SR5ShopAvailability.delayFor(described.price * quantity))
  const reason = retryRefusal({
    entry, now: game.time.worldTime, waitHours, uuid
  }) ?? (data.vendor ? vendorRefusal(vendor?.shop, described.availability, requester.isGM) : null)
  if (reason) {
    await refuse(requester.id, `SR5.ShopRetryRefused_${reason}`, {
      name: source.name, date: reason === 'early' ? game.time?.calendar?.format?.(retryAt(entry, waitHours)) ?? '' : '',
    })
    return false
  }
  await writeLedger(messageId, {
    ...entry, used: [...(entry.used ?? []), uuid]
  })
  await SR5ShopAvailability.testLines(buyer, searchingContact, [{
    uuid, quantity, name: source.name, grade,
  }], Math.max(0, Number(surcharge) || 0), vendor?.options ?? {
  })
  return true
}

/* -------------------------------------------- */
/*  Cashing a card the gamemaster rolled        */
/* -------------------------------------------- */

/** The checkout button of a card written by the gamemaster: the gamemaster cashes it. */
export async function requestCash(message, express) {
  const payload = {
    cash: true, messageId: message.id, express: !!express
  }
  if (game.user.isGM) return cashCard(payload, game.user.id)
  const {
    SR5_SocketHandler
  } = await import('../socket.js')
  await SR5_SocketHandler.emitForGM('shopAvailabilityRetry', payload)
  return false
}

// Two clicks reach the gamemaster before the ledger is written: the first one holds the card
const cashing = new Set()

export async function cashCard({
  messageId, express
}, senderId) {
  if (!isWriter() || cashing.has(messageId)) return false
  cashing.add(messageId)
  try {
    const requester = game.users.get(senderId)
    const message = game.messages.get(messageId)
    const data = message?.flags?.sr5shop
    const buyer = data ? game.actors.get(data.buyerId) : null
    if (!requester || !message?.author?.isGM || !buyer || !(requester.isGM || buyer.testUserPermission(requester, 'OWNER'))) return false
    const entry = retryLedger()[messageId] ?? cardEntry(data, game.time.worldTime)
    if (entry.cashed) {
      await refuse(requester.id, 'SR5.ShopAlreadyCashed')
      return false
    }
    // Written before any money moves: a second request finds the card cashed
    await writeLedger(messageId, {
      ...entry, cashed: true
    })
    const lines = data.results.filter(r => r.obtained).map(r => ({
      uuid: r.uuid, quantity: r.quantity, name: r.name, grade: r.grade,
    }))
    let bought
    if (data.vendor) {
      const {
        SR5ShopVendor
      } = await import('./shop-vendor.js')
      bought = await SR5ShopVendor.sell({
        vendorUuid: data.vendor.uuid, storageId: data.vendor.storageId, buyerId: buyer.id, lines, express: !!express, messageId,
      }, senderId)
    } else {
      const {
        SR5Shop
      } = await import('./shop.js')
      bought = await SR5Shop.checkout(buyer, lines, {
        express: !!express, messageId, userId: senderId
      })
    }
    if (!bought) {
      // Nothing was sold (no money, a line gone): the card may be cashed again
      await writeLedger(messageId, {
        ...entry, cashed: false
      })
      return false
    }
    await message.update({
      content: message.content.replace(
        /<footer class="sr-shop-card-footer">[\s\S]*?<\/footer>/,
        `<footer class="sr-shop-card-footer"><span class="sr-shop-cashed">${
          game.i18n.localize('SR5.ShopAlreadyCashed')}</span></footer>`),
    })
    return true
  } finally {
    cashing.delete(messageId)
  }
}
