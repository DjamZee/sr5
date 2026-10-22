/**
 * The hooks through which a module of house rules (Câblage Maison, lot 2, 21/10) changes what the system does, on the
 * pattern of sr5.essenceCostFor (implant-essence.js): the system plays the book; a world whose house rule changes it
 * says so in a module, never in the system. Each hook hands its subscribers a data object to set; a value that is not
 * of the kind asked, or a subscriber that throws, leaves the book's. Without a module, no subscriber: the book.
 *
 * The subscribers are called one by one here (callSubscribers), never through Hooks.callAll: Foundry's callAll catches
 * a subscriber's error without throwing it again, so what it wrote before failing would be kept (relecture du 21/10, D1:
 * an Essence of 0.1 instead of 2, a sale at 1 ¥, a purchase on credit let through). Here, a subscriber that throws has
 * its answer thrown away, the others' kept: alone, the book.
 *
 * - sr5.rollReminders (information): lines shown in the roll dialog, each with an "applies" box left unticked, and on
 *   the card. A line may carry dice, added to the pool only when the box is ticked.
 * - sr5.vendorPrice (verdict): the unit price a vendor asks of a buyer, after the book's (surcharge, dealer).
 * - sr5.purchaseFunds (verdict): a purchase the buyer's accounts cannot pay, let through or refused (the book: refused).
 * - sr5.vendorRefusal (verdict): a vendor that will not sell to a buyer, with the reason shown (the book: it sells).
 * - sr5.initiativeReminders (information and score): lines written on the Initiative card, each with an Initiative
 *   score modifier applied at once (there is no dialog to tick it in).
 * - sr5.situationalArmor (score): Armor a module adds against one attack (a kinetic field against bullets), at the
 *   damage resistance test, before the AP and the conversion to Stun.
 */

export const ROLL_REMINDERS_HOOK = "sr5.rollReminders"
export const VENDOR_PRICE_HOOK = "sr5.vendorPrice"
export const PURCHASE_FUNDS_HOOK = "sr5.purchaseFunds"
export const VENDOR_REFUSAL_HOOK = "sr5.vendorRefusal"
export const INITIATIVE_REMINDERS_HOOK = "sr5.initiativeReminders"
export const SITUATIONAL_ARMOR_HOOK = "sr5.situationalArmor"

// What a module may write, at most: the lines a dialog shows, the length of a text, the dice of a reminder
export const MAX_REMINDERS = 10
export const MAX_NOTES = 5
export const MAX_TEXT = 200
export const MAX_REMINDER_DICE = 6
// The warning a module may ask the buyer to confirm before a purchase past the accounts (sr5.purchaseFunds)
export const MAX_WARNING = 500
// ...and the Initiative score one line of sr5.initiativeReminders may add or take
export const MAX_INITIATIVE_SCORE = 10
// ...and the Armor one line of sr5.situationalArmor may add
export const MAX_SITUATIONAL_ARMOR = 20

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

/** The fields of `data` named, as an object */
function pick(data, keys) {
  return Object.fromEntries(keys.map(key => [key, data[key]]))
}

/**
 * Call each subscriber of `hook` with `data`, as Hooks.callAll would (Hooks.events[hook], in order, a `once` one taken
 * off before it is called), but keeping the answer each subscriber leaves only when it does not throw: before each,
 * the fields named in `answers` (what the system reads back) are copied; a subscriber that throws gets them restored
 * and its error logged. False when that copy cannot be made and a subscriber threw: the caller then keeps the book.
 * @param {string} hook
 * @param {object} data the object handed to every subscriber, in turn
 * @param {string[]} answers the fields of `data` the system reads back
 * @param {object} [hooks] Foundry's Hooks (injected in the tests)
 * @returns {boolean}
 */
export function callSubscribers(hook, data, answers, hooks = globalThis.Hooks) {
  const entries = Array.from(hooks?.events?.[hook] ?? [])
  for (const entry of entries) {
    const fn = typeof entry === "function" ? entry : entry?.fn
    if (typeof fn !== "function") continue
    if (entry.once) hooks.off?.(hook, entry.id)
    const before = copyOf(pick(data, answers))
    try {
      const result = fn(data)
      // An async subscriber: its error comes later and is only logged; what it writes after its first await is too late
      if (typeof result?.then === "function") result.then(null, error => console.error(`SR5 | ${hook}: a subscriber failed`, error))
    } catch (error) {
      console.error(`SR5 | ${hook}: a subscriber failed, its answer thrown away`, error)
      if (!before) return false
      Object.assign(data, before)
    }
  }
  return true
}

