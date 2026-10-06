/**
 * A new availability test after a failure, SR5 p. 420: "En cas d'échec, il
 * est possible de réessayer après avoir attendu le double du délai de
 * recherche indiqué dans la table." A critical glitch gives no second chance.
 *
 * Nothing is read from the card but which line to try again: the gamemaster's
 * browser notes, in its own ledger, the world time a failed card appeared;
 * it recomputes the wait from the item's price, checks the requester owns the
 * buyer, and rolls the new test itself. The same searcher and contact look
 * again; the buyer may change the surcharge (arbitrage de DjamZ, 06/10). A
 * failure is retried once; the new card's failure starts a new wait. The shop
 * itself never forbids testing again: the gamemaster judges (DjamZ, 06/10).
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
 * Why a new test is refused, or null when it may go.
 * @param {object} p
 * @param {{time: number, used: string[]}|undefined} p.entry the ledger's entry for the card
 * @param {number} p.now the world time
 * @param {number} p.waitHours the wait, recomputed by the gamemaster
 * @param {string} p.uuid the line
 */
export function retryRefusal({
  entry, now, waitHours, uuid
}) {
  if (!entry || !Number.isFinite(Number(entry.time))) return 'unknown'
  if ((entry.used ?? []).includes(uuid)) return 'used'
  if (Number(now) < Number(entry.time) + waitHours * HOUR) return 'early'
  return null
}

/** The world time the new test may be rolled at. */
export function retryAt(entry, waitHours) {
  return Number(entry?.time) + waitHours * HOUR
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

/** A card with a failed line appears: the active gamemaster notes the world time, once. */
export async function recordFailedCard(message) {
  if (!isWriter()) return
  const results = message?.flags?.sr5shop?.results
  if (!Array.isArray(results) || !results.some(r => r?.outcome === 'failure')) return
  if (retryLedger()[message.id]) return
  await writeLedger(message.id, {
    time: game.time.worldTime, used: []
  })
}

export function registerRetryLedger() {
  game.settings.register('sr5', RETRY_LEDGER, {
    scope: 'world',
    config: false,
    type: Object,
    default: {
    },
  })
  Hooks.on('createChatMessage', message => recordFailedCard(message))
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

/** The server stamps `senderId`; only the active gamemaster rolls. */
export async function socketRetry(message, senderId) {
  if (!isWriter()) return
  await rollRetry(message?.data ?? {
  }, senderId)
}

async function refuse(userId, key, data = {
}) {
  const text = game.i18n.format(key, data)
  if (userId === game.user.id) return ui.notifications.warn(text)
  await foundry.documents.ChatMessage.create({
    content: `<p>${foundry.utils.escapeHTML(text)}</p>`, whisper: [userId, game.user.id],
  })
}

/** What the vendor gives the test, as the shop window gives it (lot C). */
async function vendorOptions(vendor) {
  if (!vendor?.uuid) return {
  }
  const {
    SR5ShopVendor, SR5ShopVendorSource
  } = await import('./shop-vendor.js')
  const source = new SR5ShopVendorSource({
    uuid: vendor.uuid
  }, {
    id: vendor.storageId
  })
  const actor = source.actor
  if (!actor || !source.storage) return null
  return {
    searcher: actor, margin: source.shop.margin,
    searcherContact: SR5ShopVendor.searcherOf(actor, source.storage).contact,
    vendor: {
      uuid: vendor.uuid, storageId: vendor.storageId
    },
  }
}

export async function rollRetry({
  messageId, uuid, surcharge
}, senderId) {
  const requester = game.users.get(senderId)
  const message = game.messages.get(messageId)
  const data = message?.flags?.sr5shop
  const line = data?.results?.find(r => r?.uuid === uuid)
  const buyer = data ? game.actors.get(data.buyerId) : null
  // The requester must own the buyer: a card names any actor
  if (!requester || !buyer || !line || !(requester.isGM || buyer.testUserPermission(requester, 'OWNER'))) return false
  if (line.outcome !== 'failure') return false
  const source = await fromUuid(uuid)
  if (!source) return false

  // The same searcher: the vendor of the card, or the buyer's own contact, nobody else's
  const options = await vendorOptions(data.vendor)
  if (options === null) return false
  const contact = data.vendor ? null : buyer.items.get(data.contactId ?? '')
  const searchingContact = contact?.type === 'itemContact' ? contact : null

  // The wait is recomputed from the item, never read on the card
  const {
    SR5Shop
  } = await import('./shop.js')
  const {
    SR5ShopCatalog
  } = await import('./shop-catalog.js')
  const grade = SR5Shop.gradesFor(source.type, source.system).includes(line.grade) ? line.grade : null
  const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1))
  const listed = SR5ShopCatalog.describe({
    type: source.type, system: source.system, margin: options.margin
  }, grade).price
  const waitHours = retryWaitHours(SR5ShopAvailability.delayFor(listed * quantity))
  const entry = retryLedger()[messageId]
  const reason = retryRefusal({
    entry, now: game.time.worldTime, waitHours, uuid
  })
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
    uuid, quantity, name: line.name, grade,
  }], Math.max(0, Number(surcharge) || 0), options)
  return true
}
