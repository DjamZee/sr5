/**
 * The hooks through which a module of house rules (Câblage Maison, lot 2, 21/10) changes what the system does, on the
 * pattern of sr5.essenceCostFor (implant-essence.js): the system plays the book; a world whose house rule changes it
 * says so in a module, never in the system. Each hook hands its subscribers a data object to set; a value that is not
 * of the kind asked, or a subscriber that throws, leaves the book's. Without a module, no subscriber: the book.
 *
 * - sr5.rollReminders (information): lines shown in the roll dialog, each with an "applies" box left unticked, and on
 *   the card. A line may carry dice, added to the pool only when the box is ticked.
 * - sr5.vendorPrice (verdict): the unit price a vendor asks of a buyer, after the book's (surcharge, dealer).
 * - sr5.purchaseFunds (verdict): a purchase the buyer's accounts cannot pay, let through or refused (the book: refused).
 */

export const ROLL_REMINDERS_HOOK = "sr5.rollReminders"
export const VENDOR_PRICE_HOOK = "sr5.vendorPrice"
export const PURCHASE_FUNDS_HOOK = "sr5.purchaseFunds"

// What a module may write, at most: the lines a dialog shows, the length of a text, the dice of a reminder
export const MAX_REMINDERS = 10
export const MAX_NOTES = 5
export const MAX_TEXT = 200
export const MAX_REMINDER_DICE = 6

const callAll = (hook, data) => globalThis.Hooks?.callAll(hook, data)

/** A copy the subscriber may change without touching what the system goes on with */
function copyOf(value) {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value ?? null))
    } catch {
      return null
    }
  }
}

/** Run the subscribers; false when one threw (the book is then kept) */
function heard(hook, data, call) {
  try {
    call(hook, data)
    return true
  } catch (error) {
    console.error(`SR5 | ${hook}: a subscriber failed, ignored`, error)
    return false
  }
}

/** A text a module wrote, trimmed and cut, or "" */
export function cleanText(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : ""
}

const isPlainObject = value => !!value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype

/**
 * sr5.rollReminders — called as the roll dialog opens, with `{actor, rollData, reminders}`: `rollData` a copy of the
 * test about to be rolled, `reminders` an empty array. A subscriber pushes `{label, source?, dice?}`: `label` the text
 * of the reminder ("+1 dé si la cible l'a blessé dans la scène"), `source` what it comes from ("Trait — Vindicatif"),
 * `dice` an integer from -6 to +6 added to the pool if the player ticks "applies" (0 or none: a reminder only).
 * The system shows them, never applies one unticked. Up to 10 lines; a line without a label is left out.
 * @returns {Array<{id, label, source, dice, applied}>}
 */
export function rollRemindersFor(actor, rollData, {
  call = callAll
} = {
}) {
  const data = {
    actor, rollData: copyOf(rollData), reminders: []
  }
  if (!heard(ROLL_REMINDERS_HOOK, data, call) || !Array.isArray(data.reminders)) return []
  const out = []
  for (const line of data.reminders) {
    if (out.length >= MAX_REMINDERS) break
    const label = cleanText(line?.label)
    if (!label) continue
    const dice = Number(line?.dice)
    out.push({
      id: `r${out.length}`, label, source: cleanText(line?.source),
      dice: Number.isInteger(dice) && Math.abs(dice) <= MAX_REMINDER_DICE ? dice : 0, applied: false,
    })
  }
  return out
}

/** The type of the dice pool modifier a ticked reminder adds (roll-dialog.js) */
export function reminderModifierType(id) {
  return `reminder_${id}`
}

/** A reminder as the card shows it, as text: "source: label (+1)"; `colon` the language's own (SR5.Colons) */
export function reminderCardLine(reminder, colon = ": ") {
  const dice = reminder?.dice ? ` (${reminder.dice > 0 ? "+" : ""}${reminder.dice})` : ""
  return `${reminder?.source ? `${reminder.source}${colon}` : ""}${reminder?.label ?? ""}${dice}`
}

/**
 * sr5.vendorPrice — called wherever a vendor's price is counted (the cart of the vendor's window and the till on the
 * gamemaster's browser), with `{vendor, storage, buyer, item, price, quantity, notes}`: `vendor` the vendor's actor,
 * `storage` its shop, `item` a copy of the line `{type, name, system, grade, uuid}`, `price` the unit price the book
 * makes (surcharge and dealer included), `notes` an empty array. A subscriber sets `price` (a finite number ≥ 0, rounded
 * to the nuyen) and may push short texts into `notes`, written on the sale's chat card. It must answer the same on
 * every browser: the cart shows what the till will take. Without a subscriber: the book's price, no note.
 * @returns {{price: number, notes: string[]}}
 */
export function vendorPriceFor({
  vendor = null, storage = null, buyer = null, item = null, price = 0, quantity = 1
} = {
}, {
  call = callAll
} = {
}) {
  const book = Number(price) || 0
  const data = {
    vendor, storage, buyer, item: copyOf(item), price: book, quantity, notes: []
  }
  if (!heard(VENDOR_PRICE_HOOK, data, call)) return {
    price: book, notes: []
  }
  const value = data.price
  const ok = typeof value === "number" && Number.isFinite(value) && value >= 0
  const notes = Array.isArray(data.notes) ? data.notes.map(cleanText).filter(Boolean).slice(0, MAX_NOTES) : []
  return {
    price: ok ? Math.round(value) : book, notes
  }
}

/**
 * sr5.purchaseFunds — called when a purchase costs more than the buyer's accounts hold (never for a credstick, which
 * pays only what it carries, nor a free purchase), with `{buyer, total, balance, shortfall, vendor, storage, allow,
 * flags}`: `vendor` and `storage` null in the world's shop, `allow` false, `flags` an empty object. A subscriber sets
 * `allow` to true to let the purchase go (the accounts then go below zero), and may set `flags.<its module id>` to a
 * plain object, written on the purchase's debit (the ledger line), where the module finds its debt again. Anything else
 * than `true` refuses, as the book does ("not enough nuyen"); `flags.sr5` is never written.
 * @returns {{allow: boolean, flags: object}}
 */
export function purchaseFundsVerdict({
  buyer = null, total = 0, balance = 0, vendor = null, storage = null
} = {
}, {
  call = callAll
} = {
}) {
  const data = {
    buyer, total, balance, shortfall: Math.max(0, total - balance), vendor, storage, allow: false, flags: {
    }
  }
  if (!heard(PURCHASE_FUNDS_HOOK, data, call) || data.allow !== true) return {
    allow: false, flags: {
    }
  }
  const flags = {
  }
  if (isPlainObject(data.flags)) for (const [scope, value] of Object.entries(data.flags)) {
    if (scope === "sr5" || !isPlainObject(value)) continue
    const copy = copyOf(value)
    if (copy) flags[scope] = copy
  }
  return {
    allow: true, flags
  }
}