/** Run the subscribers; false when the book must be kept */
function heard(hook, data, answers, hooks) {
  try {
    return callSubscribers(hook, data, answers, hooks)
  } catch (error) {
    console.error(`SR5 | ${hook}: the subscribers could not be called, the book kept`, error)
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
  hooks = globalThis.Hooks
} = {
}) {
  const data = {
    actor, rollData: copyOf(rollData), reminders: []
  }
  if (!heard(ROLL_REMINDERS_HOOK, data, ["reminders"], hooks) || !Array.isArray(data.reminders)) return []
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
  hooks = globalThis.Hooks
} = {
}) {
  const book = Number(price) || 0
  const data = {
    vendor, storage, buyer, item: copyOf(item), price: book, quantity, notes: []
  }
  if (!heard(VENDOR_PRICE_HOOK, data, ["price", "notes"], hooks)) return {
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
 * plain object, written on the purchase's debit (the ledger line), where the module finds its debt again. It may also
 * set `warning` to a text (500 characters at most) that the buyer's browser shows to confirm before paying, or before
 * the request goes to the vendor (confirmFundsWarning); without one, nothing is asked. Anything else than `true`
 * refuses, as the book does ("not enough nuyen"); `flags.sr5` is never written.
 * @returns {{allow: boolean, flags: object, warning: string}}
 */
export function purchaseFundsVerdict({
  buyer = null, total = 0, balance = 0, vendor = null, storage = null
} = {
}, {
  hooks = globalThis.Hooks
} = {
}) {
  const data = {
    buyer, total, balance, shortfall: Math.max(0, total - balance), vendor, storage, allow: false, flags: {
    }, warning: ""
  }
  if (!heard(PURCHASE_FUNDS_HOOK, data, ["allow", "flags", "warning"], hooks) || data.allow !== true) return {
    allow: false, flags: {
    }, warning: ""
  }
  const flags = {
  }
  if (isPlainObject(data.flags)) for (const [scope, value] of Object.entries(data.flags)) {
    if (scope === "sr5" || !isPlainObject(value)) continue
    const copy = copyOf(value)
    if (copy) flags[scope] = copy
  }
  const warning = typeof data.warning === "string" ? data.warning.trim().slice(0, MAX_WARNING) : ""
  return {
    allow: true, flags, warning
  }
}

/**
 * The buyer confirms the warning of a purchase let past the accounts (sr5.purchaseFunds), in their own browser. No
 * warning: true, nothing asked. `confirm` is DialogV2.confirm's shape (injected in the tests).
 */
export async function confirmFundsWarning(warning, {
  confirm = options => foundry.applications.api.DialogV2.confirm(options)
} = {
}) {
  if (!warning) return true
  const escape = text => globalThis.foundry?.utils?.escapeHTML?.(text) ?? String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
  return (await confirm({
    window: {
      title: game.i18n.localize("SR5.ShopFundsWarningTitle")
    },
    content: `<p>${escape(warning)}</p>`,
    rejectClose: false,
  })) === true
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
  hooks = globalThis.Hooks
} = {
}) {
  const data = {
    vendor, storage, buyer, refuse: false, reason: ""
  }
  if (!heard(VENDOR_REFUSAL_HOOK, data, ["refuse", "reason"], hooks) || data.refuse !== true) return {
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
  hooks = globalThis.Hooks
} = {
}) {
  const data = {
    actor, combatant, combat, round, firstRound: round <= 1, pass, roll, reminders: []
  }
  if (!heard(INITIATIVE_REMINDERS_HOOK, data, ["reminders"], hooks) || !Array.isArray(data.reminders)) return {
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

/** What sr5.situationalArmor tells a module of the attack, read from its card: what the hook may test, nothing more */
export function situationalAttackOf(card) {
  return {
    testType: card?.test?.type ?? "",
    category: card?.test?.typeSub ?? "",
    weaponType: card?.combat?.weaponType ?? "",
    ammoType: card?.combat?.ammo?.type ?? "",
    firingMode: card?.combat?.firingMode?.selected ?? "",
    isGrenade: !!card?.combat?.grenade?.isGrenade,
    element: card?.damage?.element ?? "",
    magical: card?.damage?.source === "magical",
    damageType: card?.damage?.type ?? "",
    damageValue: Number(card?.damage?.value) || 0,
    armorPenetration: Number(card?.combat?.armorPenetration) || 0,
  }
}

/**
 * sr5.situationalArmor — called at the damage resistance test of a character (physical damage, elemental or not),
 * before the AP is capped by the Armor (SR5 p. 171) and before the comparison that turns the damage to Stun (SR5 p.
 * 170), with `{actor, attack, card, armor, bonuses}`: `attack` what situationalAttackOf reads of the attack card
 * (`testType` the type of the card resisted: "defense" after a defense test, "attack" or "spell" without one, `category` "rangedWeapon", "meleeWeapon", "grenade"…, `weaponType` the weapon's type,
 * `ammoType`, `firingMode`, `isGrenade`, `element`, `magical`, `damageType`, `damageValue`, `armorPenetration`), `card`
 * a copy of the whole card, `armor` the character's Armor before it, `bonuses` an empty array. A subscriber pushes
 * `{label, source?, value}`: `label` the text ("Champ cinétique"), `value` an integer from 1 to 20, the Armor added
 * against this attack only. The system adds it to the Armor: dice of the resistance test, the AP cap, the conversion
 * to Stun. Up to 10 lines; a line without a label or a value is left out. Without a subscriber: the book, nothing.
 * Not asked when Run & Gun's armor penalty (world setting) has put the Armor into the attack test already.
 * @returns {{lines: Array<{label, source, value}>, value: number}}
 */
export function situationalArmorFor({
  actor = null, card = null, armor = 0
} = {
}, {
  hooks = globalThis.Hooks
} = {
}) {
  const data = {
    actor, attack: situationalAttackOf(card), card: copyOf(card), armor, bonuses: []
  }
  if (!heard(SITUATIONAL_ARMOR_HOOK, data, ["bonuses"], hooks) || !Array.isArray(data.bonuses)) return {
    lines: [], value: 0
  }
  const lines = []
  for (const line of data.bonuses) {
    if (lines.length >= MAX_REMINDERS) break
    const label = cleanText(line?.label)
    const value = Number(line?.value)
    if (!label || !Number.isInteger(value) || value < 1 || value > MAX_SITUATIONAL_ARMOR) continue
    lines.push({
      label, source: cleanText(line?.source), value
    })
  }
  return {
    lines, value: lines.reduce((sum, line) => sum + line.value, 0)
  }
}

/** An Initiative reminder as the card shows it, as text: "source: label (+2)" */
export function initiativeCardLine(line, colon = ": ") {
  return reminderCardLine({
    ...line, dice: line?.score
  }, colon)
}
