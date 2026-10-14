/**
 * The trace a purchase leaves (lot 12): one id shared by the debit and every
 * piece it paid for, with who bought, where, when and for how much. The shop,
 * a vendor's counter and an order delivered later all write it the same way,
 * in play as in creation, so the Concepteur's refund and the gamemaster's
 * summary read the purchase from the pieces themselves instead of matching
 * creation times (review 153: a vehicle's mods and their debit are two writes).
 *
 * flags.sr5.purchase = {
 *   id,          shared by the debit and the pieces
 *   buyer,       the actor who paid
 *   recipient,   the vehicle or drone the pieces went aboard, or null
 *   user,        the user who bought
 *   place,       'shop', 'vendor', 'creation' or 'equip'
 *   vendor,      the vendor's shop name, or null
 *   date,        real date and time (ISO)
 *   worldTime,   game time
 *   price,       what this document stands for: a piece's share, the debit's total
 * }
 */
export const PURCHASE_FLAG = 'purchase'

/** Foundry's random id, or one of the same shape where Foundry is not loaded (the tests). */
const newId = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

/** A new purchase's trace, without its price. */
export function purchaseStamp({
  buyer, recipient = null, userId, place, vendor = null, worldTime = 0, randomID = newId, now = new Date(),
}) {
  return {
    id: randomID(),
    buyer: buyer?.id ?? null,
    recipient: recipient?.id ?? null,
    user: userId ?? null,
    place,
    vendor: vendor || null,
    date: now.toISOString(),
    worldTime: Number(worldTime) || 0,
  }
}

/** Write the trace on documents' data, sharing `total` among them (the last takes what is left). */
export function stampAll(datas, stamp, total) {
  const list = datas ?? []
  let left = Math.max(0, Number(total) || 0)
  list.forEach((data, index) => {
    const share = index === list.length - 1 ? left : Math.floor((Number(total) || 0) / list.length)
    left -= share
    data.flags ??= {
    }
    data.flags.sr5 = {
      ...data.flags.sr5, [PURCHASE_FLAG]: {
        ...stamp, price: share
      }
    }
  })
  return list
}

/** The trace a document carries, or null. */
export function purchaseOf(doc) {
  const trace = doc?.flags?.sr5?.[PURCHASE_FLAG]
  return trace && typeof trace === 'object' && trace.id ? trace : null
}

/** A document's data without the trace: what a vendor puts on its counter is no longer anyone's purchase. */
export function withoutPurchase(data) {
  if (data?.flags?.sr5) delete data.flags.sr5[PURCHASE_FLAG]
  return data
}
