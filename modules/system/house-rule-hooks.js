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
 * - sr5.vendorRefusal (verdict): a vendor that will not sell to a buyer, with the reason shown (the book: it sells).
 * - sr5.initiativeReminders (information and score): lines written on the Initiative card, each with an Initiative
 *   score modifier applied at once (there is no dialog to tick it in).
 */

export const ROLL_REMINDERS_HOOK = "sr5.rollReminders"
export const VENDOR_PRICE_HOOK = "sr5.vendorPrice"
export const PURCHASE_FUNDS_HOOK = "sr5.purchaseFunds"
export const VENDOR_REFUSAL_HOOK = "sr5.vendorRefusal"
export const INITIATIVE_REMINDERS_HOOK = "sr5.initiativeReminders"

// What a module may write, at most: the lines a dialog shows, the length of a text, the dice of a reminder
export const MAX_REMINDERS = 10
export const MAX_NOTES = 5
export const MAX_TEXT = 200
export const MAX_REMINDER_DICE = 6
// ...and the Initiative score one line of sr5.initiativeReminders may add or take
export const MAX_INITIATIVE_SCORE = 10

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
 * What a shelf's row at a vendor's shows of sr5.vendorPrice (shop-window.js): nothing when the module left the book's
 * price (the row stays as it was), else the price asked, the book's to strike through and the notes, as one text.
 * @param {number} book the unit price the book makes for this buyer, as handed to the hook
 * @param {{price: number, notes: string[]}} asked what vendorPriceFor answered
 * @returns {{price?: number, bookPrice?: number, priceNotes?: string}}
 */
export function shelfPrice(book, asked) {
  if (!asked || asked.price === book) return {
  }
  return {
    price: asked.price, bookPrice: book, priceNotes: (asked.notes ?? []).join(" · ")
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

/**
 * sr5.vendorRefusal — called when a buyer is chosen at a vendor's window (the window then shows the reason and offers
 * no checkout) and again at the till on the gamemaster's browser, which refuses the sale, with `{vendor, storage,
 * buyer, refuse, reason}`: `vendor` the vendor's actor, `storage` its shop, `refuse` false, `reason` "". A subscriber
 * sets `refuse` to true to say "this vendor will not sell to this buyer", and `reason` to a short text shown to the
 * player or the gamemaster ("Les Ancients ne vendent pas aux Halloweeners"). Anything else than `true` sells, as the
 * book does; a subscriber that throws sells. Never asked in equip mode (the gamemaster hands items out). It must
 * answer the same on every browser: the window shows what the till will do.
 * A separate hook rather than a `refuse` field in sr5.vendorPrice: a refusal is the vendor's answer to a buyer, not
 * to a line, it must be known before the cart is filled, and a module that sets prices need not know about it.
 * @returns {{refuse: boolean, reason: string}}
 */
export function vendorRefusalFor({
  vendor = null, storage = null, buyer = null
} = {
}, {
  call = callAll
} = {
}) {
  const data = {
    vendor, storage, buyer, refuse: false, reason: ""
  }
  if (!heard(VENDOR_REFUSAL_HOOK, data, call) || data.refuse !== true) return {
    refuse: false, reason: ""
  }
  return {
    refuse: true, reason: cleanText(data.reason)
  }
}

/**
 * sr5.initiativeReminders — called for each combatant whose Initiative is rolled (every Combat Turn, srcombat.js
 * rollInitiative), before the card is written, with `{actor, combatant, combat, round, firstRound, pass, roll,
 * reminders}`: `round` the Combat Turn (1 for the first), `firstRound` round ≤ 1, `pass` the initiative pass, `roll`
 * the dice's total before any reminder, `reminders` an empty array. A subscriber pushes `{label, source?, score?}`:
 * `label` the text ("Trait — Sur ses gardes : +2 au premier tour"), `source` what it comes from, `score` an integer
 * from -10 to +10 added to the Initiative score at once (0 or none: a reminder only). A module that wants it on the
 * first Combat Turn only tests `firstRound`. The system adds the scores (never below 0), writes every line on the
 * Initiative card. Up to 10 lines; a line without a label is left out. Without a subscriber: the book's roll.
 * @returns {{lines: Array<{label, source, score}>, score: number}}
 */
export function initiativeRemindersFor({
  actor = null, combatant = null, combat = null, round = 0, pass = 1, roll = 0
} = {
}, {
  call = callAll
} = {
}) {
  const data = {
    actor, combatant, combat, round, firstRound: round <= 1, pass, roll, reminders: []
  }
  if (!heard(INITIATIVE_REMINDERS_HOOK, data, call) || !Array.isArray(data.reminders)) return {
    lines: [], score: 0
  }
  const lines = []
  for (const line of data.reminders) {
    if (lines.length >= MAX_REMINDERS) break
    const label = cleanText(line?.label)
    if (!label) continue
    const score = Number(line?.score)
    lines.push({
      label, source: cleanText(line?.source),
      score: Number.isInteger(score) && Math.abs(score) <= MAX_INITIATIVE_SCORE ? score : 0,
    })
  }
  return {
    lines, score: lines.reduce((sum, line) => sum + line.score, 0)
  }
}

/** An Initiative reminder as the card shows it, as text: "source: label (+2)" */
export function initiativeCardLine(line, colon = ": ") {
  return reminderCardLine({
    ...line, dice: line?.score
  }, colon)
}
